import type { Color, GameState, Square, StandardMove, TeleportMove, Turn } from './types';
import { positionKey } from './positionKey';

function updateCastlingRights(rights: string, from: Square, to: Square): string {
  let r = rights;
  if (from === 4) { r = r.replace('K', '').replace('Q', ''); }
  if (from === 60) { r = r.replace('k', '').replace('q', ''); }
  if (from === 0 || to === 0) r = r.replace('Q', '');
  if (from === 7 || to === 7) r = r.replace('K', '');
  if (from === 56 || to === 56) r = r.replace('q', '');
  if (from === 63 || to === 63) r = r.replace('k', '');
  return r.length > 0 ? r : '-';
}

export function applyTurnUnchecked(state: GameState, turn: Turn): GameState {
  const primary = turn.primary;
  const moverColor = state.sideToMove;
  const moverArmy = moverColor === 'W' ? state.armies.W : state.armies.B;

  const board = state.board.slice() as GameState['board'];
  let halfmoveClock = state.halfmoveClock;
  let enPassantTarget: Square | null = null;
  let castlingRights = state.castlingRights;
  let essence = { ...state.essence };
  let lastTurnMeta: GameState['lastTurnMeta'] = undefined;

  if (primary.type === 'standard') {
    const mv = primary as StandardMove;
    const { from, to, promotion } = mv;
    const piece = board[from]!;

    const isEnPassant = piece.slot === 'P' && to === state.enPassantTarget;
    const isCastling = piece.slot === 'K' && Math.abs((to & 7) - (from & 7)) === 2;
    const capturedPiece = isEnPassant
      ? board[moverColor === 'W' ? to - 8 : to + 8]
      : board[to];
    const isCapture = capturedPiece !== null;

    // Essence accounting for Veil army
    if (moverArmy === 'Veil' && isCapture && capturedPiece) {
      if (piece.slot === 'Q') {
        // Wraith capture costs 1 Essence (no gain even if capturing a pawn)
        const prev = essence[moverColor];
        essence = moverColor === 'W'
          ? { W: prev - 1, B: essence.B }
          : { W: essence.W, B: prev - 1 };
        lastTurnMeta = { essenceDelta: { color: moverColor, from: prev, to: prev - 1 } };
      } else if (capturedPiece.slot === 'P') {
        // Non-Wraith captures enemy pawn/Thrall: gain 1 Essence (capped at 4)
        const prev = essence[moverColor];
        const next = Math.min(4, prev + 1);
        essence = moverColor === 'W'
          ? { W: next, B: essence.B }
          : { W: essence.W, B: next };
        if (next !== prev) {
          lastTurnMeta = { essenceDelta: { color: moverColor, from: prev, to: next } };
        }
      }
    }

    halfmoveClock = (piece.slot === 'P' || isCapture) ? 0 : halfmoveClock + 1;

    board[from] = null;
    board[to] = promotion ? { slot: promotion, color: piece.color } : piece;

    if (isEnPassant) {
      const epPawn: Square = moverColor === 'W' ? to - 8 : to + 8;
      board[epPawn] = null;
    }

    if (isCastling) {
      const kingSide = (to & 7) > (from & 7);
      const rookRank = from >> 3;
      const rookFrom: Square = kingSide ? rookRank * 8 + 7 : rookRank * 8 + 0;
      const rookTo: Square = kingSide ? rookRank * 8 + 5 : rookRank * 8 + 3;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = null;
    }

    if (piece.slot === 'P' && Math.abs((to >> 3) - (from >> 3)) === 2) {
      enPassantTarget = (from + to) / 2;
    }

    castlingRights = updateCastlingRights(state.castlingRights, from, to);

  } else if (primary.type === 'teleport') {
    const { from, to, isCapture } = primary as TeleportMove;
    const piece = board[from]!;

    // Essence accounting for Veil Wraith teleport-capture
    if (moverArmy === 'Veil' && isCapture && piece.slot === 'Q') {
      const prev = essence[moverColor];
      essence = moverColor === 'W'
        ? { W: prev - 1, B: essence.B }
        : { W: essence.W, B: prev - 1 };
      lastTurnMeta = { essenceDelta: { color: moverColor, from: prev, to: prev - 1 } };
    }

    halfmoveClock = isCapture ? 0 : halfmoveClock + 1;

    board[from] = null;
    board[to] = piece;

    // No en passant from a teleport; castling rights may change if a rook-corner is vacated/captured
    castlingRights = updateCastlingRights(state.castlingRights, from, to);

  } else {
    throw new Error(`applyTurnUnchecked: unsupported move type '${(primary as { type: string }).type}'`);
  }

  const sideToMove: Color = moverColor === 'W' ? 'B' : 'W';
  const fullmoveNumber = moverColor === 'B' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  const newState: GameState = {
    ...state,
    board,
    sideToMove,
    castlingRights,
    enPassantTarget,
    essence,
    halfmoveClock,
    fullmoveNumber,
    lastTurnMeta,
    positionKeys: state.positionKeys,
  };

  const key = positionKey(newState);
  newState.positionKeys = [...state.positionKeys, key];
  return newState;
}
