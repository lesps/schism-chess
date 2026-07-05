import type { ReactNode } from 'react';
import type { GameState, Turn } from '../../engine/types';
import { PIECE_COLORS } from '../shared';
import { PieceIcon } from '../pieceArt';
import { HINTS } from '../strings';
import { turnToSan } from '../../engine';

interface Props {
  turns: Turn[];
  gameState: GameState;
  onSelect: (turn: Turn) => void;
  onCancel: () => void;
}

export function TurnChooser({ turns, gameState, onSelect, onCancel }: Props) {
  return (
    <div className="chooser-overlay" onClick={onCancel} data-testid="turn-chooser">
      <div
        className="chooser-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Choose move"
      >
        <div className="chooser-title">Choose</div>
        <div className="chooser-options">
          {turns.map((turn, i) => {
            const { label, glyph, glyphColor, desc } = describeOption(turn, gameState);
            return (
              <button
                key={i}
                className="chooser-option"
                onClick={() => onSelect(turn)}
                data-testid={`chooser-option-${i}`}
              >
                {glyph && (
                  <span
                    className="chooser-option-glyph"
                    style={{ color: glyphColor ?? undefined }}
                    aria-hidden
                  >
                    {glyph}
                  </span>
                )}
                <span className="chooser-option-text">
                  <span className="chooser-option-name">{label}</span>
                  {desc && <span className="chooser-option-desc">{desc}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button className="chooser-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface OptionDesc {
  label: string;
  glyph: ReactNode | null;
  glyphColor: string | null;
  desc: string | null;
}

function describeOption(turn: Turn, state: GameState): OptionDesc {
  const { sideToMove, armies } = state;
  const army = armies[sideToMove];
  const p = turn.primary;

  // Promotion
  if (p.type === 'standard' && p.promotion) {
    const slot = p.promotion;
    const glyph = <PieceIcon slot={slot} color={sideToMove} army={army} promoted />;
    const color = PIECE_COLORS[army][sideToMove];
    const slotNames: Record<typeof slot, string> = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', K: 'King', P: 'Pawn' };
    return { label: `Promote to ${slotNames[slot]}`, glyph, glyphColor: color, desc: null };
  }

  // Shatter
  if (p.type === 'shatter') {
    return { label: 'Shatter', glyph: '💥', glyphColor: null, desc: 'Destroys every piece around this Warlord — friend and foe' };
  }

  // Friendly capture (Wild Bronco/Behemoth taking its own piece) — warn clearly
  if (p.type === 'standard' && state.board[p.to]?.color === sideToMove) {
    const san = turnToSan(state, turn);
    return { label: san, glyph: '⚠', glyphColor: '#f0a840', desc: HINTS.FRIENDLY_CAPTURE_CONFIRM };
  }

  // Rally variants (same primary, different rallies)
  if (turn.rally) {
    const san = turnToSan(state, turn);
    const rallyDesc = `Rally to ${rallySquareName(turn.rally.to)}`;
    return { label: san, glyph: null, glyphColor: null, desc: rallyDesc };
  }

  // Generic fallback
  const san = turnToSan(state, turn);
  return { label: san, glyph: null, glyphColor: null, desc: null };
}

function rallySquareName(sq: number): string {
  const file = String.fromCharCode(97 + (sq % 8));
  const rank = Math.floor(sq / 8) + 1;
  return `${file}${rank}`;
}
