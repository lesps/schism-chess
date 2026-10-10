import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { Army, Color, GameState, Square, Turn } from '../../engine/types';
import {
  boardSquaresInOrder,
  buildHighlightMap,
  buildRallyHighlightMap,
  chebyshev,
  getPrimaryDest,
  getPrimaryFrom,
  getSlotName,
  hasCrossedMidline,
  isLightSquare,
  squareFile,
  squareRank,
  type DestHighlightType,
  type TurnAnimation,
} from '../shared';
import { PieceGlyph } from './PieceGlyph';

export type OverlayKind = 'banner' | 'armor' | 'blast' | 'rally-from';

export interface BoardAnimation extends TurnAnimation {
  /** Monotonic per game (the ply count). Only a key above every key seen so far animates. */
  key: number;
}

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
  // Drag-and-drop: onDragStart returns false to refuse the drag (nothing to move).
  onDragStart?: (sq: Square) => boolean;
  onDrop?: (from: Square, to: Square) => void;
  animation?: BoardAnimation | null;
  /** Keyboard: Escape while the board has focus. */
  onEscape?: () => void;
  /** Read-only boards (replay) take no input. */
  interactive?: boolean;
}

const DRAG_THRESHOLD_PX = 6;

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
  onDragStart,
  onDrop,
  animation,
  onEscape,
  interactive = true,
}: Props) {
  const { board, armies, sideToMove } = gameState;
  const boardRef = useRef<HTMLDivElement>(null);
  const squareRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Drag state ──
  const dragRef = useRef<{ from: Square; x: number; y: number; pointerId: number; active: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [ghost, setGhost] = useState<{ from: Square; x: number; y: number; size: number } | null>(null);

  // ── Keyboard focus (roving tabindex) ──
  const squares = boardSquaresInOrder(flipped);
  const [focusSq, setFocusSq] = useState<Square>(squares[56]); // visual bottom-left

  // ── Animation: a ply animates only if it is newer than the position the board
  // mounted with and not older than any ply already shown (an undo never replays
  // the previous move). The element key stays stable across re-renders of the same
  // ply, so a re-render mid-animation doesn't restart or cut it.
  const keysRef = useRef<{ mount: number; max: number } | null>(null);
  if (keysRef.current === null) keysRef.current = { mount: animation?.key ?? 0, max: animation?.key ?? 0 };
  const keys = keysRef.current;
  if (animation && animation.key > keys.max) keys.max = animation.key;
  const animate = !!animation && animation.key > keys.mount && animation.key >= keys.max;

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

  function visualPos(sq: Square): { col: number; row: number } {
    const rank = squareRank(sq), file = squareFile(sq);
    return flipped ? { col: 7 - file, row: rank } : { col: file, row: 7 - rank };
  }

  function squareAtPoint(clientX: number, clientY: number): Square | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squares[row * 8 + col];
  }

  // ── Pointer handlers (drag); taps fall through to the click handler ──
  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    suppressClickRef.current = false;
    if (!interactive || !onDragStart || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const sq = squareAtPoint(e.clientX, e.clientY);
    if (sq === null || !board[sq]) return;
    dragRef.current = { from: sq, x: e.clientX, y: e.clientY, pointerId: e.pointerId, active: false };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = boardRef.current;
    if (!el) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD_PX) return;
      if (!onDragStart?.(d.from)) { dragRef.current = null; return; }
      d.active = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    }
    const rect = el.getBoundingClientRect();
    setGhost({ from: d.from, x: e.clientX - rect.left, y: e.clientY - rect.top, size: rect.width / 8 });
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.active || d.pointerId !== e.pointerId) return;
    setGhost(null);
    suppressClickRef.current = true; // the click that follows a drop is not a tap
    const target = squareAtPoint(e.clientX, e.clientY);
    if (target !== null && target !== d.from) onDrop?.(d.from, target);
  }

  function handlePointerCancel() {
    dragRef.current = null;
    setGhost(null);
  }

  function handleClick(sq: Square) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (!interactive) return;
    setFocusSq(sq);
    onSquareClick(sq);
  }

  // ── Keyboard: arrows move focus (in screen directions), Enter/Space taps ──
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    const { col, row } = visualPos(focusSq);
    let next: { col: number; row: number } | null = null;
    switch (e.key) {
      case 'ArrowLeft':  next = { col: Math.max(0, col - 1), row }; break;
      case 'ArrowRight': next = { col: Math.min(7, col + 1), row }; break;
      case 'ArrowUp':    next = { col, row: Math.max(0, row - 1) }; break;
      case 'ArrowDown':  next = { col, row: Math.min(7, row + 1) }; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSquareClick(focusSq);
        return;
      case 'Escape':
        onEscape?.();
        return;
      default:
        return;
    }
    e.preventDefault();
    const sq = squares[next.row * 8 + next.col];
    setFocusSq(sq);
    squareRefs.current[sq]?.focus();
  }

  const classesFor = ['board'];
  if (ghost) classesFor.push('board-dragging');
  if (!interactive) classesFor.push('board-readonly');

  return (
    <div
      ref={boardRef}
      className={classesFor.join(' ')}
      role="grid"
      aria-label="Chess board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
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
          ghost?.from === sq ? 'drag-origin' : '',
        ].filter(Boolean).join(' ');

        const isEmpowered = empoweredSquares?.has(sq);
        const isExhausted = exhaustedSquares?.has(sq);
        const label = squareLabel(sq, piece, armies, isEmpowered, isExhausted);

        // Slide / appear animation for the piece now on this square
        let pieceKey = 'p';
        let pieceClass = 'piece-slot';
        let pieceStyle: CSSProperties | undefined;
        if (animate && animation) {
          const origin = animation.slides.get(sq);
          if (origin !== undefined && piece) {
            const a = visualPos(origin), b = visualPos(sq);
            pieceKey = `p${animation.key}`;
            pieceClass += ' anim-slide';
            pieceStyle = { '--dx': `${(a.col - b.col) * 100}%`, '--dy': `${(a.row - b.row) * 100}%` } as CSSProperties;
          } else if (animation.appears.includes(sq) && piece) {
            pieceKey = `p${animation.key}`;
            pieceClass += ' anim-appear';
          }
        }
        const impact = animate && animation?.impacts.includes(sq);

        return (
          <div
            key={sq}
            ref={el => { squareRefs.current[sq] = el; }}
            className={classes}
            role="gridcell"
            aria-label={label}
            aria-selected={selectedSquare === sq}
            title={piece ? label : undefined}
            tabIndex={interactive ? (sq === focusSq ? 0 : -1) : undefined}
            data-sq={sq}
            data-rank={rank}
            onClick={() => handleClick(sq)}
            onFocus={() => setFocusSq(sq)}
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
            {impact && <span key={`i${animation!.key}`} className="impact-burst" aria-hidden />}
            {piece && (
              <span key={pieceKey} className={pieceClass} style={pieceStyle}>
                <PieceGlyph
                  piece={piece}
                  armies={armies}
                  empowered={isEmpowered}
                  exhausted={isExhausted}
                />
              </span>
            )}
          </div>
        );
      })}
      {ghost && board[ghost.from] && (
        <span
          className="drag-ghost"
          style={{
            width: ghost.size,
            height: ghost.size,
            transform: `translate(${ghost.x - ghost.size / 2}px, ${ghost.y - ghost.size / 2}px)`,
          }}
          aria-hidden
        >
          <PieceGlyph piece={board[ghost.from]!} armies={armies} />
        </span>
      )}
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
    case 'march':    return primary.from;
  }
}

function getLastTo(primary: Turn['primary']): Square | null {
  switch (primary.type) {
    case 'standard': return primary.to;
    case 'teleport': return primary.to;
    case 'shatter':  return null;
    case 'rampage':  return primary.to;
    case 'strike':   return primary.target;
    case 'march':    return primary.to;
  }
}

function squareLabel(
  sq: Square,
  piece: GameState['board'][number],
  armies: GameState['armies'],
  empowered?: boolean,
  exhausted?: boolean,
): string {
  const file = String.fromCharCode(97 + (sq % 8));
  const rank = Math.floor(sq / 8) + 1;
  const coord = `${file}${rank}`;
  if (!piece) return coord;
  const army = armies[piece.color];
  const name = getSlotName(piece.slot, army);
  const status = empowered ? ' — in Concord' : exhausted ? ' — Exhausted' : '';
  return `${coord}: ${piece.color === 'W' ? 'White' : 'Black'} ${name}${status}`;
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
