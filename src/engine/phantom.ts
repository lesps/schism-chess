import type { Color, GameState, RampageMove, Slot, Square, StandardMove, StrikeMove, TeleportMove, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

// Provisional ruling: homing move vs Twins is legal if it reduces distance to at least one Warlord.
export const THRALL_HOMING_TWINS = 'either' as const;

// A homing step must genuinely approach the king: the Chebyshev distance must
// strictly decrease AND neither the rank distance nor the file distance may
// increase. Chebyshev reduction alone is too loose — when one axis dominates,
// a step that drifts away on the other axis (a sideways or even backward
// diagonal) still reduces the max, letting Thralls wander "toward" a king they
// are not actually approaching.
function stepHomesTowardKing(from: Square, to: Square, king: Square): boolean {
  const rankBefore = Math.abs((king >> 3) - (from >> 3));
  const fileBefore = Math.abs((king & 7) - (from & 7));
  const rankAfter = Math.abs((king >> 3) - (to >> 3));
  const fileAfter = Math.abs((king & 7) - (to & 7));
  if (rankAfter > rankBefore || fileAfter > fileBefore) return false;
  return Math.max(rankAfter, fileAfter) < Math.max(rankBefore, fileBefore);
}

const ALL_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]] as const;

function pushMove(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: StandardMove = { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

function addKingMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const rank = sq >> 3, file = sq & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const target = r * 8 + f;
      const tp = state.board[target];
      if (tp && tp.color === color) continue;
      pushMove(turns, sq, target);
    }
  }
}

function addSlidingMoves(
  board: GameState['board'], sq: Square, color: Color,
  dirs: readonly (readonly [number, number])[], captureOk: boolean, turns: Turn[]
): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of dirs) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = board[target];
      if (tp) {
        if (captureOk && tp.color !== color) pushMove(turns, sq, target);
        break;
      }
      pushMove(turns, sq, target);
      r += dr; f += df;
    }
  }
}

function addKnightMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const target = r * 8 + f;
    const tp = state.board[target];
    if (tp && tp.color === color) continue;
    pushMove(turns, sq, target);
  }
}

function addThrallMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  const dir = color === 'W' ? 1 : -1;
  const promoRank = color === 'W' ? 7 : 0;

  const promos = availablePromotions(state, color);

  // A Thrall on the 7th rank with no promotion slots is completely stuck (zero moves).
  const seventhRank = color === 'W' ? 6 : 1;
  if (promos.length === 0 && rank === seventhRank) return;

  // Forward push (no double push, no en passant)
  const push1 = sq + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of promos) pushMove(turns, sq, push1, p);
    } else {
      pushMove(turns, sq, push1);
    }
  }

  // Diagonal captures (no en passant for Thralls)
  for (const df of [-1, 1]) {
    const capFile = file + df;
    if (capFile < 0 || capFile > 7) continue;
    const capSq = (rank + dir) * 8 + capFile;
    const target = board[capSq];
    if (target && target.color !== color) {
      if ((capSq >> 3) === promoRank) {
        for (const p of promos) pushMove(turns, sq, capSq, p);
      } else {
        pushMove(turns, sq, capSq);
      }
    }
    // No en passant
  }

  // Homing move: one square any direction, unoccupied, genuinely toward the enemy king
  // (strict Chebyshev reduction with no per-axis drift — see stepHomesTowardKing).
  // For Twins (two Warlords): legal if it homes toward at least one Warlord (THRALL_HOMING_TWINS = 'either').
  const enemyColor: Color = color === 'W' ? 'B' : 'W';
  const enemyKings: Square[] = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && p.color === enemyColor && p.slot === 'K') enemyKings.push(s);
  }
  if (enemyKings.length === 0) return;

  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      // Skip forward direction — already generated as forward push (avoids duplicates).
      if (dr === dir && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const target = r * 8 + f;
      if (board[target]) continue; // homing requires unoccupied

      const qualifies = THRALL_HOMING_TWINS === 'either'
        ? enemyKings.some(k => stepHomesTowardKing(sq, target, k))
        : enemyKings.every(k => stepHomesTowardKing(sq, target, k));

      if (qualifies) {
        if ((target >> 3) === promoRank) {
          for (const p of promos) pushMove(turns, sq, target, p);
        } else {
          pushMove(turns, sq, target);
        }
      }
    }
  }
}

function phantomGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;

  const DIAGS = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
  const ORTHO = [[-1,0],[1,0],[0,-1],[0,1]] as const;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, sq, color, turns); break;
      case 'Q':
        // Promoted FIDE Queen captures normally; Shade cannot capture
        addSlidingMoves(board, sq, color, ALL_DIRS, !!piece.promoted, turns);
        break;
      case 'R': addSlidingMoves(board, sq, color, ORTHO, true, turns); break;
      case 'B': addSlidingMoves(board, sq, color, DIAGS, true, turns); break;
      case 'N': addKnightMoves(state, sq, color, turns); break;
      case 'P': addThrallMoves(state, sq, color, turns); break;
    }
  }

  return turns;
}

