import type { GameState, Turn, StandardMove } from './types';
import { getThreatModel } from './threat';
import { getGenerator } from './movegen';
import { applyTurnUnchecked } from './apply';

export function legalTurns(state: GameState): Turn[] {
  const color = state.sideToMove;
  const army = color === 'W' ? state.armies.W : state.armies.B;
  const gen = getGenerator(army);
  if (!gen) return [];

  const pseudo = gen(state);

  const oppColor = color === 'W' ? 'B' : 'W' as const;
  const oppArmy = oppColor === 'W' ? state.armies.W : state.armies.B;
  const oppModel = getThreatModel(oppArmy);
  const ownModel = getThreatModel(army);

  return pseudo.filter(turn => {
    const primary = turn.primary;

    // Castling extra checks (king must not be in/through check)
    if (primary.type === 'standard') {
      const mv = primary as StandardMove;
      const piece = state.board[mv.from];
      if (piece?.slot === 'K' && Math.abs((mv.to & 7) - (mv.from & 7)) === 2) {
        const attacked = oppModel.attackedSquares(state, oppColor);
        if (attacked.has(mv.from)) return false;
        const midFile = (mv.to & 7) > (mv.from & 7) ? (mv.from & 7) + 1 : (mv.from & 7) - 1;
        const midSq = (mv.from >> 3) * 8 + midFile;
        if (attacked.has(midSq)) return false;
      }
    }

    // captureConstraints: check target side's army constraint on any capture
    if (primary.type === 'standard') {
      const mv = primary as StandardMove;
      const targetPiece = state.board[mv.to];
      if (targetPiece) {
        const targetArmy = targetPiece.color === 'W' ? state.armies.W : state.armies.B;
        const targetModel = getThreatModel(targetArmy);
        if (targetModel.captureConstraints) {
          if (!targetModel.captureConstraints(state, mv.from, mv.to)) return false;
        }
      }
    }

    // General: own royals must not be in check after turn
    const after = applyTurnUnchecked(state, turn);
    return ownModel.royalsInCheck(after, color).length === 0;
  });
}

export function applyTurn(state: GameState, turn: Turn): GameState {
  const legal = legalTurns(state);
  const primary = turn.primary;
  const found = legal.some(t => {
    const tp = t.primary;
    if (tp.type !== primary.type) return false;
    if (tp.type === 'standard' && primary.type === 'standard') {
      return tp.from === primary.from && tp.to === primary.to &&
        (tp.promotion ?? null) === (primary.promotion ?? null);
    }
    return false;
  });
  if (!found) throw new Error('applyTurn: illegal move');
  return applyTurnUnchecked(state, turn);
}

