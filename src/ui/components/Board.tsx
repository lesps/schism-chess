import type { GameState, Square, Turn } from '../../engine/types';
import {
  boardSquaresInOrder,
  buildHighlightMap,
  getPrimaryDest,
  getPrimaryFrom,
  isLightSquare,
  squareFile,
  squareRank,
} from '../shared';
import { PieceGlyph } from './PieceGlyph';

interface Props {
  gameState: GameState;
  flipped: boolean;
  selectedSquare: Square | null;
  legalMovesForSelected: Turn[];
  lastMovePrimary: Turn['primary'] | null;
  checkedSquares: Square[];
  onSquareClick: (sq: Square) => void;
}

export function Board({
  gameState,
  flipped,
  selectedSquare,
  legalMovesForSelected,
  lastMovePrimary,
  checkedSquares,
  onSquareClick,
}: Props) {
  const { board, armies } = gameState;
  const highlightMap = buildHighlightMap(legalMovesForSelected, board);

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

        // CSS classes
        const classes = [
          'board-sq',
          light ? 'light' : 'dark',
          selectedSquare === sq ? 'hl-selected' : '',
          checkedSquares.includes(sq) ? 'hl-check' : '',
          lastFrom === sq && selectedSquare !== sq ? 'hl-last-from' : '',
          lastTo   === sq && selectedSquare !== sq ? 'hl-last-to'   : '',
          highlightMap.has(sq) ? highlightClass(highlightMap.get(sq)!) : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={sq}
            className={classes}
            role="gridcell"
            aria-label={squareLabel(sq, piece, armies)}
            data-sq={sq}
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
            {piece && <PieceGlyph piece={piece} armies={armies} />}
          </div>
        );
      })}
    </div>
  );
}

function highlightClass(hl: 'legal-move' | 'legal-capture' | 'legal-special'): string {
  switch (hl) {
    case 'legal-move':    return 'hl-move';
    case 'legal-capture': return 'hl-capture';
    case 'legal-special': return 'hl-special';
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
    case 'shatter':  return null; // shatter is in-place
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
