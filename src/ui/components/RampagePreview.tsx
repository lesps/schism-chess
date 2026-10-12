import type { GameState, RampageMove, Turn } from '../../engine/types';
import { PIECE_COLORS, getSlotName } from '../shared';
import { PieceIcon } from '../pieceArt';
import { HINTS } from '../strings';
import { useSheetKeys } from './useSheetKeys';

interface Props {
  turn: Turn & { primary: RampageMove };
  gameState: GameState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RampagePreview({ turn, gameState, onConfirm, onCancel }: Props) {
  useSheetKeys(onCancel);
  const { board, armies, sideToMove } = gameState;
  const { from, to, captures } = turn.primary;

  const fileOf = (sq: number) => String.fromCharCode(97 + (sq % 8));
  const rankOf = (sq: number) => Math.floor(sq / 8) + 1;
  const coordOf = (sq: number) => `${fileOf(sq)}${rankOf(sq)}`;

  return (
    <div className="preview-overlay" onClick={onCancel} data-testid="rampage-preview">
      <div className="preview-sheet" role="dialog" aria-modal aria-label={HINTS.RAMPAGE_CONFIRM_TITLE} onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <div className="preview-title">{HINTS.RAMPAGE_CONFIRM_TITLE}</div>
        <div className="preview-desc">
          {coordOf(from)} → {coordOf(to)} — {HINTS.RAMPAGE_DESC}
        </div>

        <ul className="preview-captures" data-testid="rampage-capture-list">
          {captures.map(sq => {
            const piece = board[sq];
            if (!piece) return null;
            const isFriendly = piece.color === sideToMove;
            const army = armies[piece.color];
            const glyph = <PieceIcon slot={piece.slot} color={piece.color} army={army} />;
            const color = PIECE_COLORS[army][piece.color];
            return (
              <li
                key={sq}
                className={`preview-capture-item ${isFriendly ? 'friendly-warning' : ''}`}
                data-sq={sq}
                data-testid={`rampage-victim-${sq}`}
              >
                <span className="preview-glyph" style={{ color }} aria-hidden>{glyph}</span>
                <span className="preview-coord">{coordOf(sq)}</span>
                <span className="preview-piece-name">
                  {piece.color === 'W' ? 'White' : 'Black'} {getSlotName(piece.slot, army)}
                </span>
                {isFriendly && <span className="preview-warning">friendly</span>}
              </li>
            );
          })}
        </ul>

        <div className="preview-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {HINTS.CANCEL}
          </button>
          <button className="btn btn-primary" onClick={onConfirm} data-testid="rampage-confirm">
            {HINTS.CONFIRM}
          </button>
        </div>
      </div>
    </div>
  );
}
