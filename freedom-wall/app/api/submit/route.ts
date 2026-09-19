import { serviceClient } from '../../../lib/supabaseServer';
import { CATEGORIES, MAX_MESSAGE_LENGTH, MAX_SIGN_AS_LENGTH } from '../../../lib/config';

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

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad('That request was not valid. Refresh the page and try again.');
  }

  // Clean up input. (\u0000 would make the database reject the message.)
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : '');
  const message = clean(body.message);
  const signAs = clean(body.signAs);
  const category = (CATEGORIES as readonly string[]).includes(body.category as string)
    ? (body.category as string)
    : 'Other';
  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';

  if (!message) return bad('Write a message first.');
  if (message.length > MAX_MESSAGE_LENGTH) {
    return bad(`Your message is ${message.length} characters. The limit is ${MAX_MESSAGE_LENGTH}.`);
  }
  if (signAs.length > MAX_SIGN_AS_LENGTH) {
    return bad(`The name is too long. The limit is ${MAX_SIGN_AS_LENGTH} characters.`);
  }
  if (!(await verifyTurnstile(token))) {
    return bad('The "are you human" check failed. Wait a moment and try again.');
  }

  const db = serviceClient();

  // Flags (informational only).
  const flags: string[] = [];
  if (LINK_RE.test(message)) flags.push('link');
  if (PHONE_RE.test(message)) flags.push('phone');

  const { data: words } = await db.from('flagged_words').select('word');
  const lower = message.toLowerCase();
  if (words?.some((w: { word: string }) => lower.includes(w.word))) flags.push('word_list');

  // Only these columns are saved. No IP, no user agent, no email.
  const { error } = await db.from('submissions').insert({
    message,
    category,
    sign_as: signAs || null,
    flags,
  });

  if (error) {
    // Log the reason only, never the message text.
    console.error('submit: insert failed:', error.message);
    return bad('Something went wrong on our side. Try again in a minute.', 500);
  }

  return Response.json({ ok: true });
}
