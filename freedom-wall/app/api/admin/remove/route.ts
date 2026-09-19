import { userClient } from '../../../../lib/supabaseServer';
import { deleteFromPage } from '../../../../lib/facebook';

export const dynamic = 'force-dynamic';

// Takes a live post down: deletes it on Facebook, then marks it removed.
// The caller must be a logged-in admin. The database double-checks this.

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return Response.json({ error: 'Log in first.' }, { status: 401 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Missing post id.' }, { status: 400 });

  const db = userClient(token);

  const { data: isAdmin } = await db.rpc('is_admin');
  if (isAdmin !== true) {
    return Response.json({ error: 'You are not on the admin list.' }, { status: 403 });
  }

  const { data: row } = await db
    .from('submissions')
    .select('id, status, fb_post_id')
    .eq('id', id)
    .single();

  if (!row) return Response.json({ error: 'Post not found.' }, { status: 404 });
  if (row.status !== 'posted' || !row.fb_post_id) {
    return Response.json({ error: 'Only live posts can be removed.' }, { status: 409 });
  }

  // Test posts made in DRY_RUN mode were never on Facebook.
  if (!String(row.fb_post_id).startsWith('dry-run-')) {
    const result = await deleteFromPage(row.fb_post_id);
    // If it is already gone from the Page, carry on and just mark it removed.
    if (!result.ok && !/does not exist/i.test(result.error)) {
      return Response.json({ error: result.error }, { status: 502 });
    }
  }

  const { error } = await db.rpc('mark_removed', { p_id: id });
  if (error) {
    return Response.json({ error: `Deleted on Facebook, but saving failed: ${error.message}` }, { status: 500 });
  }
  return Response.json({ ok: true });
}
