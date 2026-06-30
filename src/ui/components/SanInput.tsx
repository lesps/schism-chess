import { useRef, useState } from 'react';
import { sanToTurn } from '../../engine';
import type { GameState, Turn } from '../../engine/types';
import { isParseError } from '../../engine/notation';

interface Props {
  gameState: GameState;
  disabled?: boolean;
  onSubmit: (turn: Turn) => void;
}

export function SanInput({ gameState, disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const san = value.trim();
      if (!san) return;
      const result = sanToTurn(gameState, san);
      if (isParseError(result)) {
        setError(result.error);
        return;
      }
      onSubmit(result);
      setValue('');
      setError(null);
    } else if (e.key === 'Escape') {
      setValue('');
      setError(null);
      inputRef.current?.blur();
    } else {
      // Clear error on any other key press
      if (error) setError(null);
    }
  }

  return (
    <div className="san-input-row" data-testid="san-input-row">
      <input
        ref={inputRef}
        className={`san-input${error ? ' san-input-error' : ''}`}
        type="text"
        value={value}
        placeholder="Type a move (e.g. Nf3)"
        aria-label="SAN move input — press Enter to play"
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'san-error' : undefined}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={e => { setValue(e.target.value); if (error) setError(null); }}
        onKeyDown={handleKeyDown}
        data-testid="san-input"
      />
      {error && (
        <span id="san-error" className="san-error" role="alert" data-testid="san-error">
          {error}
        </span>
      )}
    </div>
  );
}
