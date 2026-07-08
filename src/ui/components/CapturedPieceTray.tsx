import type { Army, Color, Piece } from '../../engine/types';
import { PIECE_COLORS } from '../shared';
import { PieceIcon } from '../pieceArt';

interface Props {
  captured: { W: Piece[]; B: Piece[] };
  armies: { W: Army; B: Army };
}

export function CapturedPieceTray({ captured, armies }: Props) {
  const hasCaptures = captured.W.length > 0 || captured.B.length > 0;
  if (!hasCaptures) return null;

  return (
    <div className="captured-tray">
      {(['W', 'B'] as Color[]).map(color => {
        const pieces = captured[color];
        if (pieces.length === 0) return null;
        const army = armies[color];
        return (
          <div key={color} className="captured-tray-row">
            <span className="captured-tray-label">{color}</span>
            {pieces.map((p, i) => (
              <span
                key={i}
                className="captured-piece"
                style={{ color: PIECE_COLORS[army][color] }}
                aria-hidden
              >
                <PieceIcon slot={p.slot} color={p.color} army={army} />
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
