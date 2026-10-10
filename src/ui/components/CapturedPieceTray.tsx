import type { Army, Color, Piece } from '../../engine/types';
import { PIECE_COLORS, getSlotName } from '../shared';
import { PieceIcon } from '../pieceArt';

interface Props {
  /** Captured pieces grouped by the color of the piece that was captured. */
  captured: { W: Piece[]; B: Piece[] };
  armies: { W: Army; B: Army };
}

const ORDER: Record<string, number> = { Q: 0, R: 1, B: 2, N: 3, P: 4, K: 5 };

export function CapturedPieceTray({ captured, armies }: Props) {
  const hasCaptures = captured.W.length > 0 || captured.B.length > 0;
  if (!hasCaptures) return null;

  // Each row shows what a side has taken: White's row holds Black's lost pieces.
  return (
    <div className="captured-tray">
      {(['W', 'B'] as Color[]).map(taker => {
        const victimColor: Color = taker === 'W' ? 'B' : 'W';
        const pieces = [...captured[victimColor]].sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
        if (pieces.length === 0) return null;
        const army = armies[victimColor];
        const names = pieces.map(p => getSlotName(p.slot, army)).join(', ');
        return (
          <div
            key={taker}
            className="captured-tray-row"
            aria-label={`${taker === 'W' ? 'White' : 'Black'} has captured: ${names}`}
          >
            <span className={`turn-dot turn-dot-${taker}`} aria-hidden />
            <span className="captured-tray-label">{taker === 'W' ? 'White took' : 'Black took'}</span>
            <span className="captured-tray-pieces" aria-hidden>
              {pieces.map((p, i) => (
                <span
                  key={i}
                  className="captured-piece"
                  style={{ color: PIECE_COLORS[army][victimColor] }}
                >
                  <PieceIcon slot={p.slot} color={p.color} army={army} />
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
