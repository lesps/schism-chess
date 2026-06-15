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

  // 1. Invasion win — check if the previous mover's king reached the invasion rank
  const prevArmy = previous === 'W' ? state.armies.W : state.armies.B;
  const prevModel = getThreatModel(prevArmy);
  // White's 5th rank = row index 4; Black's 5th rank (from their side) = row index 3
  const invasionRow = previous === 'W' ? 4 : 3;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p && p.color === previous && p.slot === 'K' && (sq >> 3) === invasionRow) {
      if (prevModel.royalsInCheck(state, previous).length === 0) {
        return { type: 'win', by: 'invasion', winner: previous };
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
