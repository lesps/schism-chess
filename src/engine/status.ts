import type { Color, GameState } from './types';
import { getThreatModel } from './threat';
import { legalTurns } from './legality';
import { positionKey } from './positionKey';

export type GameStatus =
  | { type: 'ongoing' }
  | { type: 'win'; by: 'checkmate' | 'invasion' | 'stalemate-loss'; winner: Color }
  | { type: 'draw'; by: 'threefold' | 'fifty-move' | 'material' };

export function gameStatus(state: GameState): GameStatus {
  const current = state.sideToMove;
  const previous: Color = current === 'W' ? 'B' : 'W';

  // 1. Invasion win — check if the previous mover's royals have crossed the midline.
  // White invades by reaching row >= 4 (rank 5+); Black by reaching row <= 3 (rank 4-).
  // For Twins: BOTH Warlords must be across the midline (neither in check).
  // For all other armies: any one royal on or beyond the invasion row wins.
  const prevArmy = previous === 'W' ? state.armies.W : state.armies.B;
  const prevModel = getThreatModel(prevArmy);
  const invasionRowMin = previous === 'W' ? 4 : 0;  // row >= 4 for White
  const invasionRowMax = previous === 'W' ? 7 : 3;  // row <= 3 for Black

  if (prevArmy === 'Twins') {
    // Both Warlords must be on the far side of the midline, neither in check
    const warlords: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === previous && p.slot === 'K') warlords.push(sq);
    }
    if (warlords.length >= 2 &&
        warlords.every(sq => (sq >> 3) >= invasionRowMin && (sq >> 3) <= invasionRowMax) &&
        prevModel.royalsInCheck(state, previous).length === 0) {
      return { type: 'win', by: 'invasion', winner: previous };
    }
  } else {
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      const row = sq >> 3;
      if (p && p.color === previous && p.slot === 'K' &&
          row >= invasionRowMin && row <= invasionRowMax) {
        if (prevModel.royalsInCheck(state, previous).length === 0) {
          return { type: 'win', by: 'invasion', winner: previous };
        }
      }
    }
  }

  // 2. Threefold repetition
  const key = positionKey(state);
  let keyCount = 0;
  for (const k of state.positionKeys) {
    if (k === key) keyCount++;
  }
  if (keyCount >= 3) return { type: 'draw', by: 'threefold' };

  // 3. Fifty-move rule (100 half-moves)
  if (state.halfmoveClock >= 100) return { type: 'draw', by: 'fifty-move' };

  // 4. Insufficient material (stub — invasion makes bare-king positions winnable)
  // if (insufficientMaterial(state)) return { type: 'draw', by: 'material' };

  // 5. No legal moves for current side
  const moves = legalTurns(state);
  if (moves.length === 0) {
    const currArmy = current === 'W' ? state.armies.W : state.armies.B;
    const currModel = getThreatModel(currArmy);
    const inCheck = currModel.royalsInCheck(state, current).length > 0;
    return inCheck
      ? { type: 'win', by: 'checkmate', winner: previous }
      : { type: 'win', by: 'stalemate-loss', winner: previous };
  }

  return { type: 'ongoing' };
}
