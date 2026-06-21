import type { Color, GameState, Slot, Square, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator } from './movegen';

const ORTHO_DIRS = [[-1,0],[1,0],[0,-1],[0,1]] as const;
const DIAG_DIRS  = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
const KNIGHT_JUMPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const;

function pushStd(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: { type: 'standard'; from: Square; to: Square; promotion?: Slot } =
    { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

// Apex (Q-slot): chancellor — Rook slides OR Knight jumps. Captures normally (enemy only).
function addApexMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of ORTHO_DIRS) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
    }
  }

  for (const [dr, df] of KNIGHT_JUMPS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color) continue;
    pushStd(turns, from, to);
  }
}

// Behemoth (R-slot, interim): up to 3 squares orthogonally; may capture friendly pieces (not royals).
// S7b: replace with rampage (capture triggers continuation in same direction, up to 3 squares total).
function addBehemothMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of ORTHO_DIRS) {
    let r = rank + dr, f = file + df;
    let steps = 0;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 3) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color === color) {
          if (tp.slot !== 'K') pushStd(turns, from, to); // friendly non-royal: may capture
        } else {
          pushStd(turns, from, to); // enemy capture
        }
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
      steps++;
    }
  }
}

// Stalker (B-slot, interim): up to 2 squares diagonally; ordinary enemy capture only.
// S7b: replace with strike-and-return + exhaustion.
function addStalkerMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of DIAG_DIRS) {
    let r = rank + dr, f = file + df;
    let steps = 0;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 2) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
      steps++;
    }
  }
}

// Bronco (N-slot): standard Knight; may capture friendly pieces but never own royal (K-slot).
function addBroncoMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of KNIGHT_JUMPS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color && tp.slot === 'K') continue; // never capture own royal
    pushStd(turns, from, to);
  }
}

function addKingMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const rank = from >> 3, file = from & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const to = r * 8 + f;
      const tp = state.board[to];
      if (tp && tp.color === color) continue;
      pushStd(turns, from, to);
    }
  }
}

function addPawnMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  const dir = color === 'W' ? 1 : -1;
  const startRank = color === 'W' ? 1 : 6;
  const promoRank = color === 'W' ? 7 : 0;

  const push1 = from + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of ['Q', 'R', 'B', 'N'] as Slot[]) pushStd(turns, from, push1, p);
    } else {
      pushStd(turns, from, push1);
      if (rank === startRank) {
        const push2 = from + dir * 16;
        if (!board[push2]) pushStd(turns, from, push2);
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
        for (const p of ['Q', 'R', 'B', 'N'] as Slot[]) pushStd(turns, from, capSq, p);
      } else {
        pushStd(turns, from, capSq);
      }
    } else if (state.enPassantTarget === capSq) {
      pushStd(turns, from, capSq);
    }
  }
}

function wildGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, from, color, turns); break;
      case 'Q': addApexMoves(state, from, color, turns); break;
      case 'R': addBehemothMoves(state, from, color, turns); break;
      case 'B': addStalkerMoves(state, from, color, turns); break;
      case 'N': addBroncoMoves(state, from, color, turns); break;
      case 'P': addPawnMoves(state, from, color, turns); break;
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Wild ThreatModel
// ---------------------------------------------------------------------------

function wildAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== byColor) continue;
    const rank = from >> 3, file = from & 7;

    switch (piece.slot) {
      case 'Q': { // Apex: orthogonal slides + knight jumps
        for (const [dr, df] of ORTHO_DIRS) {
          let r = rank + dr, f = file + df;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
          }
        }
        for (const [dr, df] of KNIGHT_JUMPS) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
        }
        break;
      }
      case 'R': { // Behemoth: up to 3 squares orthogonally (interim; same for S7b)
        for (const [dr, df] of ORTHO_DIRS) {
          let r = rank + dr, f = file + df;
          let steps = 0;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 3) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
            steps++;
          }
        }
        break;
      }
      case 'B': { // Stalker: up to 2 squares diagonally (interim; same for S7b)
        for (const [dr, df] of DIAG_DIRS) {
          let r = rank + dr, f = file + df;
          let steps = 0;
          while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 2) {
            attacked.add(r * 8 + f);
            if (board[r * 8 + f]) break;
            r += dr; f += df;
            steps++;
          }
        }
        break;
      }
      case 'N': { // Bronco: standard knight attacks
        for (const [dr, df] of KNIGHT_JUMPS) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
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
      case 'P': {
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

function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));
}

const wildThreatModel: ThreatModel = {
  attackedSquares: wildAttackedSquares,

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

  // Behemoth Armor: an enemy piece may capture a Behemoth (R-slot) only if it starts
  // within Chebyshev 2 of the Behemoth's square. Friendly captures bypass Armor.
  // Shatter is not routed through captureConstraints and always clears adjacent pieces.
  captureConstraints(state: GameState, capturerFrom: Square, targetSq: Square): boolean {
    const target = state.board[targetSq];
    if (!target || target.slot !== 'R') return true; // only Behemoths (R-slot) have Armor
    const capturer = state.board[capturerFrom];
    if (capturer && capturer.color === target.color) return true; // friendly capture: no Armor
    return chebyshev(capturerFrom, targetSq) <= 2;
  },
};

registerGenerator('Wild', wildGenerator);
registerThreatModel('Wild', wildThreatModel);
