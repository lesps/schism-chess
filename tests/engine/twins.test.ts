import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurn, gameStatus,
  algebraicToSquare, parseSfen, initialState,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, StandardMove, RallyStep, Shatter } from '../../src/engine/index';

// Twins must be registered before tests run
import '../../src/engine/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sq(alg: string): number { return algebraicToSquare(alg); }

type PieceSpec = { slot: Slot; color: Color; at: string };

function buildBoard(pieces: PieceSpec[]): (Piece | null)[] {
  const board = new Array<Piece | null>(64).fill(null);
  for (const { slot, color, at } of pieces) {
    board[algebraicToSquare(at)] = { slot, color };
  }
  return board;
}

function makeState(
  pieces: PieceSpec[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    board: buildBoard(pieces),
    sideToMove: 'W',
    armies: { W: 'Twins', B: 'Crown' },
    castlingRights: '-',
    enPassantTarget: null,
    essence: { W: 0, B: 0 },
    exhausted: [],
    halfmoveClock: 0,
    fullmoveNumber: 1,
    positionKeys: [],
    ...overrides,
  };
}

function stdTurn(from: string, to: string, rally?: RallyStep): Turn {
  const mv: StandardMove = { type: 'standard', from: sq(from), to: sq(to) };
  return { primary: mv, rally };
}

function shatterTurn(warlordAlg: string, rally?: RallyStep): Turn {
  const sh: Shatter = { type: 'shatter', warlordSquare: sq(warlordAlg) };
  return { primary: sh, rally };
}

function rallyStep(from: string, to: string): RallyStep {
  return { from: sq(from), to: sq(to) };
}

function hasShatter(turns: Turn[], warlordAlg: string, rally?: RallyStep): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'shatter') return false;
    const sh = t.primary as Shatter;
    if (sh.warlordSquare !== sq(warlordAlg)) return false;
    if (rally === undefined) return t.rally === undefined;
    return t.rally !== undefined && t.rally.from === rally.from && t.rally.to === rally.to;
  });
}

