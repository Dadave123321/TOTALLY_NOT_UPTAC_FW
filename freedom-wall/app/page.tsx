'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Script from 'next/script';
import './wall.css';
import {
  CATEGORIES,
  FORM_NOTICE,
  IMAGE_MAX_SIDE,
  MAX_MESSAGE_LENGTH,
  MAX_SIGN_AS_LENGTH,
  SITE_NAME,
} from '../lib/config';
import { formatPostNumber } from '../lib/format';
import { shrinkImage } from '../lib/shrinkImage';

declare global {
  interface Window {
    turnstile?: { reset: () => void };
    onTurnstileDone?: (token: string) => void;
    onTurnstileExpired?: () => void;
  }
}

type Picture = { blob: Blob; previewUrl: string };

export default function Home() {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('Confession');
  const [signAs, setSignAs] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [picture, setPicture] = useState<Picture | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sentWithPicture, setSentWithPicture] = useState(false);
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

  // Free the preview picture from memory when it is replaced or removed.
  useEffect(() => {
    return () => {
      if (picture) URL.revokeObjectURL(picture.previewUrl);
    };
  }, [picture]);

  const over = message.length > MAX_MESSAGE_LENGTH;
  const hasContent = message.trim().length > 0 || picture !== null;
  const canSend = hasContent && !over && !preparing && token !== '' && state !== 'sending';

  async function onPickPicture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;

    setError('');
    setPreparing(true);
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('too big');
      const blob = await shrinkImage(file, IMAGE_MAX_SIDE);
      setPicture({ blob, previewUrl: URL.createObjectURL(blob) });
      if (state === 'error') setState('idle');
    } catch {
      setPicture(null);
      setError('That picture could not be used. Try a JPG or PNG that is under 30 MB.');
      setState('error');
    }
    setPreparing(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setState('sending');
    setError('');

    const body = new FormData();
    body.append('message', message);
    body.append('category', category);
    body.append('signAs', signAs);
    body.append('replyTo', replyTo);
    body.append('turnstileToken', token);
    if (picture) body.append('image', picture.blob, 'picture.jpg');

    try {
      const res = await fetch('/api/submit', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Could not send your message. Try again.');
        setState('error');
      } else {
        setSentWithPicture(Boolean(data.needsReview));
        setMessage('');
        setReplyTo('');
        setPicture(null);
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
            <div className="field">
              <label htmlFor="replyTo">Replying to a post? (optional)</label>
              <input
                id="replyTo"
                type="text"
                inputMode="text"
                value={replyTo}
                placeholder={formatPostNumber(42)}
                onChange={(e) => setReplyTo(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="picture">Add a picture (optional)</label>
              <input id="picture" type="file" accept="image/*" onChange={onPickPicture} disabled={preparing} />
            </div>
          </div>

          {preparing && <p className="msg">Getting your picture ready...</p>}
          {picture && (
            <div className="picture-preview">
              <img src={picture.previewUrl} alt="Your picture, before sending" />
              <button type="button" className="btn plain small" onClick={() => setPicture(null)}>
                Remove picture
              </button>
            </div>
          )}

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
              {sentWithPicture
                ? 'Sent. An admin will look at your picture first. If it is approved, it joins the line.'
                : 'Sent. Your message is in line and will appear on the Page when its turn comes.'}
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
