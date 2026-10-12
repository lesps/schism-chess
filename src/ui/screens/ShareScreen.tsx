import { useEffect, useRef, useState } from 'react';
import type { PBMPayload } from '../../pbm/types';
import { encodePayload } from '../../pbm/index';

interface Props {
  payload: PBMPayload;
  title: string;
  subtitle?: string;
  onDone: () => void;
  /** If set, also show a "Back to game" button. */
  onBackToGame?: () => void;
  /** The message that goes with the link (to the recipient). Defaults to the title. */
  message?: string;
}

function buildShareUrl(encoded: string): string {
  return `${window.location.href.split('#')[0]}#g=${encoded}`;
}

/** Clipboard write with a legacy fallback (no async clipboard on plain http / old browsers). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function ShareScreen({ payload, title, subtitle, onDone, onBackToGame, message }: Props) {
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function handleCopy() {
    const ok = await copyText(url);
    if (!ok) inputRef.current?.select(); // let the user copy it by hand
    setCopyState(ok ? 'copied' : 'failed');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopyState('idle'), 2000);
  }

  function handleNativeShare() {
    navigator.share?.({ title: 'Schism Chess', text: message ?? title, url }).catch(() => {});
  }

  return (
    <div className="share-screen">
      <div className="share-header">
        <h2 className="share-title">{title}</h2>
        {subtitle && <p className="share-subtitle">{subtitle}</p>}
      </div>

      <div className="share-url-block">
        <label className="share-url-label" htmlFor="share-url-input">Share this link</label>
        <input
          ref={inputRef}
          id="share-url-input"
          className="share-url-input"
          data-testid="share-url"
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
        />
      </div>

      <div className="share-actions">
        {'share' in navigator && (
          <button className="btn btn-primary" onClick={handleNativeShare}>
            Share…
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => void handleCopy()} data-testid="copy-link">
          {copyState === 'copied' ? '✓ Copied!' : copyState === 'failed' ? 'Select & copy above' : 'Copy link'}
        </button>
      </div>

      <div className="share-text-block">
        <label className="share-url-label" htmlFor="share-text-input">Or copy this text (for chat apps)</label>
        <textarea
          id="share-text-input"
          className="share-textarea"
          data-testid="share-text"
          readOnly
          value={`Schism Chess — ${message ?? title}\n${url}`}
          rows={3}
        />
      </div>

      <div className="share-footer">
        {onBackToGame && (
          <button className="btn btn-ghost" onClick={onBackToGame} data-testid="back-to-game">
            ← Back to game
          </button>
        )}
        <button className="btn btn-primary" onClick={onDone} data-testid="share-done">
          Done
        </button>
      </div>
    </div>
  );
}
