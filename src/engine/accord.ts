import type { Color, GameState, Slot, Square, StandardMove, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const ORTHOGONALS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const ALL_DIRS = [...DIAGONALS, ...ORTHOGONALS] as const;
const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;

function pushMove(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: StandardMove = { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

// Find the Herald square (Q-slot) for a given color, or null if captured.
// Under Reinforcement Promotion (v2.3) any Q-slot Accord piece IS the Herald.
function findHerald(board: GameState['board'], color: Color): Square | null {
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.color === color && p.slot === 'Q') return sq;
  }
  return null;
}

// The Banner: the Herald's own square + the 8 adjacent squares (3x3, clipped at board edge).
export function bannerZone(board: GameState['board'], color: Color): Set<Square> {
  const zone = new Set<Square>();
  const heraldSq = findHerald(board, color);
  if (heraldSq === null) return zone;
  const rank = heraldSq >> 3, file = heraldSq & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      zone.add(r * 8 + f);
    }
  }
  return zone;
}

// Concord (RULES v2.3): friendly Knights, Bishops, and Rooks inside the Banner pool
// their movement — each may move and capture using the native movement of any of them.
// The pool is the set of N/B/R slots currently present in the Banner. A lone piece's
// pool is just its own slot (it gains nothing). King, Herald, and pawns neither
// contribute nor receive.
export function concordPool(board: GameState['board'], color: Color): Set<Slot> {
  const pool = new Set<Slot>();
  for (const sq of bannerZone(board, color)) {
    const p = board[sq];
    if (p && p.color === color && (p.slot === 'N' || p.slot === 'B' || p.slot === 'R')) {
      pool.add(p.slot);
    }
  }
  return pool;
}

function slideTargets(
  board: GameState['board'], sq: Square, color: Color,
  dirs: readonly (readonly [number, number])[],
): Square[] {
  const rank = sq >> 3, file = sq & 7;
  const result: Square[] = [];
  for (const [dr, df] of dirs) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = board[target];
      if (tp) {
        if (tp.color !== color) result.push(target);
        break;
      }
      result.push(target);
      r += dr; f += df;
    }
  }
  return result;
}

function knightTargets(board: GameState['board'], sq: Square, color: Color): Square[] {
  const rank = sq >> 3, file = sq & 7;
  const result: Square[] = [];
  for (const [dr, df] of KNIGHT_DELTAS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const target = r * 8 + f;
    const tp = board[target];
    if (tp && tp.color === color) continue;
    result.push(target);
  }
  return result;
}

// King-step candidates: one square any direction, move-or-capture (excludes own-piece squares).
function kingStepTargets(board: GameState['board'], sq: Square, color: Color): Square[] {
  const rank = sq >> 3, file = sq & 7;
  const result: Square[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const target = r * 8 + f;
      const tp = board[target];
      if (tp && tp.color === color) continue;
      result.push(target);
    }
  }
  return result;
}

function addHeraldMoves(state: GameState, sq: Square, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const target = r * 8 + f;
      if (!board[target]) pushMove(turns, sq, target); // Herald cannot capture
    }
  }
}

function addKingMoves(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  for (const target of kingStepTargets(state.board, sq, color)) {
    pushMove(turns, sq, target);
  }
}

// Movement for an N/B/R piece under Concord: the union of the native movesets of every
// slot in its pool (its own slot alone when outside the Banner).
function addConcordMoves(
  state: GameState, sq: Square, color: Color, slot: Slot,
  zone: Set<Square>, pool: Set<Slot>, turns: Turn[],
): void {
  const board = state.board;
  const slots = zone.has(sq) ? pool : new Set<Slot>([slot]);
  const targets = new Set<Square>();
  if (slots.has('R')) for (const t of slideTargets(board, sq, color, ORTHOGONALS)) targets.add(t);
  if (slots.has('B')) for (const t of slideTargets(board, sq, color, DIAGONALS)) targets.add(t);
  if (slots.has('N')) for (const t of knightTargets(board, sq, color)) targets.add(t);
  for (const t of targets) pushMove(turns, sq, t);
}

// ---------------------------------------------------------------------------
// The March (RULES v2.3)
// ---------------------------------------------------------------------------

export interface MarchStep {
  from: Square;
  to: Square;
}

