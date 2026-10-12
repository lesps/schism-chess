import type { Color, GameState, Square } from './types';
import { serializeSfen } from './sfen';
import { getThreatModel } from './threat';

// Position key for threefold-repetition detection — standard (FIDE 9.2.3) identity:
// the same side to move, the same pieces on the same squares, and the same possible
// moves. So castling rights are included, and the en-passant square is included only
// when an en-passant capture is actually legal (a double step with no pawn able to
// take it changes nothing). Variant state that changes what pieces can do is included
// too: Essence (RULES.md §Draws) and Stalker exhaustion.
// Excludes: armies (invariant per game), halfmoveClock, fullmoveNumber, positionKeys.
export function positionKey(state: GameState): string {
  const sfen = serializeSfen(state);
  const parts = sfen.split('/');
  // Tokens: [0..7]=board ranks, [8]=side, [9]=armies, [10]=castling,
  //         [11]=ep, [12]=essence, [13]=exhausted, [14]=halfmove, [15]=fullmove
  const board = parts.slice(0, 8).join('/');
  const ep = enPassantCapturable(state) ? parts[11] : '-';
  return [board, parts[8], parts[10], ep, parts[12], parts[13]].join(':');
}

/** True iff the side to move has a legal en-passant capture available. */
function enPassantCapturable(state: GameState): boolean {
  const ep = state.enPassantTarget;
  if (ep === null) return false;
  const mover = state.sideToMove;
  const army = mover === 'W' ? state.armies.W : state.armies.B;
  if (army === 'Phantom') return false; // Thralls never capture en passant

  const dir = mover === 'W' ? 1 : -1;
  const victimSq = ep - dir * 8;
  const victim = state.board[victimSq];
  if (!victim || victim.slot !== 'P' || victim.color === mover) return false;

  const fromRank = (ep >> 3) - dir;
  for (const df of [-1, 1]) {
    const file = (ep & 7) + df;
    if (file < 0 || file > 7) continue;
    const from = fromRank * 8 + file;
    const p = state.board[from];
    if (p && p.color === mover && p.slot === 'P' && epCaptureIsLegal(state, from, ep, victimSq)) return true;
  }
  return false;
}

// Mirrors the legality pipeline for this one move without calling legalTurns (which
// applies turns, which compute position keys): no own royal left in check, the
// opponent's check-response rule (a piercing Shade check can't be answered by an
// interposing pawn), and the Twins' option of a Rally completing a double-check escape.
function epCaptureIsLegal(state: GameState, from: Square, to: Square, victimSq: Square): boolean {
  const mover = state.sideToMove;
  const opp: Color = mover === 'W' ? 'B' : 'W';
  const army = mover === 'W' ? state.armies.W : state.armies.B;
  const oppArmy = opp === 'W' ? state.armies.W : state.armies.B;
  let ownModel, oppModel;
  try {
    ownModel = getThreatModel(army);
    oppModel = getThreatModel(oppArmy);
  } catch {
    return true; // army modules not loaded (bare unit tests): fall back to pseudo-legal
  }

  const checkedBefore = ownModel.royalsInCheck(state, mover);
  if (checkedBefore.length > 0 && oppModel.checkResponseConstraint &&
      !oppModel.checkResponseConstraint(state, { primary: { type: 'standard', from, to } })) {
    return false;
  }

  const board = state.board.slice();
  board[to] = board[from];
  board[from] = null;
  board[victimSq] = null;
  const after: GameState = { ...state, board, enPassantTarget: null };
  const checkedAfter = ownModel.royalsInCheck(after, mover);
  if (checkedAfter.length === 0) return true;
  // Twins: a lone check must be answered by the primary alone; a double check may be
  // finished off by the Rally (one Warlord, one step, onto an empty square).
  if (army !== 'Twins' || checkedBefore.length < 2) return false;
  for (let w = 0; w < 64; w++) {
    const p = board[w];
    if (!p || p.color !== mover || p.slot !== 'K') continue;
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const r = (w >> 3) + dr, f = (w & 7) + df;
        if (r < 0 || r > 7 || f < 0 || f > 7 || board[r * 8 + f]) continue;
        const rallied = board.slice();
        rallied[r * 8 + f] = rallied[w];
        rallied[w] = null;
        if (ownModel.royalsInCheck({ ...after, board: rallied }, mover).length === 0) return true;
      }
    }
  }
  return false;
}
