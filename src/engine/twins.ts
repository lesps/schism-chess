import type { Color, GameState, Shatter, Square, StandardMove, Turn, RallyStep } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

const ALL_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]] as const;
const DIAG_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
const ORTHO_DIRS = [[-1,0],[1,0],[0,-1],[0,1]] as const;

/** Squares adjacent to sq that are on the board (8-neighbors, clipped). */
export function neighbors(sq: Square): Square[] {
  const rank = sq >> 3, file = sq & 7;
  const out: Square[] = [];
  for (const [dr, df] of ALL_DIRS) {
    const r = rank + dr, f = file + df;
    if (r >= 0 && r <= 7 && f >= 0 && f <= 7) out.push(r * 8 + f);
  }
  return out;
}

/** Squares of all Warlords (slot='K') for a color. */
export function warlordSquares(board: GameState['board'], color: Color): Square[] {
  const result: Square[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.color === color && p.slot === 'K') result.push(sq);
  }
  return result;
}

/**
 * Returns the Warlord squares that are currently in check.
 * Uses a temporary state (baseState with the given board) for threat model queries.
 */
function warlordChecks(board: GameState['board'], color: Color, baseState: GameState): Square[] {
  const tmp: GameState = { ...baseState, board };
  const oppColor: Color = color === 'W' ? 'B' : 'W';
  const oppArmy = oppColor === 'W' ? baseState.armies.W : baseState.armies.B;
  const oppModel = getThreatModel(oppArmy);
  const attacked = oppModel.attackedSquares(tmp, oppColor);
  return warlordSquares(board, color).filter(sq => attacked.has(sq));
}

/** Apply a Shatter to a board copy — removes all pieces on the 8 surrounding squares. */
export function applyShatterToBoard(board: GameState['board'], warlordSq: Square): GameState['board'] {
  const b = board.slice() as GameState['board'];
  for (const n of neighbors(warlordSq)) b[n] = null;
  return b;
}

/** Apply a StandardMove (primary) to a board copy. Handles promotion. */
function applyStdToBoard(board: GameState['board'], mv: StandardMove): GameState['board'] {
  const b = board.slice() as GameState['board'];
  const piece = b[mv.from]!;
  b[mv.to] = mv.promotion ? { slot: mv.promotion, color: piece.color } : piece;
  b[mv.from] = null;
  return b;
}

/** Apply a RallyStep to a board copy. */
export function applyRallyToBoard(board: GameState['board'], rally: RallyStep): GameState['board'] {
  const b = board.slice() as GameState['board'];
  b[rally.to] = b[rally.from];
  b[rally.from] = null;
  return b;
}

/** Compute the board after a primary action. */
function boardAfterPrimary(board: GameState['board'], primary: Turn['primary']): GameState['board'] {
  if (primary.type === 'standard') return applyStdToBoard(board, primary as StandardMove);
  if (primary.type === 'shatter') return applyShatterToBoard(board, (primary as Shatter).warlordSquare);
  return board.slice() as GameState['board']; // teleport (shouldn't occur for Twins)
}

// ---------------------------------------------------------------------------
// Non-Warlord piece move generation (FIDE rules for R/B/N/P/Q; no castling)
// ---------------------------------------------------------------------------

function addPawnPrimaries(state: GameState, from: Square, color: Color, out: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  const dir = color === 'W' ? 1 : -1;
  const startRank = color === 'W' ? 1 : 6;
  const promoRank = color === 'W' ? 7 : 0;
  const promos = availablePromotions(state, color); // Twins: never Q

  const push1 = from + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of promos) out.push({ primary: { type: 'standard', from, to: push1, promotion: p } });
    } else {
      out.push({ primary: { type: 'standard', from, to: push1 } });
      if (rank === startRank) {
        const push2 = from + dir * 16;
        if (!board[push2]) out.push({ primary: { type: 'standard', from, to: push2 } });
      }
    }
  }
  for (const df of [-1, 1]) {
    const capFile = file + df;
    if (capFile < 0 || capFile > 7) continue;
    const capSq = (rank + dir) * 8 + capFile;
    const target = board[capSq];
    if (target && target.color !== color) {
      if ((capSq >> 3) === promoRank) {
        for (const p of promos) out.push({ primary: { type: 'standard', from, to: capSq, promotion: p } });
      } else {
        out.push({ primary: { type: 'standard', from, to: capSq } });
      }
    } else if (state.enPassantTarget === capSq) {
      out.push({ primary: { type: 'standard', from, to: capSq } });
    }
  }
}

function addKnightPrimaries(board: GameState['board'], from: Square, color: Color, out: Turn[]): void {
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color) continue;
    out.push({ primary: { type: 'standard', from, to } });
  }
}

function addSlidingPrimaries(
  board: GameState['board'], from: Square, color: Color,
  dirs: readonly (readonly [number, number])[], out: Turn[]
): void {
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of dirs) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) out.push({ primary: { type: 'standard', from, to } });
        break;
      }
      out.push({ primary: { type: 'standard', from, to } });
      r += dr; f += df;
    }
  }
}