// ---------------------------------------------------------------------------
// Kernel generalization: multiple royals in check
// ---------------------------------------------------------------------------
describe('kernel: multiple royals in check', () => {
  it('a single piece forking both Warlords registers two checks', () => {
    // Knight on d3 attacks both b2 and f2 (two Warlords).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'b2' },
      { slot: 'K', color: 'W', at: 'f2' },
      { slot: 'N', color: 'B', at: 'd3' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // Both Warlords in check; the state should offer legal escape turns
    // (the v1 "instant-loss fork" position must have legal moves under v2 rules)
    expect(turns.length).toBeGreaterThan(0);
  });

  it('v1 killer: knight forks both Warlords, knight not capturable → move-one-rally-other turns present', () => {
    // Warlords at d4 and f4, knight at e6 forks both (knight attacks d4 and f4 from e6).
    // Knight can't be captured (no own piece can reach e6 in one step except the Warlords,
    // but we test that primary+rally resolves double check).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'N', color: 'B', at: 'e6' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // Must have turns that use a rally to resolve double check
    const rallyTurns = turns.filter(t => t.rally !== undefined);
    expect(rallyTurns.length).toBeGreaterThan(0);
    // Game is ongoing (not checkmate)
    expect(gameStatus(state).type).toBe('ongoing');
  });

  it('v1 killer: same fork but rallies blocked → checkmate', () => {
    // Warlords at d4 and f4; Black Knight at e2 forks both (knight jumps (2,1): e2→d4 and e2→f4).
    // No White pawn can reach e2 (pawns only capture forward; e2 is behind all pawns).
    // No Warlord is adjacent to e2 (Chebyshev distance 2 from both d4 and f4).
    // White pawns seal all escape squares; only e4 is open but after any Warlord steps there
    // the other remains in check with no valid rally.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      // Surround d4 (all 8 neighbors except e4 are blocked)
      { slot: 'P', color: 'W', at: 'c3' }, { slot: 'P', color: 'W', at: 'd3' },
      { slot: 'P', color: 'W', at: 'e3' }, { slot: 'P', color: 'W', at: 'c4' },
      { slot: 'P', color: 'W', at: 'c5' }, { slot: 'P', color: 'W', at: 'd5' },
      { slot: 'P', color: 'W', at: 'e5' },
      // Surround f4 (all 8 neighbors except e4 are blocked)
      { slot: 'P', color: 'W', at: 'g3' }, { slot: 'P', color: 'W', at: 'f3' },
      { slot: 'P', color: 'W', at: 'g4' }, { slot: 'P', color: 'W', at: 'g5' },
      { slot: 'P', color: 'W', at: 'f5' },
      // Knight at e2 forks both Warlords; unreachable by any White piece
      { slot: 'N', color: 'B', at: 'e2' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(turns.length).toBe(0);
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('B');
    }
  });
});

// ---------------------------------------------------------------------------
// Single check: primary must resolve it; rally may follow but not escape
// ---------------------------------------------------------------------------
describe('single check constraint', () => {
  it('primary alone must resolve single check; rally-escape is illegal', () => {
    // Warlord at d4 in check from enemy rook on d8. Warlord at f4 not in check.
    // A turn that moves the f4 Warlord (primary) + rallies d4 Warlord out of check is illegal.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'R', color: 'B', at: 'd8' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });

    const turns = legalTurns(state);

    // Moving the unchecked Warlord (f4→g4) as primary — not enough, d4 still in check after primary.
    // Rally d4→e4 would escape check but only rally-escape from single check is forbidden.
    const illegalEscape = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      // Primary moves f4 Warlord (not the checked one)
      if (p.from !== sq('f4')) return false;
      // Rally moves the d4 Warlord out of check
      return t.rally !== undefined && t.rally.from === sq('d4') && t.rally.to !== sq('d4');
    });
    expect(illegalEscape).toBe(false);
  });

  it('primary resolves single check; rally may still follow', () => {
    // Warlord at d4 in check from rook on d8. Primary: move d4 Warlord to e4 (resolves check).
    // Rally may then follow (e.g., move f4 Warlord).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'R', color: 'B', at: 'd8' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });

    const turns = legalTurns(state);

    // Primary d4→e4 resolves the check. Rally from f4 (or e4) should exist.
    const movesWithRally = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('d4') && p.to === sq('e4') && t.rally !== undefined;
    });
    expect(movesWithRally.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Double check: primary + rally may together resolve both
// ---------------------------------------------------------------------------
describe('double check resolution', () => {
  it('capture resolves one check; rally may escape the other', () => {
    // Both Warlords in double check from two independent Black pawns.
    // Black pawn c5 (rank 4 file 2) attacks d4 (rank 3 file 3) diagonally.
    // Black pawn g5 (rank 4 file 6) attacks f4 (rank 3 file 5) diagonally.
    // Primary: d4 Warlord captures c5 pawn (adjacent king-step, resolves d4 check).
    // Rally: f4 Warlord steps to e4 (not on g5's diagonal, resolves f4 check).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'P', color: 'B', at: 'c5' }, // checks d4 diagonally
      { slot: 'P', color: 'B', at: 'g5' }, // checks f4 diagonally
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });

    const turns = legalTurns(state);
    // Primary d4×c5 resolves d4 check; rally f4→e4 resolves f4 check.
    const found = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      if (p.from !== sq('d4') || p.to !== sq('c5')) return false;
      if (!t.rally) return false;
      return t.rally.from === sq('f4') && t.rally.to === sq('e4');
    });
    expect(found).toBe(true);
  });

  it('double check with rally blocked → checkmate if neither resolved', () => {
    // Both Warlords in check from Knight at e2 (same fork as v1 killer).
    // All rally squares blocked; only e4 open but stepping there leaves the other Warlord in check.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'P', color: 'W', at: 'c3' }, { slot: 'P', color: 'W', at: 'd3' },
      { slot: 'P', color: 'W', at: 'e3' }, { slot: 'P', color: 'W', at: 'c4' },
      { slot: 'P', color: 'W', at: 'c5' }, { slot: 'P', color: 'W', at: 'd5' },
      { slot: 'P', color: 'W', at: 'e5' },
      { slot: 'P', color: 'W', at: 'f3' }, { slot: 'P', color: 'W', at: 'g3' },
      { slot: 'P', color: 'W', at: 'g4' }, { slot: 'P', color: 'W', at: 'f5' },
      { slot: 'P', color: 'W', at: 'g5' },
      { slot: 'N', color: 'B', at: 'e2' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') expect(status.winner).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Rally mechanics
// ---------------------------------------------------------------------------
describe('rally mechanics', () => {
  it('rally is non-capturing (occupied squares excluded)', () => {
    // Warlord at e4, rally-target f4 occupied by enemy pawn → no rally to f4.
    // Second Warlord at d4 (adjacent to e4) so Shatter at e4 is illegal,
    // preventing Shatter from clearing f4 and creating a spurious rally target.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'P', color: 'B', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // No rally from e4 to f4 (occupied by enemy pawn)
    const illegalRally = turns.some(t =>
      t.rally !== undefined && t.rally.from === sq('e4') && t.rally.to === sq('f4')
    );
    expect(illegalRally).toBe(false);
  });

  it('rally may not move into check', () => {
    // After some primary, a rally moving Warlord to a square attacked by enemy is illegal.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'c4' },
      { slot: 'R', color: 'B', at: 'f8' }, // covers f-file: f4 would be in check
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // Rally from e4 to f4 would put the Warlord on f-file (in check from rook f8) → illegal
    const illegalRally = turns.some(t =>
      t.rally !== undefined && t.rally.from === sq('e4') && t.rally.to === sq('f4')
    );
    expect(illegalRally).toBe(false);
  });

  it('either Warlord may rally, including the one that just moved as primary', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // After primary e4→d4 (c4 and d4 now occupied), d4 Warlord can rally to e4 or e3 etc.
    const selfRally = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('e4') && p.to === sq('d4') &&
        t.rally !== undefined && t.rally.from === sq('d4');
    });
    // Also check that the OTHER Warlord (c4) can rally
    const otherRally = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('e4') && t.rally !== undefined && t.rally.from === sq('c4');
    });
    expect(selfRally).toBe(true);
    expect(otherRally).toBe(true);
  });

  it('at most one rally per Turn', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    // Turns have at most one rally each (rally field is a single RallyStep)
    for (const t of turns) {
      // Rally is a single optional step; no Turn should have 2+ rallies
      expect(Array.isArray(t.rally)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Shatter
// ---------------------------------------------------------------------------
describe('shatter', () => {
  it('Shatter clears all 8 neighbors including friendly pieces', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' }, // other Warlord, not adjacent to e4
      { slot: 'P', color: 'W', at: 'e5' }, // friendly pawn — should be removed
      { slot: 'P', color: 'B', at: 'f5' }, // enemy pawn — should be removed
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });

    // Apply shatter at e4
    const shatter = shatterTurn('e4');
    const after = applyTurn(state, shatter);
    expect(after.board[sq('e5')]).toBeNull();  // friendly pawn removed
    expect(after.board[sq('f5')]).toBeNull();  // enemy pawn removed
    expect(after.board[sq('e4')]?.slot).toBe('K'); // Warlord stays
  });

  it('Shatter illegal if other Warlord is adjacent', () => {
    // Warlords at e4 and f4 (adjacent) → Shatter at e4 is illegal
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(hasShatter(turns, 'e4')).toBe(false);
    expect(hasShatter(turns, 'f4')).toBe(false);
  });

  it('Shatter legal when Warlords are not adjacent', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(hasShatter(turns, 'e4')).toBe(true);
  });

  it('Shatter illegal if it would leave either Warlord in check (removing own blocker)', () => {
    // Warlord at e4, own pawn at e5 blocks enemy rook at e8. Shatter e4 removes e5 pawn → e4 in check.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'P', color: 'W', at: 'e5' }, // shields the Warlord
      { slot: 'R', color: 'B', at: 'e8' }, // would check e4 if shield removed
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(hasShatter(turns, 'e4')).toBe(false);
  });

  it('empty-radius Shatter (no neighbors) is legal', () => {
    // Warlord completely isolated in the center — Shatter still generated (legal but pointless)
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(hasShatter(turns, 'e4')).toBe(true);
  });

  it('Shatter resets halfmove clock if any piece removed', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'P', color: 'B', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W', halfmoveClock: 10 });
    const after = applyTurn(state, shatterTurn('e4'));
    expect(after.halfmoveClock).toBe(0);
  });

  it('Shatter does NOT reset halfmove clock if no neighbors (nothing removed)', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W', halfmoveClock: 10 });
    const after = applyTurn(state, shatterTurn('e4'));
    expect(after.halfmoveClock).toBe(11);
  });

  it('rally after Shatter works', () => {
    // Shatter at e4 removes neighbors, then rally moves a1 Warlord
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    const turns = legalTurns(state);
    expect(hasShatter(turns, 'e4', rallyStep('a1', 'b1'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invasion: both Warlords must cross midline
// ---------------------------------------------------------------------------
describe('invasion', () => {
  it('both Warlords across midline + not in check → win', () => {
    // Both White Warlords on rank 5 (row 4) — White wins by invasion.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd5' },
      { slot: 'K', color: 'W', at: 'f5' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'B' }); // B just let White invade
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });

  it('one Warlord across, one not → ongoing (not invasion win)', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd5' }, // past midline
      { slot: 'K', color: 'W', at: 'd3' }, // not past midline
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'B' });
    const status = gameStatus(state);
    expect(status.type).toBe('ongoing');
  });

  it('both Warlords across but one in check → not invasion win', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd5' },
      { slot: 'K', color: 'W', at: 'f5' },
      { slot: 'R', color: 'B', at: 'd8' }, // checks d5
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'B' });
    const status = gameStatus(state);
    expect(status.type).toBe('ongoing');
  });

  it('invasion completed by rally step → win', () => {
    // Primary: Warlord d4→d5 (first crosses). Rally: Warlord f4→f5 (second crosses). Both now past midline.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    // Apply primary d4→d5, rally f4→f5
    const turn = stdTurn('d4', 'd5', rallyStep('f4', 'f5'));
    const after = applyTurn(state, turn);
    const status = gameStatus(after);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });

  it('both Warlords past row 4 (rank 6+) also reads as invaded when constructed directly', () => {
    // Single-royal army: king on rank 5 (row 4, the invasion threshold) reads as invaded.
    // SFEN rank ordering: 8/8/8/4K3/8/8/8/7k → K at e5 (row 4), k at h1 (row 0).
    const crownState = parseSfen('8/8/8/4K3/8/8/8/7k/b/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(crownState);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });

  it('invasion by rally after Shatter (emergent line)', () => {
    // Warlord d5 across + in check from rook d8. Shatter at d5 removes rook (adjacency? no — rook is at d8).
    // Actual: Shatter at e5 removes a blocker at d6 that was blocking Warlord d4, then rally d4→d5 crosses.
    // Simpler: Warlord at d5 across but in check from e6 pawn. Shatter at d5 removes e6 pawn (neighbor).
    // After Shatter, d5 no longer in check. Rally f4→f5 makes both across. Invasion win.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd5' }, // across midline but in check from e6 pawn
      { slot: 'K', color: 'W', at: 'f4' }, // not yet across
      { slot: 'P', color: 'B', at: 'e6' }, // checks d5 diagonally
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });

    // Apply: Shatter at d5 (removes e6 pawn among others), then rally f4→f5
    const shatter = shatterTurn('d5', rallyStep('f4', 'f5'));
    const after = applyTurn(state, shatter);
    const status = gameStatus(after);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });
});

