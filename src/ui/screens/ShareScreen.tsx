import { useEffect, useRef, useState } from 'react';
import type { PBMPayload } from '../../pbm/types';
import { encodePayload } from '../../pbm/index';

interface Props {
  payload: PBMPayload;
  title: string;
  subtitle?: string;
  onDone: () => void;
  /** If set, show a "Back to game" button instead of "Done". */
  onBackToGame?: () => void;
}

function buildShareUrl(encoded: string): string {
  return `${window.location.href.split('#')[0]}#g=${encoded}`;
}

export function ShareScreen({ payload, title, subtitle, onDone, onBackToGame }: Props) {
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: select the textarea
      const el = document.getElementById('share-url-input') as HTMLInputElement | null;
      el?.select();
    });
  }

  function handleNativeShare() {
    navigator.share?.({ title: 'Schism Chess', url }).catch(() => {});
  }

  return (
    <div className="share-screen">
      <div className="share-header">
        <h2 className="share-title">{title}</h2>
        {subtitle && <p className="share-subtitle">{subtitle}</p>}
      </div>

      <div className="share-url-block">
        <label className="share-url-label">Share this link</label>
        <input
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
        <button className="btn btn-secondary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>

      <div className="share-text-block">
        <label className="share-url-label">Or copy this text (for chat apps)</label>
        <textarea
          className="share-textarea"
          data-testid="share-text"
          readOnly
          value={`Schism Chess — ${title}\n${url}`}
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
