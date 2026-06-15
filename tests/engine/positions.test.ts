import { describe, it, expect } from 'vitest';
import { initialState } from '../../src/engine/positions';
import type { Army } from '../../src/engine/types';

// sq(file, rank): file 0=a, rank 0=white's 1st rank
const sq = (file: number, rank: number) => rank * 8 + file;

const ARMIES: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'];

describe('initialState — Crown layout', () => {
  const state = initialState('Crown', 'Crown');

  it('White back rank (rank 0)', () => {
    expect(state.board[sq(0, 0)]).toEqual({ slot: 'R', color: 'W' }); // a1
    expect(state.board[sq(1, 0)]).toEqual({ slot: 'N', color: 'W' }); // b1
    expect(state.board[sq(2, 0)]).toEqual({ slot: 'B', color: 'W' }); // c1
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'Q', color: 'W' }); // d1
    expect(state.board[sq(4, 0)]).toEqual({ slot: 'K', color: 'W' }); // e1
    expect(state.board[sq(5, 0)]).toEqual({ slot: 'B', color: 'W' }); // f1
    expect(state.board[sq(6, 0)]).toEqual({ slot: 'N', color: 'W' }); // g1
    expect(state.board[sq(7, 0)]).toEqual({ slot: 'R', color: 'W' }); // h1
  });

  it('White pawns on rank 1', () => {
    for (let file = 0; file < 8; file++) {
      expect(state.board[sq(file, 1)]).toEqual({ slot: 'P', color: 'W' });
    }
  });

  it('Black back rank (rank 7)', () => {
    expect(state.board[sq(0, 7)]).toEqual({ slot: 'R', color: 'B' }); // a8
    expect(state.board[sq(1, 7)]).toEqual({ slot: 'N', color: 'B' }); // b8
    expect(state.board[sq(2, 7)]).toEqual({ slot: 'B', color: 'B' }); // c8
    expect(state.board[sq(3, 7)]).toEqual({ slot: 'Q', color: 'B' }); // d8
    expect(state.board[sq(4, 7)]).toEqual({ slot: 'K', color: 'B' }); // e8
    expect(state.board[sq(5, 7)]).toEqual({ slot: 'B', color: 'B' }); // f8
    expect(state.board[sq(6, 7)]).toEqual({ slot: 'N', color: 'B' }); // g8
    expect(state.board[sq(7, 7)]).toEqual({ slot: 'R', color: 'B' }); // h8
  });

  it('Black pawns on rank 6', () => {
    for (let file = 0; file < 8; file++) {
      expect(state.board[sq(file, 6)]).toEqual({ slot: 'P', color: 'B' });
    }
  });

  it('middle ranks 2–5 are empty', () => {
    for (let rank = 2; rank <= 5; rank++) {
      for (let file = 0; file < 8; file++) {
        expect(state.board[sq(file, rank)]).toBeNull();
      }
    }
  });
});

describe('initialState — Twins layout', () => {
  const state = initialState('Twins', 'Crown');

  it('d1 is Warlord (slot K, color W)', () => {
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'K', color: 'W' });
  });

  it('e1 is Warlord (slot K, color W)', () => {
    expect(state.board[sq(4, 0)]).toEqual({ slot: 'K', color: 'W' });
  });

  it('no Q-slot piece on White back rank', () => {
    for (let file = 0; file < 8; file++) {
      expect(state.board[sq(file, 0)]?.slot).not.toBe('Q');
    }
  });

  it('other White back rank pieces are standard', () => {
    expect(state.board[sq(0, 0)]).toEqual({ slot: 'R', color: 'W' }); // a1
    expect(state.board[sq(1, 0)]).toEqual({ slot: 'N', color: 'W' }); // b1
    expect(state.board[sq(2, 0)]).toEqual({ slot: 'B', color: 'W' }); // c1
    expect(state.board[sq(5, 0)]).toEqual({ slot: 'B', color: 'W' }); // f1
    expect(state.board[sq(6, 0)]).toEqual({ slot: 'N', color: 'W' }); // g1
    expect(state.board[sq(7, 0)]).toEqual({ slot: 'R', color: 'W' }); // h1
  });

  it('Twins Black mirror: d8 and e8 both Warlord', () => {
    const mirror = initialState('Crown', 'Twins');
    expect(mirror.board[sq(3, 7)]).toEqual({ slot: 'K', color: 'B' }); // d8
    expect(mirror.board[sq(4, 7)]).toEqual({ slot: 'K', color: 'B' }); // e8
    for (let file = 0; file < 8; file++) {
      expect(mirror.board[sq(file, 7)]?.slot).not.toBe('Q');
    }
  });
});

