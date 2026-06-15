import type { Army, Color, GameState, Slot, Square, StandardMove, Turn } from './types';

type MoveGenerator = (state: GameState) => Turn[];
const generatorRegistry = new Map<Army, MoveGenerator>();

export function registerGenerator(army: Army, gen: MoveGenerator): void {
  generatorRegistry.set(army, gen);
}

export function getGenerator(army: Army): MoveGenerator | undefined {
  return generatorRegistry.get(army);
}

function availablePromotions(state: GameState, color: Color): Slot[] {
  const army = color === 'W' ? state.armies.W : state.armies.B;
  if (army !== 'Crown') return ['Q', 'R', 'B', 'N'];
  // Crown Royal Abundance: Q always available; R/B/N iff on-board count < 2
  const promos: Slot[] = ['Q'];
  for (const slot of ['R', 'B', 'N'] as Slot[]) {
    let count = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === color && p.slot === slot) count++;
    }
    if (count < 2) promos.push(slot);
  }
  return promos;
}

function pushMove(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: StandardMove = { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

function addPawnTurns(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = sq >> 3, file = sq & 7;
  const dir = color === 'W' ? 1 : -1;
  const startRank = color === 'W' ? 1 : 6;
  const promoRank = color === 'W' ? 7 : 0;

  const push1 = sq + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of availablePromotions(state, color)) pushMove(turns, sq, push1, p);
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
        for (const p of availablePromotions(state, color)) pushMove(turns, sq, capSq, p);
      } else {
        pushMove(turns, sq, capSq);
      }
    } else if (state.enPassantTarget === capSq) {
      pushMove(turns, sq, capSq);
    }
  }
}

function addKnightTurns(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
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

function addSlidingTurns(
  state: GameState, sq: Square, color: Color,
  dirs: readonly (readonly [number, number])[], turns: Turn[]
): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of dirs) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = r * 8 + f;
      const tp = state.board[target];
      if (tp) {
        if (tp.color !== color) pushMove(turns, sq, target);
        break;
      }
      pushMove(turns, sq, target);
      r += dr; f += df;
    }
  }
}

const DIAGONALS = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
const ORTHOGONALS = [[-1,0],[1,0],[0,-1],[0,1]] as const;

function addKingTurns(state: GameState, sq: Square, color: Color, turns: Turn[]): void {
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

  const board = state.board;
  const rights = state.castlingRights;

  if (color === 'W' && sq === 4) {
    if (rights.includes('K') && !board[5] && !board[6]
        && board[7]?.slot === 'R' && board[7]?.color === 'W') {
      pushMove(turns, 4, 6);
    }
    if (rights.includes('Q') && !board[3] && !board[2] && !board[1]
        && board[0]?.slot === 'R' && board[0]?.color === 'W') {
      pushMove(turns, 4, 2);
    }
  }
  if (color === 'B' && sq === 60) {
    if (rights.includes('k') && !board[61] && !board[62]
        && board[63]?.slot === 'R' && board[63]?.color === 'B') {
      pushMove(turns, 60, 62);
    }
    if (rights.includes('q') && !board[59] && !board[58] && !board[57]
        && board[56]?.slot === 'R' && board[56]?.color === 'B') {
      pushMove(turns, 60, 58);
    }
  }
}

function crownGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;

  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'P': addPawnTurns(state, sq, color, turns); break;
      case 'N': addKnightTurns(state, sq, color, turns); break;
      case 'B': addSlidingTurns(state, sq, color, DIAGONALS, turns); break;
      case 'R': addSlidingTurns(state, sq, color, ORTHOGONALS, turns); break;
      case 'Q':
        addSlidingTurns(state, sq, color, DIAGONALS, turns);
        addSlidingTurns(state, sq, color, ORTHOGONALS, turns);
        break;
      case 'K': addKingTurns(state, sq, color, turns); break;
    }
  }

  return turns;
}

registerGenerator('Crown', crownGenerator);

// Exported so tests can register other armies using FIDE-move semantics as a stub.
export { crownGenerator as fideGenerator };
