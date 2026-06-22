import type { Color, GameState, Slot, Square, StandardMove, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

// Tuning knob: 'king-step' is the conservative default (Empowered pieces gain a
// one-square move-or-capture in any direction). 'queen' upgrades the bonus to full
// Queen sliding while in the Banner. Mutate via setAccordEmpowerment (e.g. in tests);
// production code should rely on the default.
export let ACCORD_EMPOWERMENT: 'king-step' | 'queen' = 'king-step';

export function setAccordEmpowerment(mode: 'king-step' | 'queen'): void {
  ACCORD_EMPOWERMENT = mode;
}

const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const ORTHOGONALS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const ALL_DIRS = [...DIAGONALS, ...ORTHOGONALS] as const;
const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;

function pushMove(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: StandardMove = { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

// Find the Herald square (Q-slot, non-promoted) for a given color, or null if captured.
// A promoted FIDE Queen at Q-slot is not the Herald and does not define the Banner.
function findHerald(board: GameState['board'], color: Color): Square | null {
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.color === color && p.slot === 'Q' && !p.promoted) return sq;
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

// Empowerment bonus targets for a piece at `sq`, given it stands in the Banner.
function empoweredBonusTargets(board: GameState['board'], sq: Square, color: Color): Square[] {
  return ACCORD_EMPOWERMENT === 'queen'
    ? slideTargets(board, sq, color, ALL_DIRS)
    : kingStepTargets(board, sq, color);
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

function addEmpoweredSlideMoves(
  state: GameState, sq: Square, color: Color,
  dirs: readonly (readonly [number, number])[], empowered: boolean, turns: Turn[],
): void {
  const board = state.board;
  const native = slideTargets(board, sq, color, dirs);
  const seen = new Set<Square>(native);
  for (const t of native) pushMove(turns, sq, t);

  if (empowered) {
    for (const t of empoweredBonusTargets(board, sq, color)) {
      if (seen.has(t)) continue;
      seen.add(t);
      pushMove(turns, sq, t);
    }
  }
}

function addEmpoweredKnightMoves(
  state: GameState, sq: Square, color: Color, empowered: boolean, turns: Turn[],
): void {
  const board = state.board;
  const native = knightTargets(board, sq, color);
  const seen = new Set<Square>(native);
  for (const t of native) pushMove(turns, sq, t);

  if (empowered) {
    for (const t of empoweredBonusTargets(board, sq, color)) {
      if (seen.has(t)) continue;
      seen.add(t);
      pushMove(turns, sq, t);
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

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, sq, color, turns); break;
      case 'Q':
        if (piece.promoted) {
          // Promoted FIDE Queen: full Queen sliding with captures; Banner-eligible
          addEmpoweredSlideMoves(state, sq, color, ALL_DIRS, zone.has(sq), turns);
        } else {
          addHeraldMoves(state, sq, turns);
        }
        break;
      case 'R': addEmpoweredSlideMoves(state, sq, color, ORTHOGONALS, zone.has(sq), turns); break;
      case 'B': addEmpoweredSlideMoves(state, sq, color, DIAGONALS, zone.has(sq), turns); break;
      case 'N': addEmpoweredKnightMoves(state, sq, color, zone.has(sq), turns); break;
      case 'P': addPawnMoves(state, sq, color, turns); break;
    }
  }

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

function addEmpowermentAttacks(sq: Square, board: GameState['board'], out: Set<Square>): void {
  if (ACCORD_EMPOWERMENT === 'queen') {
    addSlideAttacks(sq, board, ALL_DIRS, out);
  } else {
    addKingStepAttacks(sq, out);
  }
}

function accordAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;
  const zone = bannerZone(board, byColor);

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'Q':
        if (piece.promoted) {
          // Promoted FIDE Queen: full sliding attacks; Banner-eligible
          addSlideAttacks(sq, board, ALL_DIRS, attacked);
          if (zone.has(sq)) addEmpowermentAttacks(sq, board, attacked);
        }
        // else: Herald cannot capture and contributes no threat.
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
      case 'N': {
        for (const [dr, df] of KNIGHT_DELTAS) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
        }
        if (zone.has(sq)) addEmpowermentAttacks(sq, board, attacked);
        break;
      }
      case 'B': {
        addSlideAttacks(sq, board, DIAGONALS, attacked);
        if (zone.has(sq)) addEmpowermentAttacks(sq, board, attacked);
        break;
      }
      case 'R': {
        addSlideAttacks(sq, board, ORTHOGONALS, attacked);
        if (zone.has(sq)) addEmpowermentAttacks(sq, board, attacked);
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