describe('initialState — Veil layout', () => {
  const state = initialState('Veil', 'Crown');

  it('Wisps on a1 and h1 (slot R)', () => {
    expect(state.board[sq(0, 0)]).toEqual({ slot: 'R', color: 'W' }); // a1 Wisp
    expect(state.board[sq(7, 0)]).toEqual({ slot: 'R', color: 'W' }); // h1 Wisp
  });

  it('Wraith on d1 (slot Q)', () => {
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'Q', color: 'W' }); // d1 Wraith
  });

  it('Essence 2 for Veil White', () => {
    expect(state.essence).toEqual({ W: 2, B: 0 });
  });

  it('Essence 2 for Veil Black', () => {
    expect(initialState('Crown', 'Veil').essence).toEqual({ W: 0, B: 2 });
  });

  it('Essence 2,2 when both sides are Veil', () => {
    expect(initialState('Veil', 'Veil').essence).toEqual({ W: 2, B: 2 });
  });
});

describe('initialState — Wild layout', () => {
  const state = initialState('Wild', 'Crown');

  it('Behemoths on a1 and h1 (slot R)', () => {
    expect(state.board[sq(0, 0)]).toEqual({ slot: 'R', color: 'W' }); // a1
    expect(state.board[sq(7, 0)]).toEqual({ slot: 'R', color: 'W' }); // h1
  });

  it('Stalkers on c1 and f1 (slot B)', () => {
    expect(state.board[sq(2, 0)]).toEqual({ slot: 'B', color: 'W' }); // c1
    expect(state.board[sq(5, 0)]).toEqual({ slot: 'B', color: 'W' }); // f1
  });

  it('Broncos on b1 and g1 (slot N)', () => {
    expect(state.board[sq(1, 0)]).toEqual({ slot: 'N', color: 'W' }); // b1
    expect(state.board[sq(6, 0)]).toEqual({ slot: 'N', color: 'W' }); // g1
  });

  it('Apex on d1 (slot Q)', () => {
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'Q', color: 'W' }); // d1
  });
});

describe('initialState — Phantom layout', () => {
  it('Shade on d1 (slot Q), Thralls on rank 1 (slot P)', () => {
    const state = initialState('Phantom', 'Crown');
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'Q', color: 'W' }); // d1 Shade
    for (let file = 0; file < 8; file++) {
      expect(state.board[sq(file, 1)]).toEqual({ slot: 'P', color: 'W' }); // Thralls = slot P
    }
  });
});

describe('initialState — Accord layout', () => {
  it('Herald on d1 (slot Q)', () => {
    const state = initialState('Accord', 'Crown');
    expect(state.board[sq(3, 0)]).toEqual({ slot: 'Q', color: 'W' }); // d1 Herald
  });
});

describe('initialState — castling rights', () => {
  it('Crown vs Crown → KQkq', () => {
    expect(initialState('Crown', 'Crown').castlingRights).toBe('KQkq');
  });

  it('Crown vs Phantom → KQ', () => {
    expect(initialState('Crown', 'Phantom').castlingRights).toBe('KQ');
  });

  it('Phantom vs Crown → kq', () => {
    expect(initialState('Phantom', 'Crown').castlingRights).toBe('kq');
  });

  it('non-Crown vs non-Crown → -', () => {
    expect(initialState('Twins', 'Veil').castlingRights).toBe('-');
    expect(initialState('Wild', 'Accord').castlingRights).toBe('-');
    expect(initialState('Twins', 'Twins').castlingRights).toBe('-');
  });
});

describe('initialState — common properties', () => {
  it('board has 64 cells', () => {
    expect(initialState('Crown', 'Crown').board).toHaveLength(64);
  });

  it('sideToMove is W', () => {
    expect(initialState('Wild', 'Veil').sideToMove).toBe('W');
  });

  it('halfmoveClock = 0, fullmoveNumber = 1', () => {
    const s = initialState('Crown', 'Crown');
    expect(s.halfmoveClock).toBe(0);
    expect(s.fullmoveNumber).toBe(1);
  });

  it('enPassantTarget is null', () => {
    expect(initialState('Crown', 'Crown').enPassantTarget).toBeNull();
  });

  it('exhausted starts empty for all pairings', () => {
    for (const w of ARMIES) {
      for (const b of ARMIES) {
        expect(initialState(w, b).exhausted).toEqual([]);
      }
    }
  });

  it('positionKeys starts empty', () => {
    for (const w of ARMIES) {
      for (const b of ARMIES) {
        expect(initialState(w, b).positionKeys).toEqual([]);
      }
    }
  });

  it('non-Veil armies start with 0 essence', () => {
    const nonVeil: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Wild'];
    for (const army of nonVeil) {
      const s = initialState(army, army);
      expect(s.essence.W).toBe(0);
      expect(s.essence.B).toBe(0);
    }
  });

  it('armies field matches arguments', () => {
    for (const w of ARMIES) {
      for (const b of ARMIES) {
        const s = initialState(w, b);
        expect(s.armies).toEqual({ W: w, B: b });
      }
    }
  });
});