// Compute the march in direction (dr, df) for `color`: the Herald and every friendly
// piece inside the Banner step one square in that direction. The column steps from
// the front (farthest along the direction first), so a piece may step into a square
// a marcher ahead of it just vacated. A piece holds formation if its destination is
// off-board or occupied, or if it is a pawn whose step would reach the final rank.
// Returns the steps actually taken, or null if the Herald itself cannot step
// (the Herald must lead — a march where it holds is no march at all).
export function computeMarch(
  board: GameState['board'], color: Color, dr: number, df: number,
): MarchStep[] | null {
  const heraldSq = findHerald(board, color);
  if (heraldSq === null) return null;

  const marchers: Square[] = [];
  for (const sq of bannerZone(board, color)) {
    const p = board[sq];
    if (p && p.color === color) marchers.push(sq);
  }
  // Front of the column first: descending projection onto the march direction,
  // square index as a deterministic tiebreak (perpendicular pieces never collide).
  const proj = (sq: Square) => dr * (sq >> 3) + df * (sq & 7);
  marchers.sort((a, b) => proj(b) - proj(a) || a - b);

  const occ = new Set<Square>();
  for (let i = 0; i < 64; i++) if (board[i]) occ.add(i);

  const promoRank = color === 'W' ? 7 : 0;
  const steps: MarchStep[] = [];
  let heraldStepped = false;

  for (const sq of marchers) {
    const r = (sq >> 3) + dr, f = (sq & 7) + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue; // holds at the board edge
    const dest = r * 8 + f;
    if (occ.has(dest)) continue;                    // blocked — holds formation
    if (board[sq]!.slot === 'P' && r === promoRank) continue; // pawns hold before the final rank
    occ.delete(sq);
    occ.add(dest);
    steps.push({ from: sq, to: dest });
    if (sq === heraldSq) heraldStepped = true;
  }

  return heraldStepped ? steps : null;
}

function addMarchTurns(state: GameState, color: Color, turns: Turn[]): void {
  const heraldSq = findHerald(state.board, color);
  if (heraldSq === null) return;
  for (const [dr, df] of ALL_DIRS) {
    const steps = computeMarch(state.board, color, dr, df);
    // A march must move the Herald AND at least one other piece — otherwise it is
    // just a Herald move, already generated as a standard move.
    if (!steps || steps.length < 2) continue;
    turns.push({ primary: { type: 'march', from: heraldSq, to: heraldSq + dr * 8 + df } });
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
      for (const p of promos) pushMove(turns, sq, push1, p);
    } else {
      pushMove(turns, sq, push1);
      if (rank === startRank) {
        const push2 = sq + dir * 16;
        if (!board[push2]) pushMove(turns, sq, push2);
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
        for (const p of promos) pushMove(turns, sq, capSq, p);
      } else {
        pushMove(turns, sq, capSq);
      }
    } else if (state.enPassantTarget === capSq) {
      pushMove(turns, sq, capSq);
    }
  }
}

function accordGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;
  const zone = bannerZone(board, color);
  const pool = concordPool(board, color);

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, sq, color, turns); break;
      case 'Q': addHeraldMoves(state, sq, turns); break;
      case 'R':
      case 'B':
      case 'N':
        addConcordMoves(state, sq, color, piece.slot, zone, pool, turns);
        break;
      case 'P': addPawnMoves(state, sq, color, turns); break;
    }
  }

  addMarchTurns(state, color, turns);

  return turns;
}

// ---------------------------------------------------------------------------
// Accord ThreatModel
// ---------------------------------------------------------------------------

function addSlideAttacks(
  sq: Square, board: GameState['board'],
  dirs: readonly (readonly [number, number])[], out: Set<Square>,
): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of dirs) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      out.add(r * 8 + f);
      if (board[r * 8 + f]) break;
      r += dr; f += df;
    }
  }
}

function addKingStepAttacks(sq: Square, out: Set<Square>): void {
  const rank = sq >> 3, file = sq & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r >= 0 && r <= 7 && f >= 0 && f <= 7) out.add(r * 8 + f);
    }
  }
}

function addKnightAttacks(sq: Square, out: Set<Square>): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of KNIGHT_DELTAS) {
    const r = rank + dr, f = file + df;
    if (r >= 0 && r <= 7 && f >= 0 && f <= 7) out.add(r * 8 + f);
  }
}

function accordAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;
  const zone = bannerZone(board, byColor);
  const pool = concordPool(board, byColor);

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'Q':
        // Herald cannot capture and contributes no threat.
        break;
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
      case 'R':
      case 'B':
      case 'N': {
        // Concord threat mirrors Concord movement: the union of the pooled slots'
        // native attacks (own slot only when outside the Banner).
        const slots = zone.has(sq) ? pool : new Set<Slot>([piece.slot]);
        if (slots.has('R')) addSlideAttacks(sq, board, ORTHOGONALS, attacked);
        if (slots.has('B')) addSlideAttacks(sq, board, DIAGONALS, attacked);
        if (slots.has('N')) addKnightAttacks(sq, attacked);
        break;
      }
      case 'K': {
        addKingStepAttacks(sq, attacked);
        break;
      }
    }
  }

  return attacked;
}

export const accordThreatModel: ThreatModel = {
  attackedSquares: accordAttackedSquares,

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

registerGenerator('Accord', accordGenerator);
registerThreatModel('Accord', accordThreatModel);
