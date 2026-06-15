import { describe, it, expect } from 'vitest';
import { positionKey } from '../../src/engine/positionKey';
import { algebraicToSquare } from '../../src/engine/sfen';
import { initialState } from '../../src/engine/positions';
import type { GameState } from '../../src/engine/types';

describe('positionKey', () => {
  it('same state produces same key', () => {
    const s = initialState('Crown', 'Crown');
    expect(positionKey(s)).toBe(positionKey({ ...s }));
  });

  it('differing sideToMove → different key', () => {
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, sideToMove: 'B' };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('differing essence → different key', () => {
    const base = initialState('Veil', 'Crown');
    const altered: GameState = { ...base, essence: { W: 0, B: 0 } };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('differing exhausted → different key', () => {
    const base = initialState('Wild', 'Crown');
    const altered: GameState = { ...base, exhausted: [5] };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('differing castlingRights → different key', () => {
    const base = initialState('Crown', 'Crown'); // KQkq
    const altered: GameState = { ...base, castlingRights: 'KQ' };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('differing enPassantTarget → different key', () => {
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, enPassantTarget: algebraicToSquare('e3') };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('differing board → different key', () => {
    const base = initialState('Crown', 'Crown');
    const boardCopy = [...base.board];
    boardCopy[0] = null; // remove a1 Rook
    const altered: GameState = { ...base, board: boardCopy };
    expect(positionKey(base)).not.toBe(positionKey(altered));
  });

  it('halfmoveClock does NOT affect key', () => {
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, halfmoveClock: 42 };
    expect(positionKey(base)).toBe(positionKey(altered));
  });

  it('fullmoveNumber does NOT affect key', () => {
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, fullmoveNumber: 10 };
    expect(positionKey(base)).toBe(positionKey(altered));
  });

  it('positionKeys history does NOT affect key', () => {
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, positionKeys: ['somekey', 'anotherkey'] };
    expect(positionKey(base)).toBe(positionKey(altered));
  });

  it('armies field does NOT affect key (armies are invariant per game)', () => {
    // Two states with different armies but identical board/side/etc. produce the same key.
    // In practice armies never change mid-game; this tests the key definition.
    const base = initialState('Crown', 'Crown');
    const altered: GameState = { ...base, armies: { W: 'Phantom', B: 'Wild' } };
    expect(positionKey(base)).toBe(positionKey(altered));
  });
});
