import type { GameState, Turn, StandardMove, TeleportMove, Shatter } from './types';
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

  // Pre-compute: is the current player in check before moving?
  const royalsCheckedBefore = ownModel.royalsInCheck(state, color);
  const inCheckBefore = royalsCheckedBefore.length > 0;

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

    // captureConstraints: target army may restrict who can capture its pieces.
    // Checked for both StandardMove captures and TeleportMove captures.
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
    if (primary.type === 'teleport') {
      const tp = primary as TeleportMove;
      if (tp.isCapture) {
        const targetPiece = state.board[tp.to];
        if (targetPiece) {
          const targetArmy = targetPiece.color === 'W' ? state.armies.W : state.armies.B;
          const targetModel = getThreatModel(targetArmy);
          if (targetModel.captureConstraints) {
            if (!targetModel.captureConstraints(state, tp.from, tp.to)) return false;
          }
        }
      }
    }

    // Opponent's checkResponseConstraint: restricts how the mover may answer check
    if (inCheckBefore && oppModel.checkResponseConstraint) {
      if (!oppModel.checkResponseConstraint(state, turn)) return false;
    }

    // General: own royals must not be in check after turn
    const after = applyTurnUnchecked(state, turn);
    return ownModel.royalsInCheck(after, color).length === 0;
  });
}

function rallyEq(a: Turn['rally'], b: Turn['rally']): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.from === b.from && a.to === b.to;
}

export function applyTurn(state: GameState, turn: Turn): GameState {
  const legal = legalTurns(state);
  const primary = turn.primary;
  const found = legal.some(t => {
    const tp = t.primary;
    if (tp.type !== primary.type) return false;
    if (!rallyEq(t.rally, turn.rally)) return false;
    if (tp.type === 'standard' && primary.type === 'standard') {
      return tp.from === (primary as StandardMove).from &&
        tp.to === (primary as StandardMove).to &&
        (tp.promotion ?? null) === ((primary as StandardMove).promotion ?? null);
    }
    if (tp.type === 'teleport' && primary.type === 'teleport') {
      return tp.from === (primary as TeleportMove).from &&
        tp.to === (primary as TeleportMove).to &&
        tp.isCapture === (primary as TeleportMove).isCapture;
    }
    if (tp.type === 'shatter' && primary.type === 'shatter') {
      return (tp as Shatter).warlordSquare === (primary as Shatter).warlordSquare;
    }
    return false;
  });
  if (!found) throw new Error('applyTurn: illegal move');
  return applyTurnUnchecked(state, turn);
}