// ---------------------------------------------------------------------------
// Initial state and starting position
// ---------------------------------------------------------------------------
describe('initial state', () => {
  it('Twins starting position has both Warlords on d1 and e1', () => {
    const state = initialState('Twins', 'Crown');
    const d1 = state.board[sq('d1')];
    const e1 = state.board[sq('e1')];
    expect(d1?.slot).toBe('K');
    expect(d1?.color).toBe('W');
    expect(e1?.slot).toBe('K');
    expect(e1?.color).toBe('W');
  });

  it('Twins starting position: game ongoing, has legal turns', () => {
    const state = initialState('Twins', 'Crown');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });

  it('Twins vs Twins starting position: game ongoing', () => {
    const state = initialState('Twins', 'Twins');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Shade-move0-regression: S3 test must remain green with generalized royals
// ---------------------------------------------------------------------------
describe('shade-move0-regression (generalized royals)', () => {
  it('Phantom(W) vs Twins(B): game ongoing, has legal turns', () => {
    const state = initialState('Phantom', 'Twins');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });

  it('Twins(W) vs Phantom(B): game ongoing, has legal turns', () => {
    const state = initialState('Twins', 'Phantom');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scripted game: Twins vs Twins reaching a terminal state
// ---------------------------------------------------------------------------
describe('scripted Twins vs Twins game', () => {
  it('plays several moves via applyTurn without throwing', () => {
    let state = initialState('Twins', 'Twins');
    // White: pawn e2→e3 to open e2 for the Warlord
    state = applyTurn(state, stdTurn('e2', 'e3'));
    // Black: pawn e7→e6
    state = applyTurn(state, stdTurn('e7', 'e6'));
    // White: Warlord e1→e2 (e2 now clear), rally d1→e1 (d1 Warlord fills vacated e1)
    state = applyTurn(state, stdTurn('e1', 'e2', rallyStep('d1', 'e1')));
    // Black: pawn d7→d6
    state = applyTurn(state, stdTurn('d7', 'd6'));
    expect(gameStatus(state).type).toBe('ongoing');
  });
});

// ---------------------------------------------------------------------------
// applyTurn validation: Shatter in the legal list
// ---------------------------------------------------------------------------
describe('applyTurn handles Shatter', () => {
  it('applyTurn accepts a Shatter that is in the legal list', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'P', color: 'B', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    // Should not throw
    expect(() => applyTurn(state, shatterTurn('e4'))).not.toThrow();
  });

  it('applyTurn rejects an illegal Shatter', () => {
    // Shatter at e4 when other Warlord is adjacent (f4) → illegal
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'W' });
    expect(() => applyTurn(state, shatterTurn('e4'))).toThrow('applyTurn: illegal move');
  });
});

// ---------------------------------------------------------------------------
// Cross-army stubs (unimplemented armies or future cross-tests)
// ---------------------------------------------------------------------------
describe('cross-army: Shade vs Twins', () => {
  it.todo('shade-check vs Twins: piercing check constraint composes with single-check rule');
  it.todo('shatter clears armored Behemoth (requires Wild S7)');
});
