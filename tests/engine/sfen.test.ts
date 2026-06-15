import { describe, it, expect } from 'vitest';
import { serializeSfen, parseSfen, squareToAlgebraic, algebraicToSquare } from '../../src/engine/sfen';
import { initialState } from '../../src/engine/positions';
import type { Army, GameState } from '../../src/engine/types';

const ARMIES: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'];

// All 21 unordered pairings (including mirrors i==j)
const PAIRINGS: [Army, Army][] = [];
for (let i = 0; i < ARMIES.length; i++) {
  for (let j = i; j < ARMIES.length; j++) {
    PAIRINGS.push([ARMIES[i], ARMIES[j]]);
  }
}

describe('squareToAlgebraic / algebraicToSquare', () => {
  it('a1 = 0', () => {
    expect(squareToAlgebraic(0)).toBe('a1');
    expect(algebraicToSquare('a1')).toBe(0);
  });

  it('h1 = 7', () => {
    expect(squareToAlgebraic(7)).toBe('h1');
    expect(algebraicToSquare('h1')).toBe(7);
  });

  it('a8 = 56', () => {
    expect(squareToAlgebraic(56)).toBe('a8');
    expect(algebraicToSquare('a8')).toBe(56);
  });

  it('h8 = 63', () => {
    expect(squareToAlgebraic(63)).toBe('h8');
    expect(algebraicToSquare('h8')).toBe(63);
  });

  it('e4 = 28', () => {
    expect(squareToAlgebraic(28)).toBe('e4');
    expect(algebraicToSquare('e4')).toBe(28);
  });

  it('round-trips all 64 squares', () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(algebraicToSquare(squareToAlgebraic(sq))).toBe(sq);
    }
  });
});

describe('SFEN-X — Crown vs Crown initial state', () => {
  const state = initialState('Crown', 'Crown');
  const sfen = serializeSfen(state);

  it('produces the expected SFEN-X string', () => {
    expect(sfen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/w/Crown,Crown/KQkq/-/0,0/-/0/1',
    );
  });

  it('has 16 slash-separated tokens', () => {
    expect(sfen.split('/').length).toBe(16);
  });
});

describe('SFEN-X — Twins layout', () => {
  it('White back rank shows RNBKKBNR (two Warlords)', () => {
    const state = initialState('Twins', 'Crown');
    const parts = serializeSfen(state).split('/');
    expect(parts[7]).toBe('RNBKKBNR'); // rank 0 = token index 7 (8th rank from rank8..rank1)
  });

  it('Black Twins back rank shows rnbkkbnr', () => {
    const state = initialState('Crown', 'Twins');
    const parts = serializeSfen(state).split('/');
    expect(parts[0]).toBe('rnbkkbnr'); // rank 7 = first token
  });
});

describe('SFEN-X — Veil essence field', () => {
  it('Veil White: essence field is 2,0', () => {
    const parts = serializeSfen(initialState('Veil', 'Crown')).split('/');
    expect(parts[12]).toBe('2,0');
  });

  it('Veil Black: essence field is 0,2', () => {
    const parts = serializeSfen(initialState('Crown', 'Veil')).split('/');
    expect(parts[12]).toBe('0,2');
  });

  it('Veil vs Veil: essence field is 2,2', () => {
    const parts = serializeSfen(initialState('Veil', 'Veil')).split('/');
    expect(parts[12]).toBe('2,2');
  });
});

describe('SFEN-X — round-trip for all 21 army pairings', () => {
  for (const [armyW, armyB] of PAIRINGS) {
    it(`${armyW} vs ${armyB}`, () => {
      const state = initialState(armyW, armyB);
      const parsed = parseSfen(serializeSfen(state));
      expect(parsed).toEqual(state);
    });
  }
});

describe('SFEN-X — round-trip with non-default state fields', () => {
  it('preserves exhausted squares (sorted)', () => {
    const state: GameState = {
      ...initialState('Wild', 'Crown'),
      exhausted: [37, 2], // unsorted input — should round-trip sorted
    };
    const parsed = parseSfen(serializeSfen(state));
    expect(parsed.exhausted).toEqual([2, 37]);
  });

  it('preserves en passant target', () => {
    const state: GameState = {
      ...initialState('Crown', 'Crown'),
      enPassantTarget: algebraicToSquare('e3'),
    };
    const parsed = parseSfen(serializeSfen(state));
    expect(parsed.enPassantTarget).toBe(algebraicToSquare('e3'));
  });

  it('preserves sideToMove Black', () => {
    const state: GameState = {
      ...initialState('Crown', 'Crown'),
      sideToMove: 'B',
    };
    expect(parseSfen(serializeSfen(state)).sideToMove).toBe('B');
  });

  it('parseSfen always returns positionKeys: []', () => {
    const state: GameState = {
      ...initialState('Crown', 'Crown'),
      positionKeys: ['key1', 'key2'],
    };
    // positionKeys is not serialized; parsed result always has []
    expect(parseSfen(serializeSfen(state)).positionKeys).toEqual([]);
  });

  it('property test: 50 random state mutations round-trip', () => {
    const base = initialState('Wild', 'Veil');

    for (let i = 0; i < 50; i++) {
      const state: GameState = {
        ...base,
        sideToMove: i % 2 === 0 ? 'W' : 'B',
        essence: { W: i % 5, B: (i * 3) % 5 },
        exhausted: [...new Set([i % 64, (i * 7 + 3) % 64])].sort((a, b) => a - b),
        halfmoveClock: i * 2,
        fullmoveNumber: i + 1,
        positionKeys: [],
      };
      expect(parseSfen(serializeSfen(state)), `iteration ${i}`).toEqual(state);
    }
  });
});
