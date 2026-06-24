import type { Army, Color, GameState, Square, Turn } from './types';
import { availablePromotions } from './movegen';

export interface ThreatModel {
  attackedSquares(state: GameState, byColor: Color): Set<Square>;
  royalsInCheck(state: GameState, color: Color): Square[];
  checkResponseConstraint?(state: GameState, turn: Turn): boolean;
  captureConstraints?(state: GameState, capturerFrom: Square, targetSquare: Square): boolean;
}

const registry = new Map<Army, ThreatModel>();

export function registerThreatModel(army: Army, model: ThreatModel): void {
  registry.set(army, model);
}

export function getThreatModel(army: Army): ThreatModel {
  const model = registry.get(army);
  if (!model) throw new Error(`No threat model registered for army: ${army}`);
  return model;
}

function addDiagonals(sq: Square, board: GameState['board'], out: Set<Square>): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      out.add(r * 8 + f);
      if (board[r * 8 + f]) break;
      r += dr; f += df;
    }
  }
}

function addOrthogonals(sq: Square, board: GameState['board'], out: Set<Square>): void {
  const rank = sq >> 3, file = sq & 7;
  for (const [dr, df] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      out.add(r * 8 + f);
      if (board[r * 8 + f]) break;
      r += dr; f += df;
    }
  }
}

export function fideAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== byColor) continue;
    const rank = sq >> 3, file = sq & 7;

    switch (piece.slot) {
      case 'P': {
        // Unified threat principle: blocked 7th-rank pawn → no diagonal threat.
        const seventhRank = byColor === 'W' ? 6 : 1;
        if (rank === seventhRank && availablePromotions(state, byColor).length === 0) break;
        const dir = piece.color === 'W' ? 1 : -1;
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
      case 'B': addDiagonals(sq, board, attacked); break;
      case 'R': addOrthogonals(sq, board, attacked); break;
      case 'Q': addDiagonals(sq, board, attacked); addOrthogonals(sq, board, attacked); break;
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

export const fideThreatModel: ThreatModel = {
  attackedSquares: fideAttackedSquares,

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

registerThreatModel('Crown', fideThreatModel);
