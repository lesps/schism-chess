import type { Army, Color, Piece } from '../../engine/types';
import { PIECE_COLORS, getPieceGlyph, getSlotName } from '../shared';

interface Props {
  piece: Piece;
  armies: { W: Army; B: Army };
  empowered?: boolean;
  exhausted?: boolean;
}

export function PieceGlyph({ piece, armies, empowered, exhausted }: Props) {
  const army = armies[piece.color];
  const glyph = getPieceGlyph(piece.slot, piece.color);
  const color = PIECE_COLORS[army][piece.color];
  const label = getSlotName(piece.slot, army, piece.promoted ?? false);
  const side: Color = piece.color;

  return (
    <span
      className={[
        'piece-glyph',
        empowered ? 'piece-empowered' : '',
        exhausted ? 'piece-exhausted' : '',
      ].filter(Boolean).join(' ')}
      style={{ color: exhausted ? undefined : color, opacity: exhausted ? 0.5 : undefined }}
      aria-label={`${side === 'W' ? 'White' : 'Black'} ${label}${empowered ? ' (Empowered)' : ''}${exhausted ? ' (Exhausted)' : ''}`}
      data-slot={piece.slot}
      data-color={piece.color}
      data-army={army}
      data-empowered={empowered ? 'true' : undefined}
      data-exhausted={exhausted ? 'true' : undefined}
    >
      {glyph}
      {empowered && <span className="piece-badge piece-badge-empowered" aria-hidden>✦</span>}
      {exhausted && <span className="piece-badge piece-badge-exhausted" aria-hidden>⊗</span>}
    </span>
  );
}
