import type { Army, GameState, Piece, Turn } from '../engine/types';
import { applyTurnUnchecked, initialState, sanToTurn, isParseError } from '../engine';
import { extractCaptures } from './shared';

export interface HistoryEntry {
  san: string;
  turn: Turn;
  stateBefore: GameState;
  /** Pieces removed by this turn (for the captured tray). */
  captures: Piece[];
}

export interface RebuiltGame {
  state: GameState;
  history: HistoryEntry[];
  /** Set when a SAN could not be replayed; history holds every ply before it. */
  error?: string;
}

/**
 * Rebuild a game from its flat per-ply SAN list (the PBM payload form).
 * Restoring from the move list — not from a SFEN snapshot — keeps the move list,
 * captures, last-move highlight, and the repetition history (positionKeys, which
 * SFEN-X does not carry) intact across refreshes and imports.
 */
export function rebuildGame(armyW: Army, armyB: Army, moves: readonly string[]): RebuiltGame {
  let state = initialState(armyW, armyB);
  const history: HistoryEntry[] = [];
  for (const san of moves) {
    const turn = sanToTurn(state, san);
    if (isParseError(turn)) return { state, history, error: turn.error };
    history.push({ san, turn, stateBefore: state, captures: extractCaptures(state, turn) });
    state = applyTurnUnchecked(state, turn);
  }
  return { state, history };
}

/** All pieces captured so far, grouped by the color of the captured piece. */
export function capturedFromHistory(history: readonly HistoryEntry[]): { W: Piece[]; B: Piece[] } {
  const W: Piece[] = [];
  const B: Piece[] = [];
  for (const h of history) {
    for (const p of h.captures) (p.color === 'W' ? W : B).push(p);
  }
  return { W, B };
}
