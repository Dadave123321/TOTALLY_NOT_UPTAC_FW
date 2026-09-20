import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { serviceClient } from '../../../lib/supabaseServer';
import {
  CATEGORIES,
  IMAGE_BUCKET,
  IMAGE_MAX_SIDE,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_SIGN_AS_LENGTH,
} from '../../../lib/config';
import { formatPostNumber, parsePostNumber } from '../../../lib/format';

export const dynamic = 'force-dynamic';

// Things that make a message worth a second look in the dashboard.
// They only add a label. They never block or delay a message.
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ph|io|me|ly|gg)\b)/i;
const PHONE_RE = /(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/;

// Asks Cloudflare whether the person really passed the check.
// We deliberately do NOT send the visitor's IP address.
async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

// (\u0000 would make the database reject the message.)
function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : '';
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('That request was not valid. Refresh the page and try again.');
  }

  const message = clean(form.get('message'));
  const signAs = clean(form.get('signAs'));
  const replyRaw = clean(form.get('replyTo'));
  const rawCategory = clean(form.get('category'));
  const category = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'Other';
  const token = clean(form.get('turnstileToken'));

  const upload = form.get('image');
  const hasImage = upload !== null && typeof upload !== 'string' && upload.size > 0;

  if (!message && !hasImage) return bad('Write a message or add a picture first.');
  if (message.length > MAX_MESSAGE_LENGTH) {
    return bad(`Your message is ${message.length} characters. The limit is ${MAX_MESSAGE_LENGTH}.`);
  }
  if (signAs.length > MAX_SIGN_AS_LENGTH) {
    return bad(`The name is too long. The limit is ${MAX_SIGN_AS_LENGTH} characters.`);
  }
  if (hasImage && upload.size > MAX_IMAGE_UPLOAD_BYTES) {
    return bad('That picture is too big. Try a smaller one.');
  }
  if (!(await verifyTurnstile(token))) {
    return bad('The "are you human" check failed. Wait a moment and try again.');
  }

  const db = serviceClient();

  // ----- Replying to another post? It must exist and be live. -----
  let replyTo: number | null = null;
  if (replyRaw) {
    replyTo = parsePostNumber(replyRaw);
    if (replyTo === null) {
      return bad(`"${replyRaw}" is not a post number. It should look like ${formatPostNumber(42)}.`);
    }
    const { data: target } = await db
      .from('submissions')
      .select('id')
      .eq('post_number', replyTo)
      .eq('status', 'posted')
      .maybeSingle();
    if (!target) {
      return bad(`${formatPostNumber(replyTo)} is not on the wall. Check the number.`);
    }
  }

  // ----- Picture: check it is really a picture, shrink it, strip hidden data -----
  let imagePath: string | null = null;
  if (hasImage) {
    let jpeg: Buffer;
    try {
      jpeg = await sharp(Buffer.from(await upload.arrayBuffer()))
        .rotate() // apply the phone's rotation flag, then metadata is dropped below
        .resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }) // sharp removes EXIF/GPS data unless told to keep it
        .toBuffer();
    } catch {
      return bad('That file is not a picture we can read. Use a JPG, PNG, or WebP.');
    }

    const path = `${randomUUID()}.jpg`;
    const { error: uploadError } = await db.storage
      .from(IMAGE_BUCKET)
      .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      console.error('submit: picture upload failed:', uploadError.message);
      return bad('Could not save your picture. Try again in a minute.', 500);
    }
    imagePath = path;
  }

  // ----- Flags (informational only) -----
  const flags: string[] = [];
  if (LINK_RE.test(message)) flags.push('link');
  if (PHONE_RE.test(message)) flags.push('phone');

  const { data: words } = await db.from('flagged_words').select('word');
  const lower = message.toLowerCase();
  if (words?.some((w: { word: string }) => lower.includes(w.word))) flags.push('word_list');

  // Only these columns are saved. No IP, no user agent, no email.
  // Picture posts wait in "review"; text-only posts go straight to the queue.
  const { error } = await db.from('submissions').insert({
    message,
    category,
    sign_as: signAs || null,
    flags,
    reply_to: replyTo,
    image_path: imagePath,
    status: imagePath ? 'review' : 'queued',
  });

  if (error) {
    // Log the reason only, never the message text.
    console.error('submit: insert failed:', error.message);
    if (imagePath) await db.storage.from(IMAGE_BUCKET).remove([imagePath]);
    return bad('Something went wrong on our side. Try again in a minute.', 500);
  }

  return Response.json({ ok: true, needsReview: Boolean(imagePath) });
}
