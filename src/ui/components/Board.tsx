import type { Army, Color, GameState, Square, Turn } from '../../engine/types';
import {
  boardSquaresInOrder,
  buildHighlightMap,
  buildRallyHighlightMap,
  chebyshev,
  getPrimaryDest,
  getPrimaryFrom,
  hasCrossedMidline,
  isLightSquare,
  squareFile,
  squareRank,
  type DestHighlightType,
} from '../shared';
import { PieceGlyph } from './PieceGlyph';

export type OverlayKind = 'banner' | 'armor' | 'blast' | 'rally-from';

interface Props {
  gameState: GameState;
  flipped: boolean;
  selectedSquare: Square | null;
  legalMovesForSelected: Turn[];
  lastMovePrimary: Turn['primary'] | null;
  checkedSquares: Square[];
  onSquareClick: (sq: Square) => void;
  // S12 additions (all optional)
  overlaySquares?: Map<Square, OverlayKind>;
  rallyTurns?: Turn[];           // staging turns for rally phase highlight
  empoweredSquares?: Set<Square>;
  exhaustedSquares?: Set<Square>;
  invasionSquares?: Set<Square>; // royals past midline
}

export function Board({
  gameState,
  flipped,
  selectedSquare,
  legalMovesForSelected,
  lastMovePrimary,
  checkedSquares,
  onSquareClick,
  overlaySquares,
  rallyTurns,
  empoweredSquares,
  exhaustedSquares,
  invasionSquares,
}: Props) {
  const { board, armies, sideToMove } = gameState;

  // Build destination highlight map from legal moves for selected piece
  const highlightMap = buildHighlightMap(
    legalMovesForSelected,
    board,
    sideToMove,
    armies[sideToMove],
  );

  // If in rally phase, overlay rally destinations
  const rallyHighlightMap = rallyTurns ? buildRallyHighlightMap(rallyTurns) : null;

  // Last-move squares
  const lastFrom = lastMovePrimary ? getLastFrom(lastMovePrimary) : null;
  const lastTo   = lastMovePrimary ? getLastTo(lastMovePrimary)   : null;

  const squares = boardSquaresInOrder(flipped);

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {squares.map(sq => {
        const piece = board[sq];
        const rank = squareRank(sq);
        const file = squareFile(sq);
        const light = isLightSquare(sq);

        // Coordinate label visibility
        const showRank = flipped ? file === 7 : file === 0;
        const showFile = flipped ? rank === 7 : rank === 0;

        const overlayKind = overlaySquares?.get(sq);
        const rallyHl = rallyHighlightMap?.get(sq);
        const activeHl = rallyHl ?? highlightMap.get(sq);

        // CSS classes
        const classes = [
          'board-sq',
          light ? 'light' : 'dark',
          selectedSquare === sq ? 'hl-selected' : '',
          checkedSquares.includes(sq) ? 'hl-check' : '',
          lastFrom === sq && selectedSquare !== sq ? 'hl-last-from' : '',
          lastTo   === sq && selectedSquare !== sq ? 'hl-last-to'   : '',
          activeHl ? highlightClass(activeHl) : '',
          overlayKind ? `overlay-${overlayKind}` : '',
          invasionSquares?.has(sq) ? 'hl-invaded' : '',
        ].filter(Boolean).join(' ');

        const isEmpowered = empoweredSquares?.has(sq);
        const isExhausted = exhaustedSquares?.has(sq);

        return (
          <div
            key={sq}
            className={classes}
            role="gridcell"
            aria-label={squareLabel(sq, piece, armies)}
            data-sq={sq}
            data-rank={rank}
            onClick={() => onSquareClick(sq)}
          >
            {showRank && (
              <span className="coord rank" aria-hidden>
                {rank + 1}
              </span>
            )}
            {showFile && (
              <span className="coord file" aria-hidden>
                {String.fromCharCode(97 + file)}
              </span>
            )}
            {piece && (
              <PieceGlyph
                piece={piece}
                armies={armies}
                empowered={isEmpowered}
                exhausted={isExhausted}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function highlightClass(hl: DestHighlightType): string {
  switch (hl) {
    case 'legal-move':              return 'hl-move';
    case 'legal-capture':           return 'hl-capture';
    case 'legal-special':           return 'hl-special';
    case 'legal-teleport-move':     return 'hl-teleport-move';
    case 'legal-teleport-capture':  return 'hl-teleport-capture';
    case 'legal-homing':            return 'hl-homing';
    case 'legal-friendly-capture':  return 'hl-friendly-capture';
    case 'legal-rally':             return 'hl-rally';
  }
}

function getLastFrom(primary: Turn['primary']): Square | null {
  switch (primary.type) {
    case 'standard': return primary.from;
    case 'teleport': return primary.from;
    case 'shatter':  return primary.warlordSquare;
    case 'rampage':  return primary.from;
    case 'strike':   return primary.from;
  }
}

function getLastTo(primary: Turn['primary']): Square | null {
  switch (primary.type) {
    case 'standard': return primary.to;
    case 'teleport': return primary.to;
    case 'shatter':  return null;
    case 'rampage':  return primary.to;
    case 'strike':   return primary.target;
  }
}

function squareLabel(
  sq: Square,
  piece: ReturnType<typeof Array.prototype.find> | null,
  armies: GameState['armies'],
): string {
  const file = String.fromCharCode(97 + (sq % 8));
  const rank = Math.floor(sq / 8) + 1;
  const coord = `${file}${rank}`;
  if (!piece) return coord;
  const p = piece as NonNullable<GameState['board'][number]>;
  const army = armies[p.color];
  return `${coord}: ${p.color === 'W' ? 'White' : 'Black'} ${army} ${p.slot}`;
}

// ─── Derived destination count for each origin ───────────────────────────────

/** Group turns by their destination square; return only the squareset. */
export function getDestinationsForOrigin(
  turns: Turn[],
  from: Square,
): Map<Square, Turn[]> {
  const map = new Map<Square, Turn[]>();
  for (const t of turns) {
    if (getPrimaryFrom(t) !== from) continue;
    const dest = getPrimaryDest(t);
    const bucket = map.get(dest) ?? [];
    bucket.push(t);
    map.set(dest, bucket);
  }
  return map;
}

// Re-export for consumers that need it
export { chebyshev, hasCrossedMidline };
export type { Color, Army, Square };
