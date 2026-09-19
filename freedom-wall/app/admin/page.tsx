'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import '../wall.css';
import { supabase } from '../../lib/supabaseBrowser';
import { formatPostNumber } from '../../lib/format';
import { SITE_NAME } from '../../lib/config';
import type { Status, Submission } from '../../lib/types';

const TABS: { key: Status; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'posting', label: 'Posting' },
  { key: 'posted', label: 'Posted' },
  { key: 'failed', label: 'Failed' },
  { key: 'removed', label: 'Removed' },
];

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Submission[]>([]);
  const [tab, setTab] = useState<Status>('queued');
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');

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

  // ----- actions -----
  function signIn() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }

  async function retry(id: string) {
    setBusyId(id);
    setNote('');
    const { error } = await supabase.rpc('retry_submission', { p_id: id });
    if (error) setNote(`Retry failed: ${error.message}`);
    else await load();
    setBusyId('');
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
  const shown = rows.filter((r) => r.status === tab);
  // Oldest first for the queue (that is the order they will post); newest first elsewhere.
  if (tab === 'queued') shown.reverse();

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
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`btn plain small tab${t.key === 'failed' && counts('failed') > 0 ? ' alert' : ''}`}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label} ({counts(t.key)})
            </button>
          ))}
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
                <p className="item-text">{r.message}</p>
                {r.sign_as && <p className="item-meta">Signed: {r.sign_as}</p>}
                {r.flags.length > 0 && <p className="item-meta">Flags: {r.flags.join(', ')}</p>}
                {r.post_error && <p className="item-error">{r.post_error}</p>}

                <div className="item-actions">
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
