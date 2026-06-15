import type { Army, Color, GameState, Piece, Slot, Square } from './types';

const FILES_STR = 'abcdefgh';

export function squareToAlgebraic(sq: Square): string {
  const file = sq % 8;
  const rank = Math.floor(sq / 8);
  return `${FILES_STR[file]}${rank + 1}`;
}

export function algebraicToSquare(s: string): Square {
  const file = s.charCodeAt(0) - 97; // 'a' = 97
  const rank = parseInt(s[1]) - 1;
  return rank * 8 + file;
}

// SFEN-X format (16 '/'-separated tokens):
// <r8>/<r7>/<r6>/<r5>/<r4>/<r3>/<r2>/<r1>/<side>/<armyW,armyB>/<castling>/<ep>/<essW,essB>/<exhausted>/<halfmove>/<fullmove>
//
// Board uses slot letters (K Q R B N P), uppercase=White, lowercase=Black.
// Exhausted: space-separated algebraic squares (sorted), or '-'.
// positionKeys is NOT serialized; parseSfen always returns positionKeys: [].

function serializeBoard(board: (Piece | null)[]): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let rankStr = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = board[rank * 8 + file];
      if (piece === null) {
        empty++;
      } else {
        if (empty > 0) {
          rankStr += empty;
          empty = 0;
        }
        const letter = piece.slot as string;
        rankStr += piece.color === 'W' ? letter : letter.toLowerCase();
      }
    }
    if (empty > 0) rankStr += empty;
    ranks.push(rankStr);
  }
  return ranks.join('/');
}

export function serializeSfen(state: GameState): string {
  const board = serializeBoard(state.board);
  const side = state.sideToMove === 'W' ? 'w' : 'b';
  const armies = `${state.armies.W},${state.armies.B}`;
  const ep =
    state.enPassantTarget !== null ? squareToAlgebraic(state.enPassantTarget) : '-';
  const ess = `${state.essence.W},${state.essence.B}`;
  const exh =
    state.exhausted.length > 0
      ? [...state.exhausted].sort((a, b) => a - b).map(squareToAlgebraic).join(' ')
      : '-';
  return [
    board,
    side,
    armies,
    state.castlingRights,
    ep,
    ess,
    exh,
    String(state.halfmoveClock),
    String(state.fullmoveNumber),
  ].join('/');
}

export function parseSfen(s: string): GameState {
  const parts = s.split('/');
  if (parts.length !== 16) {
    throw new Error(`Invalid SFEN-X: expected 16 parts, got ${parts.length}`);
  }

  const boardRanks = parts.slice(0, 8); // rank 8 down to rank 1 (FEN order)
  const [side, armiesStr, castlingRights, epStr, essStr, exhStr, halfStr, fullStr] =
    parts.slice(8) as [string, string, string, string, string, string, string, string];

  const board: (Piece | null)[] = Array.from({ length: 64 }, () => null);
  boardRanks.forEach((rankStr, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch);
      } else {
        const isUpper = ch === ch.toUpperCase();
        const slot = ch.toUpperCase() as Slot;
        board[rank * 8 + file] = { slot, color: isUpper ? 'W' : 'B' };
        file++;
      }
    }
  });

  const [armyWStr, armyBStr] = armiesStr.split(',');
  const [essWStr, essBStr] = essStr.split(',');

  const exhausted: Square[] =
    exhStr === '-' ? [] : exhStr.split(' ').map(algebraicToSquare);

  return {
    board,
    sideToMove: (side === 'w' ? 'W' : 'B') as Color,
    armies: { W: armyWStr as Army, B: armyBStr as Army },
    castlingRights,
    enPassantTarget: epStr === '-' ? null : algebraicToSquare(epStr),
    essence: { W: parseInt(essWStr), B: parseInt(essBStr) },
    exhausted,
    halfmoveClock: parseInt(halfStr),
    fullmoveNumber: parseInt(fullStr),
    positionKeys: [],
  };
}
