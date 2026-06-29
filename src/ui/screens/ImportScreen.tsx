import { useEffect, useRef, useState } from 'react';
import type { ValidationError } from '../../pbm/types';

interface Props {
  preloaded?: string;
  onBack: () => void;
  onImport: (encoded: string) => void;
}

function errorMessage(err: ValidationError): string {
  switch (err.type) {
    case 'newer-client':
      return `This payload requires a newer version of Schism Chess. ${err.message}`;
    case 'schema':
      return `Malformed payload: ${err.message}`;
    case 'hash-mismatch':
      return `Tamper detected: ${err.message}`;
    case 'replay':
      return `Illegal move at move ${err.moveNumber} (${err.side === 'W' ? 'White' : 'Black'}): "${err.san}" — ${err.reason}`;
    case 'result-mismatch':
      return `Result mismatch: ${err.message}`;
  }
}

interface ImportErrorProps {
  error: ValidationError | string;
}

export function ImportErrorDisplay({ error }: ImportErrorProps) {
  const msg = typeof error === 'string' ? error : errorMessage(error);
  return (
    <div className="import-error" data-testid="import-error">
      <span className="import-error-icon">✗</span>
      <span className="import-error-msg">{msg}</span>
    </div>
  );
}

export function ImportScreen({ preloaded, onBack, onImport }: Props) {
  const [text, setText] = useState(preloaded ?? '');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (preloaded) {
      // Extract encoded part from URL if user pasted a full URL
      const encoded = extractEncoded(preloaded);
      setText(encoded);
      setError(null);
    }
  }, [preloaded]);

  function handleSubmit() {
    const input = text.trim();
    if (!input) {
      setError('Paste a game link or encoded payload.');
      return;
    }
    const encoded = extractEncoded(input);
    if (!encoded) {
      setError('Could not find a valid game link in the pasted text.');
      return;
    }
    setError(null);
    onImport(encoded);
  }

  return (
    <div className="ng-screen import-screen">
      <div className="ng-header">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <h2>Import game</h2>
      </div>

      <p className="import-desc">
        Paste a game link or the full message your opponent shared.
      </p>

      <textarea
        ref={textareaRef}
        className="import-textarea"
        data-testid="import-input"
        placeholder="Paste link or text here…"
        value={text}
        onChange={e => { setText(e.target.value); setError(null); }}
        rows={5}
      />

      {error && (
        <div className="import-error" data-testid="import-error">
          <span className="import-error-icon">✗</span>
          <span className="import-error-msg">{error}</span>
        </div>
      )}

      <div className="ng-footer">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!text.trim()}
          data-testid="import-submit"
        >
          Import →
        </button>
      </div>
    </div>
  );
}

/** Extract the encoded payload from a URL fragment or return the raw string. */
function extractEncoded(input: string): string {
  const trimmed = input.trim();
  // Try to extract from URL fragment: ...#g=<encoded>
  const hashIdx = trimmed.lastIndexOf('#g=');
  if (hashIdx !== -1) {
    return trimmed.slice(hashIdx + 3).split(/\s/)[0];
  }
  // Try to find the encoded string on its own line (after a URL in a text message)
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const hi = line.lastIndexOf('#g=');
    if (hi !== -1) return line.slice(hi + 3).split(/\s/)[0];
  }
  // Fall back to treating the whole input as the encoded payload
  return trimmed.split(/\s/)[0];
}