// Check if the Shade at shadeSq has clear line of sight to targetSq (Queen geometry).
function shadeHasLOS(board: GameState['board'], shadeSq: Square, targetSq: Square): boolean {
  const sr = shadeSq >> 3, sf = shadeSq & 7;
  const tr = targetSq >> 3, tf = targetSq & 7;
  const dr = tr - sr, df = tf - sf;

  if (dr !== 0 && df !== 0 && Math.abs(dr) !== Math.abs(df)) return false;

  const stepR = Math.sign(dr);
  const stepF = Math.sign(df);

  let r = sr + stepR, f = sf + stepF;
  while (r !== tr || f !== tf) {
    if (board[r * 8 + f]) return false;
    r += stepR; f += stepF;
  }
  return true;
}

// Find the Shade square (Q-slot, non-promoted) for a given color, or null if captured.
function findShade(board: GameState['board'], color: Color): Square | null {
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.color === color && p.slot === 'Q' && !p.promoted) return sq;
  }
  return null;
}

function phantomAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'Q': {
        // Shade attacks like a Queen for threat purposes (blocks king movement), even though it can't capture.
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
      case 'P': {
        // Unified threat principle: blocked 7th-rank Thrall has no promotion captures → no diagonal threat.
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
        for (const [dr, df] of [[-1,-1],[-1,1],[1,-1],[1,1]] as const) {
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
        for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
          let r = rank + dr, f = file + df;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
          }
        }
        break;
      }
      case 'K': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;
            const r = rank + dr, f = file + df;
            if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
          }
        }
        break;
      }
    }
  }

  return attacked;
}

export const phantomThreatModel: ThreatModel = {
  attackedSquares: phantomAttackedSquares,

  royalsInCheck(state: GameState, color: Color): Square[] {
    const oppColor: Color = color === 'W' ? 'B' : 'W';
    const oppArmy = oppColor === 'W' ? state.armies.W : state.armies.B;
    const oppModel = getThreatModel(oppArmy);
    const attacked = oppModel.attackedSquares(state, oppColor);
    const result: Square[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === color && p.slot === 'K' && attacked.has(sq)) {
        result.push(sq);
      }
    }
    return result;
  },

  // Restricts the OPPONENT's check responses when the Phantom's Shade is giving check.
  // Returns true (allow) or false (veto). Interposition is never a legal response to Shade check.
  checkResponseConstraint(state: GameState, turn: Turn): boolean {
    const moverColor = state.sideToMove;
    const phantomColor: Color = moverColor === 'W' ? 'B' : 'W';

    const shadeSq = findShade(state.board, phantomColor);
    if (shadeSq === null) return true; // Shade captured; no piercing-check restriction

    // Check if any of mover's royals are in check specifically from the Shade
    let shadeIsChecking = false;
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === moverColor && p.slot === 'K') {
        if (shadeHasLOS(state.board, shadeSq, sq)) {
          shadeIsChecking = true;
          break;
        }
      }
    }

    if (!shadeIsChecking) return true; // Shade not in check position; no restriction

    // Shade IS giving check. Only legal responses: move a royal OR capture/remove the Shade.
    if (turn.primary.type === 'standard') {
      const mv = turn.primary as StandardMove;
      // Moving a royal
      const movingPiece = state.board[mv.from];
      if (movingPiece && movingPiece.slot === 'K') return true;
      // Capturing the Shade (any piece moving to the Shade's square)
      if (mv.to === shadeSq) return true;
      return false; // vetoed: interposition or unrelated move
    }

    if (turn.primary.type === 'shatter') {
      // Shatter removes all adjacent pieces. If the Shade is adjacent, it is removed.
      const warlordSq = (turn.primary as import('./types').Shatter).warlordSquare;
      const dr = Math.abs((shadeSq >> 3) - (warlordSq >> 3));
      const df = Math.abs((shadeSq & 7) - (warlordSq & 7));
      if (Math.max(dr, df) <= 1) return true; // Shade adjacent → Shatter removes it
      return false; // Shade not adjacent → Shatter doesn't resolve check
    }

    // Any capture that removes the Shade is a legal response, regardless of mechanism.
    if (turn.primary.type === 'teleport') {
      const tp = turn.primary as TeleportMove;
      return tp.isCapture && tp.to === shadeSq; // Wraith teleport-captures the Shade
    }
    if (turn.primary.type === 'strike') {
      return (turn.primary as StrikeMove).target === shadeSq; // Stalker strikes the Shade
    }
    if (turn.primary.type === 'rampage') {
      return (turn.primary as RampageMove).captures.includes(shadeSq); // rampage clears the Shade
    }

    return false; // all other move types vetoed
  },
};

registerGenerator('Phantom', phantomGenerator);
registerThreatModel('Phantom', phantomThreatModel);
