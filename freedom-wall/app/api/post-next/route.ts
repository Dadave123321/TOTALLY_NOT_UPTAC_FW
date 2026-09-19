import { timingSafeEqual } from 'node:crypto';
import { serviceClient } from '../../../lib/supabaseServer';
import { buildPostText } from '../../../lib/format';
import { facebookConfigured, isDryRun, publishToPage, type FbResult } from '../../../lib/facebook';
import type { Submission } from '../../../lib/types';

export const dynamic = 'force-dynamic';

// This is the posting job. A free scheduler (see README) calls it every
// 5 minutes. Each call posts at most ONE message, and only if the database
// says enough time has passed since the last one.

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Until Facebook is set up, leave everything queued (nothing is lost).
  if (!isDryRun() && !facebookConfigured()) {
    return Response.json({ posted: false, reason: 'Facebook is not set up yet. Messages stay queued.' });
  }

  const db = serviceClient();

  const { data, error } = await db.rpc('claim_next_post');
  if (error) {
    console.error('post-next: claim failed:', error.message);
    return Response.json({ error: 'claim failed' }, { status: 500 });
  }

  const row = (data as Submission[] | null)?.[0];
  if (!row) {
    return Response.json({ posted: false, reason: 'Nothing to post right now (queue empty, or waiting out the gap).' });
  }

  const result: FbResult = isDryRun()
    ? { ok: true, id: `dry-run-${row.id}` }
    : await publishToPage(buildPostText(row));

  if (!result.ok) {
    await db.rpc('fail_post', { p_id: row.id, p_error: result.error });
    console.error(`post-next: post ${row.post_number} failed:`, result.error);
    return Response.json({ posted: false, failed: true, error: result.error });
  }

  // Facebook accepted it. Save that fact (one retry if the database hiccups).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error: finishError } = await db.rpc('finish_post', {
      p_id: row.id,
      p_fb_post_id: result.id,
    });
    if (!finishError) {
      return Response.json({ posted: true, postNumber: row.post_number, dryRun: isDryRun() });
    }
    console.error(
      `post-next: LIVE on Facebook (post id ${result.id}) but saving it failed for submission ${row.id}:`,
      finishError.message
    );
  }

  // The row stays "posting"; after 10 minutes the database marks it failed
  // with a "check the Page before retrying" warning.
  return Response.json({ posted: true, savedToDatabase: false, fbPostId: result.id }, { status: 500 });
}

export async function POST(request: Request) {
  return run(request);
}

// Some free schedulers can only send GET requests.
export async function GET(request: Request) {
  return run(request);
}
