'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Script from 'next/script';
import './wall.css';
import {
  CATEGORIES,
  FORM_NOTICE,
  MAX_MESSAGE_LENGTH,
  MAX_SIGN_AS_LENGTH,
  SITE_NAME,
} from '../lib/config';

declare global {
  interface Window {
    turnstile?: { reset: () => void };
    onTurnstileDone?: (token: string) => void;
    onTurnstileExpired?: () => void;
  }
}

export default function Home() {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('Confession');
  const [signAs, setSignAs] = useState('');
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  // Cloudflare's widget calls these when the person passes (or the pass expires).
  useEffect(() => {
    window.onTurnstileDone = (t) => setToken(t);
    window.onTurnstileExpired = () => setToken('');
    return () => {
      delete window.onTurnstileDone;
      delete window.onTurnstileExpired;
    };
  }, []);

  const over = message.length > MAX_MESSAGE_LENGTH;
  const canSend = message.trim().length > 0 && !over && token !== '' && state !== 'sending';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setState('sending');
    setError('');

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, category, signAs, turnstileToken: token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Could not send your message. Try again.');
        setState('error');
      } else {
        setMessage('');
        setState('sent');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setState('error');
    }

    // Each check can be used once, so get a fresh one.
    setToken('');
    window.turnstile?.reset();
  }

  return (
    <main className="wall-page">
      <div className="wall-col">
        <h1 className="wall-title">{SITE_NAME}</h1>
        <p className="wall-sub">Write whatever you want to say. It goes up on our Facebook page without your name.</p>

        <form onSubmit={onSubmit}>
          <div className="sheet">
            <label htmlFor="message" className="sr-only">
              Your message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Start writing here"
              rows={8}
            />
            <div className={`sheet-foot${over ? ' over' : ''}`}>
              {message.length} / {MAX_MESSAGE_LENGTH}
            </div>
          </div>

          <div className="fields">
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="signAs">Name to show (optional)</label>
              <input
                id="signAs"
                type="text"
                value={signAs}
                maxLength={MAX_SIGN_AS_LENGTH}
                onChange={(e) => setSignAs(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div
            className="cf-turnstile"
            data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            data-callback="onTurnstileDone"
            data-expired-callback="onTurnstileExpired"
          />

          <p style={{ margin: '1rem 0 0' }}>
            <button type="submit" className="btn" disabled={!canSend}>
              {state === 'sending' ? 'Sending...' : 'Send to the wall'}
            </button>
          </p>

          {state === 'sent' && (
            <p className="msg" role="status">
              Sent. Your message is in line and will appear on the Page when its turn comes.
            </p>
          )}
          {state === 'error' && (
            <p className="msg error" role="alert">
              {error}
            </p>
          )}
        </form>

        <ul className="notice">
          {FORM_NOTICE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
    </main>
  );
}
