import type { Color, GameState, Square, StandardMove, Turn } from './types';
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
  if (primary.type !== 'standard') {
    throw new Error(`applyTurn: only StandardMove implemented; got '${primary.type}'`);
  }
  const mv = primary as StandardMove;
  const { from, to, promotion } = mv;

  const board = state.board.slice() as GameState['board'];
  const piece = board[from]!;

  const isEnPassant = piece.slot === 'P' && to === state.enPassantTarget;
  const isCastling = piece.slot === 'K' && Math.abs((to & 7) - (from & 7)) === 2;
  const isCapture = board[to] !== null || isEnPassant;

  const halfmoveClock = (piece.slot === 'P' || isCapture) ? 0 : state.halfmoveClock + 1;

  board[from] = null;
  board[to] = promotion ? { slot: promotion, color: piece.color } : piece;

  if (isEnPassant) {
    const epPawn: Square = piece.color === 'W' ? to - 8 : to + 8;
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

  let enPassantTarget: Square | null = null;
  if (piece.slot === 'P' && Math.abs((to >> 3) - (from >> 3)) === 2) {
    enPassantTarget = (from + to) / 2;
  }

  const castlingRights = updateCastlingRights(state.castlingRights, from, to);
  const sideToMove: Color = state.sideToMove === 'W' ? 'B' : 'W';
  const fullmoveNumber = state.sideToMove === 'B' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  const newState: GameState = {
    ...state,
    board,
    sideToMove,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
    positionKeys: state.positionKeys,
  };

  const key = positionKey(newState);
  newState.positionKeys = [...state.positionKeys, key];
  return newState;
}
