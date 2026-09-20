'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import '../wall.css';
import { supabase } from '../../lib/supabaseBrowser';
import { formatPostNumber } from '../../lib/format';
import { IMAGE_BUCKET, SITE_NAME } from '../../lib/config';
import type { Status, Submission } from '../../lib/types';

const TABS: { key: Status; label: string }[] = [
  { key: 'review', label: 'Pictures to review' },
  { key: 'queued', label: 'Queued' },
  { key: 'posting', label: 'Posting' },
  { key: 'posted', label: 'Posted' },
  { key: 'failed', label: 'Failed' },
  { key: 'removed', label: 'Removed' },
  { key: 'rejected', label: 'Rejected' },
];

// Picture links are private and expire after an hour, so we refresh them a bit early.
const LINK_LIFETIME_MS = 50 * 60 * 1000;

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Submission[]>([]);
  const [tab, setTab] = useState<Status>('review');
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');
  const [pictureLinks, setPictureLinks] = useState<Record<string, { url: string; at: number }>>({});

  // ----- login state -----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  // Ask the database whether this Google account is on the admin list.
  useEffect(() => {
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [userId]);

  // ----- data -----
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) setNote(`Could not load messages: ${error.message}`);
    else setRows((data ?? []) as Submission[]);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [isAdmin, load]);

  const shown = rows.filter((r) => r.status === tab);
  // Oldest first for lines that are waiting (that is the order they get handled).
  if (tab === 'queued' || tab === 'review') shown.reverse();

  // Get private, short-lived links for the pictures on screen.
  useEffect(() => {
    if (!isAdmin) return;
    const now = Date.now();
    const needed = shown
      .map((r) => r.image_path)
      .filter((p): p is string => Boolean(p))
      .filter((p) => !pictureLinks[p] || now - pictureLinks[p].at > LINK_LIFETIME_MS);
    if (needed.length === 0) return;

    supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrls(needed, 3600)
      .then(({ data }) => {
        if (!data) return;
        setPictureLinks((prev) => {
          const next = { ...prev };
          for (const item of data) {
            if (item.path && item.signedUrl) next[item.path] = { url: item.signedUrl, at: Date.now() };
          }
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab, rows]);

  // ----- actions -----
  function signIn() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }

  async function runAction(id: string, action: () => PromiseLike<{ error: { message: string } | null }>, failText: string) {
    setBusyId(id);
    setNote('');
    const { error } = await action();
    if (error) setNote(`${failText}: ${error.message}`);
    else await load();
    setBusyId('');
  }

  function retry(id: string) {
    return runAction(id, () => supabase.rpc('retry_submission', { p_id: id }), 'Retry failed');
  }

  function approvePicture(id: string) {
    return runAction(id, () => supabase.rpc('approve_image_post', { p_id: id }), 'Could not approve');
  }

  async function rejectPicture(row: Submission) {
    if (!window.confirm('Reject this post? Nothing will be posted and the picture is deleted.')) return;
    await runAction(row.id, () => supabase.rpc('reject_image_post', { p_id: row.id }), 'Could not reject');
    if (row.image_path) {
      // Delete the picture file too. (If this fails the post is still rejected.)
      await supabase.storage.from(IMAGE_BUCKET).remove([row.image_path]);
    }
  }

  async function removePost(id: string) {
    if (!session) return;
    if (!window.confirm('Delete this post from the Facebook page? This cannot be undone.')) return;
    setBusyId(id);
    setNote('');
    try {
      const res = await fetch('/api/admin/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(`Could not remove it: ${data.error || res.status}`);
      else await load();
    } catch {
      setNote('Could not reach the server. Try again.');
    }
    setBusyId('');
  }

  // ----- screens -----
  if (!ready) {
    return <main className="wall-page"><div className="wall-col"><p>Loading...</p></div></main>;
  }

  if (!session) {
    return (
      <main className="wall-page">
        <div className="wall-col">
          <h1 className="wall-title">Admin</h1>
          <p className="wall-sub">Sign in with the Google account that is on the admin list.</p>
          <button className="btn" onClick={signIn}>Sign in with Google</button>
        </div>
      </main>
    );
  }

  if (isAdmin === null) {
    return <main className="wall-page"><div className="wall-col"><p>Checking access...</p></div></main>;
  }

  if (!isAdmin) {
    return (
      <main className="wall-page">
        <div className="wall-col">
          <h1 className="wall-title">No access</h1>
          <p className="wall-sub">
            {session.user.email} is not on the admin list. Ask an admin to add this email, or sign in with a different account.
          </p>
          <button className="btn plain" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </main>
    );
  }

  const counts = (s: Status) => rows.filter((r) => r.status === s).length;

  return (
    <main className="wall-page">
      <div className="wall-col wide">
        <h1 className="wall-title">{SITE_NAME} admin</h1>
        <p className="wall-sub">Signed in as {session.user.email}.</p>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn plain small" onClick={load}>Refresh</button>
          <button className="btn plain small" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>

        <div className="tabs" role="group" aria-label="Filter by status">
          {TABS.map((t) => {
            const needsAttention = (t.key === 'failed' || t.key === 'review') && counts(t.key) > 0;
            return (
              <button
                key={t.key}
                className={`btn plain small tab${needsAttention ? ' alert' : ''}`}
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label} ({counts(t.key)})
              </button>
            );
          })}
        </div>

        {note && <p className="msg error" role="alert">{note}</p>}

        {shown.length === 0 ? (
          <p className="empty">Nothing here.</p>
        ) : (
          <ul className="list">
            {shown.map((r) => (
              <li className="item" key={r.id}>
                <div className="item-head">
                  <strong>{r.post_number != null ? formatPostNumber(r.post_number) : 'Not numbered yet'}</strong>
                  <span>{r.category}</span>
                  <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time>
                </div>

                {r.reply_to != null && <p className="item-meta">Replying to {formatPostNumber(r.reply_to)}</p>}
                {r.message && <p className="item-text">{r.message}</p>}

                {r.image_path && (
                  pictureLinks[r.image_path] ? (
                    <img className="item-img" src={pictureLinks[r.image_path].url} alt="Attached picture" />
                  ) : (
                    <p className="item-meta">Loading picture...</p>
                  )
                )}

                {r.sign_as && <p className="item-meta">Signed: {r.sign_as}</p>}
                {r.flags.length > 0 && <p className="item-meta">Flags: {r.flags.join(', ')}</p>}
                {r.post_error && <p className="item-error">{r.post_error}</p>}

                <div className="item-actions">
                  {r.status === 'review' && (
                    <>
                      <button className="btn small" disabled={busyId === r.id} onClick={() => approvePicture(r.id)}>
                        Approve
                      </button>
                      <button className="btn small danger" disabled={busyId === r.id} onClick={() => rejectPicture(r)}>
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === 'failed' && !r.fb_post_id && (
                    <button className="btn small" disabled={busyId === r.id} onClick={() => retry(r.id)}>
                      Retry
                    </button>
                  )}
                  {r.status === 'posted' && (
                    <button className="btn small danger" disabled={busyId === r.id} onClick={() => removePost(r.id)}>
                      Remove from Page
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
