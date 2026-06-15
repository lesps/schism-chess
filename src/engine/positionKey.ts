import type { GameState } from './types';
import { serializeSfen } from './sfen';

// Position key for threefold-repetition detection.
// Includes: board, sideToMove, castlingRights, enPassantTarget, essence, exhausted.
// Excludes: armies (invariant per game), halfmoveClock, fullmoveNumber, positionKeys.
// RULES.md: repetition identity includes Essence; exhaustion and castling/ep follow FIDE principle.
export function positionKey(state: GameState): string {
  const sfen = serializeSfen(state);
  const parts = sfen.split('/');
  // Tokens: [0..7]=board ranks, [8]=side, [9]=armies, [10]=castling,
  //         [11]=ep, [12]=essence, [13]=exhausted, [14]=halfmove, [15]=fullmove
  const board = parts.slice(0, 8).join('/');
  return [board, parts[8], parts[10], parts[11], parts[12], parts[13]].join(':');
}
