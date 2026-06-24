import type { Color, GameState, Slot, Square, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

const ALL_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]] as const;

function pushTeleport(turns: Turn[], from: Square, to: Square, isCapture: boolean): void {
  turns.push({ primary: { type: 'teleport', from, to, isCapture } });
}

function pushStandard(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: { type: 'standard'; from: Square; to: Square; promotion?: Slot } =
    { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

// Wraith (Q-slot): Queen slides + teleport to squares not reachable by sliding.
// At essence=0: no captures; at essence≥1: slide-captures and teleport-captures enabled.
function addWraithMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const essence = color === 'W' ? state.essence.W : state.essence.B;
  const rank = sq >> 3, file = sq & 7;

  // Track squares already covered by sliding to avoid duplicate moves for teleport.
  const slideReachable = new Set<Square>();

  // Sliding moves (Queen geometry)
  for (const [dr, df] of ALL_DIRS) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = board[target];
      if (tp) {
        if (tp.color !== color && essence > 0) {
          pushStandard(turns, sq, target); // slide capture (costs Essence)
          slideReachable.add(target);
        }
        break;
      }
      pushStandard(turns, sq, target); // slide to empty square
      slideReachable.add(target);
      r += dr; f += df;
    }
  }

  // Teleport moves: only to squares NOT already reachable by sliding.
  // Avoids duplicate (from, to) pairs with the standard moves above.
  for (let t = 0; t < 64; t++) {
    if (t === sq || slideReachable.has(t)) continue;
    const tp = board[t];
    if (!tp) {
      pushTeleport(turns, sq, t, false); // teleport to empty square
    } else if (tp.color !== color && essence > 0) {
      pushTeleport(turns, sq, t, true); // teleport capture (costs Essence)
    }
  }
}

// Wisp (R-slot): teleport only to empty squares. No captures, no sliding.
function addWispMoves(state: GameState, sq: Square, _color: Color, turns: Turn[]): void {
  const board = state.board;
  for (let t = 0; t < 64; t++) {
    if (t === sq || board[t]) continue;
    pushTeleport(turns, sq, t, false);
  }
}

// Promoted FIDE Rook: standard orthogonal slides with captures.
function addRookSlideMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = board[target];
      if (tp) {
        if (tp.color !== color) pushStandard(turns, sq, target);
        break;
      }
      pushStandard(turns, sq, target);
      r += dr; f += df;
    }
  }
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
      pushStandard(turns, sq, target);
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
    pushStandard(turns, sq, target);
  }
}

function addBishopMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of [[-1,-1],[-1,1],[1,-1],[1,1]] as const) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = board[target];
      if (tp) {
        if (tp.color !== color) pushStandard(turns, sq, target);
        break;
      }
      pushStandard(turns, sq, target);
      r += dr; f += df;
    }
  }
}

function addPawnMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  const dir = color === 'W' ? 1 : -1;
  const startRank = color === 'W' ? 1 : 6;
  const promoRank = color === 'W' ? 7 : 0;

  const promos = availablePromotions(state, color);
  const push1 = sq + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of promos) pushStandard(turns, sq, push1, p);
    } else {
      pushStandard(turns, sq, push1);
      if (rank === startRank) {
        const push2 = sq + dir * 16;
        if (!board[push2]) pushStandard(turns, sq, push2);
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
        for (const p of promos) pushStandard(turns, sq, capSq, p);
      } else {
        pushStandard(turns, sq, capSq);
      }
    } else if (state.enPassantTarget === capSq) {
      pushStandard(turns, sq, capSq);
    }
  }
}

function veilGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, sq, color, turns); break;
      case 'Q': addWraithMoves(state, sq, color, turns); break;
      case 'R':
        if (piece.promoted) {
          addRookSlideMoves(state, sq, color, turns);
        } else {
          addWispMoves(state, sq, color, turns);
        }
        break;
      case 'B': addBishopMoves(state, sq, color, turns); break;
      case 'N': addKnightMoves(state, sq, color, turns); break;
      case 'P': addPawnMoves(state, sq, color, turns); break;
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Veil ThreatModel
// ---------------------------------------------------------------------------

function veilAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;
  const essence = byColor === 'W' ? state.essence.W : state.essence.B;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'Q': {
        // Wraith attacks Queen-LOS only at ≥1 Essence; inert at 0
        if (essence >= 1) {
          for (const [dr, df] of ALL_DIRS) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
        }
        break;
      }
      case 'R': {
        if (piece.promoted) {
          // Promoted FIDE Rook: standard orthogonal attacks
          for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
        }
        // else: Wisp — physically occupies space but does not attack; gives no check
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
      case 'N': {
        for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const) {
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
    }
  }

  return attacked;
}

const veilThreatModel: ThreatModel = {
  attackedSquares: veilAttackedSquares,

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
};

registerGenerator('Veil', veilGenerator);
registerThreatModel('Veil', veilThreatModel);
