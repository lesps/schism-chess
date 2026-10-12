import type { ReactNode } from 'react';
import type { Army, Piece } from '../../engine/types';
import { ARMY_ACCENTS, PIECE_COLORS, getPieceInfo, getSlotName } from '../shared';
import type { LegendItem } from '../pieceGuide';
import { PieceIcon } from '../pieceArt';

interface Props {
  piece: Piece;
  army: Army;
  /** Short status after the name ("It isn't this piece's turn"). */
  status?: string | null;
  /** Live notes about this piece in the current position. */
  notes: string[];
  /** What the markers on the board mean for this piece (selected pieces only). */
  legend?: LegendItem[];
  /** Shown while the mouse hovers a piece rather than after a tap. */
  hover?: boolean;
  /** Extra action, e.g. the Twins' Shatter button. */
  action?: ReactNode;
}

/** "What does this piece do?" — name, plain-language summary, live notes, marker legend. */
export function PieceInfoPanel({ piece, army, status, notes, legend, hover, action }: Props) {
  return (
    <div className={`piece-info-bar${hover ? ' piece-info-hover' : ''}`} data-testid="piece-info">
      <span className="piece-info-icon" style={{ color: PIECE_COLORS[army][piece.color] }} aria-hidden>
        <PieceIcon slot={piece.slot} color={piece.color} army={army} />
      </span>
      <span className="piece-info-text">
        <strong className="piece-info-name" style={{ color: ARMY_ACCENTS[army] }}>
          {getSlotName(piece.slot, army)}
          <span className="piece-info-side"> · {piece.color === 'W' ? 'White' : 'Black'}</span>
          {status && <span className="piece-info-note"> · {status}</span>}
        </strong>
        <span className="piece-info-desc">{getPieceInfo(piece.slot, army)}</span>
        {notes.length > 0 && (
          <ul className="piece-info-notes" data-testid="piece-notes">
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        )}
        {legend && legend.length > 0 && (
          <span className="move-legend" data-testid="move-legend" aria-label="What the board markers mean">
            {legend.map(item => (
              <span key={item.label} className="move-legend-item">
                <span className={`legend-swatch swatch-${item.kind}`} aria-hidden />
                {item.label}
              </span>
            ))}
          </span>
        )}
      </span>
      {action}
    </div>
  );
}
