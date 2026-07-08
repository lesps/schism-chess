import type { GameState, Square } from '../../engine/types';
import { PIECE_COLORS, squareNeighbors } from '../shared';
import { PieceIcon } from '../pieceArt';
import { HINTS } from '../strings';

interface Props {
  warlordSquare: Square;
  gameState: GameState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ShatterPreview({ warlordSquare, gameState, onConfirm, onCancel }: Props) {
  const { board, armies, sideToMove } = gameState;
  const neighbors = squareNeighbors(warlordSquare);
  const doomed = neighbors
    .map(sq => ({ sq, piece: board[sq] }))
    .filter(x => x.piece !== null && x.piece.slot !== 'K'); // royals are spared

  const fileOf = (sq: Square) => String.fromCharCode(97 + (sq % 8));
  const rankOf = (sq: Square) => Math.floor(sq / 8) + 1;
  const coordOf = (sq: Square) => `${fileOf(sq)}${rankOf(sq)}`;

  return (
    <div className="preview-overlay" onClick={onCancel} data-testid="shatter-preview">
      <div className="preview-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="preview-title">{HINTS.SHATTER_CONFIRM_TITLE}</div>
        <div className="preview-desc">{HINTS.TWINS_SHATTER_DESC}</div>

        {doomed.length === 0 ? (
          <div className="preview-empty">No adjacent pieces — Shatter clears empty squares.</div>
        ) : (
          <ul className="preview-captures" data-testid="shatter-doomed-list">
            {doomed.map(({ sq, piece }) => {
              const isFriendly = piece!.color === sideToMove;
              const army = armies[piece!.color];
              const glyph = <PieceIcon slot={piece!.slot} color={piece!.color} army={army} />;
              const color = PIECE_COLORS[army][piece!.color];
              return (
                <li
                  key={sq}
                  className={`preview-capture-item ${isFriendly ? 'friendly-warning' : ''}`}
                  data-sq={sq}
                  data-testid={`shatter-victim-${sq}`}
                >
                  <span className="preview-glyph" style={{ color }} aria-hidden>{glyph}</span>
                  <span className="preview-coord">{coordOf(sq)}</span>
                  <span className="preview-piece-name">
                    {piece!.color === 'W' ? 'White' : 'Black'} {army} {piece!.slot}
                  </span>
                  {isFriendly && <span className="preview-warning">friendly</span>}
                </li>
              );
            })}
          </ul>
        )}

        <div className="preview-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {HINTS.CANCEL}
          </button>
          <button className="btn btn-primary" onClick={onConfirm} data-testid="shatter-confirm">
            {HINTS.CONFIRM}
          </button>
        </div>
      </div>
    </div>
  );
}
