import type { Army, Color, Piece } from '../../engine/types';
import { PIECE_COLORS, getPieceGlyph, getSlotName } from '../shared';

interface Props {
  piece: Piece;
  armies: { W: Army; B: Army };
}

export function PieceGlyph({ piece, armies }: Props) {
  const army = armies[piece.color];
  const glyph = getPieceGlyph(piece.slot, piece.color);
  const color = PIECE_COLORS[army][piece.color];
  const label = getSlotName(piece.slot, army, piece.promoted ?? false);
  const side: Color = piece.color;

  return (
    <span
      className="piece-glyph"
      style={{ color }}
      aria-label={`${side === 'W' ? 'White' : 'Black'} ${label}`}
      data-slot={piece.slot}
      data-color={piece.color}
      data-army={army}
    >
      {glyph}
    </span>
  );
}
