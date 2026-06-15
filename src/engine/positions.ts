import type { Army, Color, GameState, Piece, Slot, Square } from './types';

function sq(file: number, rank: number): Square {
  return rank * 8 + file;
}

const STANDARD_BACK: Slot[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

function backRank(army: Army, color: Color): (Piece | null)[] {
  const pieces = new Array<Piece | null>(8).fill(null);
  if (army === 'Twins') {
    // Both Warlords occupy slot 'K'; the d-file 'Q' slot is replaced by a second Warlord.
    const layout: Slot[] = ['R', 'N', 'B', 'K', 'K', 'B', 'N', 'R'];
    for (let file = 0; file < 8; file++) {
      pieces[file] = { slot: layout[file], color };
    }
  } else {
    for (let file = 0; file < 8; file++) {
      pieces[file] = { slot: STANDARD_BACK[file], color };
    }
  }
  return pieces;
}

function pawns(color: Color): (Piece | null)[] {
  return Array.from({ length: 8 }, (): Piece => ({ slot: 'P', color }));
}

export function initialState(armyW: Army, armyB: Army): GameState {
  const board = new Array<Piece | null>(64).fill(null);

  const whiteBack = backRank(armyW, 'W');
  const whitePawns = pawns('W');
  for (let file = 0; file < 8; file++) {
    board[sq(file, 0)] = whiteBack[file];
    board[sq(file, 1)] = whitePawns[file];
  }

  const blackBack = backRank(armyB, 'B');
  const blackPawns = pawns('B');
  for (let file = 0; file < 8; file++) {
    board[sq(file, 7)] = blackBack[file];
    board[sq(file, 6)] = blackPawns[file];
  }

  const castlingParts: string[] = [];
  if (armyW === 'Crown') castlingParts.push('KQ');
  if (armyB === 'Crown') castlingParts.push('kq');
  const castlingRights = castlingParts.length > 0 ? castlingParts.join('') : '-';

  return {
    board,
    sideToMove: 'W',
    armies: { W: armyW, B: armyB },
    castlingRights,
    enPassantTarget: null,
    essence: {
      W: armyW === 'Veil' ? 2 : 0,
      B: armyB === 'Veil' ? 2 : 0,
    },
    exhausted: [],
    halfmoveClock: 0,
    fullmoveNumber: 1,
    positionKeys: [],
  };
}
