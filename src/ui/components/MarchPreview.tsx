import type { GameState, MarchMove, Turn } from '../../engine/types';
import { computeMarch } from '../../engine/accord';
import { PIECE_COLORS, getSlotName } from '../shared';
import { PieceIcon } from '../pieceArt';
import { HINTS } from '../strings';

interface Props {
  turn: Turn & { primary: MarchMove };
  gameState: GameState;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation sheet for an Accord March: lists every piece that will step and where. */
export function MarchPreview({ turn, gameState, onConfirm, onCancel }: Props) {
  const { board, armies, sideToMove } = gameState;
  const { from, to } = turn.primary;
  const dr = (to >> 3) - (from >> 3);
  const df = (to & 7) - (from & 7);
  const steps = computeMarch(board, sideToMove, dr, df) ?? [];
  const army = armies[sideToMove];

  const fileOf = (sq: number) => String.fromCharCode(97 + (sq % 8));
  const rankOf = (sq: number) => Math.floor(sq / 8) + 1;
  const coordOf = (sq: number) => `${fileOf(sq)}${rankOf(sq)}`;

  return (
    <div className="preview-overlay" onClick={onCancel} data-testid="march-preview">
      <div className="preview-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="preview-title">{HINTS.MARCH_CONFIRM_TITLE}</div>
        <div className="preview-desc">
          {coordOf(from)} → {coordOf(to)} — {HINTS.MARCH_CONFIRM}
        </div>

        <ul className="preview-captures" data-testid="march-step-list">
          {steps.map(s => {
            const piece = board[s.from];
            if (!piece) return null;
            const color = PIECE_COLORS[army][piece.color];
            return (
              <li
                key={s.from}
                className="preview-capture-item"
                data-sq={s.from}
                data-testid={`march-step-${s.from}`}
              >
                <span className="preview-glyph" style={{ color }} aria-hidden>
                  <PieceIcon slot={piece.slot} color={piece.color} army={army} />
                </span>
                <span className="preview-coord">{coordOf(s.from)} → {coordOf(s.to)}</span>
                <span className="preview-piece-name">{getSlotName(piece.slot, army)}</span>
              </li>
            );
          })}
        </ul>

        <div className="preview-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {HINTS.CANCEL}
          </button>
          <button className="btn btn-primary" onClick={onConfirm} data-testid="march-confirm">
            {HINTS.CONFIRM}
          </button>
        </div>
      </div>
    </div>
  );
}