// ---------------------------------------------------------------------------
// Twins generator
// ---------------------------------------------------------------------------

/**
 * Generates pseudo-legal Turns for the Twins army, incorporating the
 * one-action-per-check structural constraint:
 *
 *   Single check before turn  → primary alone must resolve it (after primary: 0 Warlords in check).
 *   Double check before turn  → primary + rally together may resolve (end-state filter handles it).
 *
 * The kernel's universal end-state no-self-check filter still applies on top.
 */
function twinsGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;

  // Determine pre-turn check status
  const checkedBefore = warlordChecks(board, color, state);
  const singleCheckBefore = checkedBefore.length === 1;

  // Find warlord squares to detect adjacency for Shatter legality
  const myWarlords = warlordSquares(board, color);

  // Collect primary-only turns (without rally)
  const primaryTurns: Turn[] = [];

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;

    if (piece.slot === 'K') {
      // --- Warlord: king-step move / capture ---
      for (const to of neighbors(sq)) {
        const target = board[to];
        if (target && target.color === color) continue; // can't capture own piece
        primaryTurns.push({ primary: { type: 'standard', from: sq, to } });
      }

      // --- Shatter: illegal if the other Warlord is adjacent ---
      const otherWarlords = myWarlords.filter(w => w !== sq);
      const adjacentOther = otherWarlords.some(w => {
        const dr = Math.abs((w >> 3) - (sq >> 3));
        const df = Math.abs((w & 7) - (sq & 7));
        return Math.max(dr, df) === 1;
      });
      if (!adjacentOther) {
        primaryTurns.push({ primary: { type: 'shatter', warlordSquare: sq } });
      }
    } else {
      // --- Non-Warlord pieces ---
      switch (piece.slot) {
        case 'P': addPawnPrimaries(state, sq, color, primaryTurns); break;
        case 'N': addKnightPrimaries(board, sq, color, primaryTurns); break;
        case 'B': addSlidingPrimaries(board, sq, color, DIAG_DIRS, primaryTurns); break;
        case 'R': addSlidingPrimaries(board, sq, color, ORTHO_DIRS, primaryTurns); break;
        case 'Q':
          addSlidingPrimaries(board, sq, color, DIAG_DIRS, primaryTurns);
          addSlidingPrimaries(board, sq, color, ORTHO_DIRS, primaryTurns);
          break;
      }
    }
  }

  // Expand each primary into primary-only and primary+rally turns
  for (const t of primaryTurns) {
    const midBoard = boardAfterPrimary(board, t.primary);

    // Single-check rule: after the primary, all Warlords must be out of check
    if (singleCheckBefore) {
      const checkedAfter = warlordChecks(midBoard, color, state);
      if (checkedAfter.length > 0) continue; // primary didn't resolve the check
    }

    // Turn without rally
    turns.push(t);

    // Turns with rally: move exactly one Warlord one step, non-capturing
    for (const wSq of warlordSquares(midBoard, color)) {
      for (const to of neighbors(wSq)) {
        if (midBoard[to] !== null) continue; // non-capturing
        turns.push({ primary: t.primary, rally: { from: wSq, to } });
      }
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Twins ThreatModel
// ---------------------------------------------------------------------------

function twinsAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'K': {
        for (const [dr, df] of ALL_DIRS) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
        }
        break;
      }
      case 'P': {
        // Unified threat principle: blocked 7th-rank pawn → no diagonal threat.
        const seventhRank = byColor === 'W' ? 6 : 1;
        if (rank === seventhRank && availablePromotions(state, byColor).length === 0) break;
        const dir = byColor === 'W' ? 1 : -1;
        const r = rank + dir;
        if (r >= 0 && r <= 7) {
          if (file > 0) attacked.add(r * 8 + file - 1);
          if (file < 7) attacked.add(r * 8 + file + 1);
        }
        break;
      }
      case 'N': {
        for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
        }
        break;
      }
      case 'B': {
        for (const [dr, df] of DIAG_DIRS) {
          let r = rank + dr, f = file + df;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
          }
        }
        break;
      }
      case 'R': {
        for (const [dr, df] of ORTHO_DIRS) {
          let r = rank + dr, f = file + df;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
          }
        }
        break;
      }
      case 'Q': {
        for (const [dr, df] of ALL_DIRS) {
          let r = rank + dr, f = file + df;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
          }
        }
        break;
      }
    }
  }

  return attacked;
}

export const twinsThreatModel: ThreatModel = {
  attackedSquares: twinsAttackedSquares,

  royalsInCheck(state: GameState, color: Color): Square[] {
    const oppColor: Color = color === 'W' ? 'B' : 'W';
    const oppArmy = oppColor === 'W' ? state.armies.W : state.armies.B;
    const oppModel = getThreatModel(oppArmy);
    const attacked = oppModel.attackedSquares(state, oppColor);
    // Both Warlords (slot 'K') are royal for Twins
    const result: Square[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === color && p.slot === 'K' && attacked.has(sq)) {
        result.push(sq);
      }
    }
    return result;
  },
};

registerGenerator('Twins', twinsGenerator);
registerThreatModel('Twins', twinsThreatModel);
