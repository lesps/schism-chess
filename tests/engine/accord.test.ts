import { describe, it, expect, afterEach } from 'vitest';
import {
  legalTurns, applyTurnUnchecked, gameStatus, algebraicToSquare, getThreatModel,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, StandardMove } from '../../src/engine/index';
import {
  bannerZone, accordThreatModel, ACCORD_EMPOWERMENT, setAccordEmpowerment,
} from '../../src/engine/accord';

// Side-effect imports ensure all armies are registered
import '../../src/engine/index';

// ---------------------------------------------------------------------------
// Test helpers
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

function makeState(pieces: PieceSpec[], overrides: Partial<GameState> = {}): GameState {
  return {
    board: buildBoard(pieces),
    sideToMove: 'W',
    armies: { W: 'Accord', B: 'Crown' },
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

function hasStdMove(turns: Turn[], from: string, to: string, promo?: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'standard') return false;
    const p = t.primary as StandardMove;
    return p.from === sq(from) && p.to === sq(to) &&
      (promo ? p.promotion === promo : !p.promotion);
  });
}

function movesFrom(turns: Turn[], from: string): Set<number> {
  const out = new Set<number>();
  for (const t of turns) {
    if (t.primary.type !== 'standard') continue;
    const p = t.primary as StandardMove;
    if (p.from === sq(from)) out.add(p.to);
  }
  return out;
}

// Always restore the default empowerment mode after tests that flip it.
afterEach(() => {
  setAccordEmpowerment('king-step');
});

// ---------------------------------------------------------------------------
// Zone membership
// ---------------------------------------------------------------------------
describe('Banner zone membership', () => {
  it('center square: exact 3x3 set', () => {
    const board = buildBoard([{ slot: 'Q', color: 'W', at: 'd4' }]);
    const zone = bannerZone(board, 'W');
    const expected = ['c3', 'c4', 'c5', 'd3', 'd4', 'd5', 'e3', 'e4', 'e5'].map(sq);
    expect(zone.size).toBe(9);
    for (const s of expected) expect(zone.has(s)).toBe(true);
  });

  it('corner square: clipped to 4 squares', () => {
    const board = buildBoard([{ slot: 'Q', color: 'W', at: 'a1' }]);
    const zone = bannerZone(board, 'W');
    const expected = ['a1', 'a2', 'b1', 'b2'].map(sq);
    expect(zone.size).toBe(4);
    for (const s of expected) expect(zone.has(s)).toBe(true);
  });

  it('edge (non-corner) square: clipped to 6 squares', () => {
    const board = buildBoard([{ slot: 'Q', color: 'W', at: 'a4' }]);
    const zone = bannerZone(board, 'W');
    const expected = ['a3', 'a4', 'a5', 'b3', 'b4', 'b5'].map(sq);
    expect(zone.size).toBe(6);
    for (const s of expected) expect(zone.has(s)).toBe(true);
  });

  it('no Herald on board: empty zone', () => {
    const board = buildBoard([{ slot: 'K', color: 'W', at: 'e1' }]);
    const zone = bannerZone(board, 'W');
    expect(zone.size).toBe(0);
  });

  it('zone is per-color: only the friendly Herald counts', () => {
    const board = buildBoard([
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'Q', color: 'B', at: 'a8' },
    ]);
    const zoneW = bannerZone(board, 'W');
    const zoneB = bannerZone(board, 'B');
    expect(zoneW.has(sq('d4'))).toBe(true);
    expect(zoneB.has(sq('a8'))).toBe(true);
    expect(zoneW.has(sq('a8'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empowered rook
// ---------------------------------------------------------------------------
describe('Empowered rook', () => {
  it('diagonal king-step capture generated inside the zone', () => {
    // Herald at d4; Rook at e5 (in zone, Chebyshev dist 1). Enemy knight at f6 (diagonal
    // king-step from e5). Native rook moves never reach f6 — only empowerment does.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
      { slot: 'N', color: 'B', at: 'f6' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(true);
  });

  it('same piece one square outside the zone: empowered move absent', () => {
    // Rook at f6 is Chebyshev distance 2 from Herald at d4 — outside the 3x3 zone.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'f6' },
      { slot: 'K', color: 'B', at: 'h1' },
      { slot: 'N', color: 'B', at: 'g7' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'f6', 'g7')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empowered check
// ---------------------------------------------------------------------------
describe('Empowered check', () => {
  it('empowered rook diagonally adjacent to enemy king delivers check', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    const model = getThreatModel('Accord');
    expect(model.royalsInCheck(state, 'B')).toEqual([sq('f6')]);
  });

  it('enemy king may not step onto a square covered only by empowerment', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'g7' },
    ], { sideToMove: 'B' });
    const turns = legalTurns(state);
    // f6 is diagonal king-step from e5 (empowered-only attack); king must not move there.
    expect(hasStdMove(turns, 'g7', 'f6')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Herald-move-driven checks (positional empowerment)
// ---------------------------------------------------------------------------
describe('Herald movement gives/removes empowered check', () => {
  it('Herald moving into Banner range of the rook gives check', () => {
    // Rook at e5; enemy King at f6. Herald starts at d3 (Chebyshev dist to e5 = 2, out of zone)
    // then steps to d4 (dist 1, in zone) — empowerment (and check) switches on.
    const before = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd3' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(before, 'B')).toEqual([]);

    const after = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(after, 'B')).toEqual([sq('f6')]);
  });

  it('Herald moving away from the Banner removes the check', () => {
    const checking = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(checking, 'B')).toEqual([sq('f6')]);

    const afterHeraldLeaves = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd2' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(afterHeraldLeaves, 'B')).toEqual([]);
  });

  it('capturing the Herald removes the empowered check', () => {
    const checking = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(checking, 'B')).toEqual([sq('f6')]);

    const heraldGone = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'f6' },
    ]);
    expect(accordThreatModel.royalsInCheck(heraldGone, 'B')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mate that depends on empowerment
// ---------------------------------------------------------------------------
describe('Empowerment-dependent checkmate', () => {
  // Black king at h8. White Knight at g7 — its native jumps (e6/f5/h5) never touch h8, g8, or
  // h7, so the empowered king-step bonus is the *only* thing that checks h8 and covers the other
  // two flight squares (g8, h7). White Herald at h6 sits in the Banner zone of g7 (Chebyshev
  // dist 1) to empower it. White Bishop at e5 defends g7 (diagonal e5-f6-g7, blocked beyond by
  // the Knight) so the king cannot escape by capturing the checker.
  function pieces(): PieceSpec[] {
    return [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'h6' },
      { slot: 'N', color: 'W', at: 'g7' },
      { slot: 'B', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
  }

  it('is checkmate with the Herald present (empowered Knight checks h8 and covers all flight squares)', () => {
    const state = makeState(pieces(), { sideToMove: 'B' });
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }
  });

  it('is NOT checkmate with the Herald removed (Knight reverts; h8 not even in check)', () => {
    const withoutHerald = pieces().filter(p => p.slot !== 'Q');
    const state = makeState(withoutHerald, { sideToMove: 'B' });
    const status = gameStatus(state);
    // Without empowerment the Knight's native jumps (e6/f5/h5) don't touch h8, g8, or h7 at
    // all — the king is free to step to g8 or h7, so this must not be a White win.
    expect(status.type).not.toBe('win');
  });
});

// ---------------------------------------------------------------------------
// Edge king-step out of the zone
// ---------------------------------------------------------------------------
describe('Empowered piece stepping outside the zone', () => {
  it('rook on the zone edge may king-step diagonally out of the zone', () => {
    // Herald at d4; Rook at e5 (in zone). Diagonal king-step to f6 (outside the zone, dist 2 from d4).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(true);
  });

  it('after stepping out, the rook has no diagonal moves on its next turn', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const moveOut: Turn = { primary: { type: 'standard', from: sq('e5'), to: sq('f6') } };
    const after = applyTurnUnchecked(state, moveOut);
    // It is now Black's turn; flip back to White to inspect the rook's next-turn move set.
    const nextTurnState: GameState = { ...after, sideToMove: 'W' };
    const turns = legalTurns(nextTurnState);
    // Rook at f6, Herald still at d4 (Chebyshev dist to f6 = 2) — outside the zone, no diagonal bonus.
    expect(hasStdMove(turns, 'f6', 'g7')).toBe(false);
    expect(hasStdMove(turns, 'f6', 'e7')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pawns are never empowered
// ---------------------------------------------------------------------------
describe('Pawns are never Empowered', () => {
  it('a pawn standing in the Banner gets no king-step moves', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'P', color: 'W', at: 'e5' }, // in zone
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    const targets = movesFrom(turns, 'e5');
    // Only the native single push to e6 — no sideways/backward king-step squares.
    expect(targets).toEqual(new Set([sq('e6')]));
  });
});

// ---------------------------------------------------------------------------
// Promoted Rook/Bishop/Knight are Banner-eligible
// ---------------------------------------------------------------------------
describe('Promoted pieces are Banner-eligible', () => {
  it('a pawn promoting to Rook inside the zone is immediately empowered', () => {
    // White pawn on d7 promotes on d8; Herald at e8 (zone includes d8).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e8' },
      { slot: 'P', color: 'W', at: 'd7' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd7', 'd8', 'R')).toBe(true);
    const promo = turns.find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('d7') &&
      (t.primary as StandardMove).to === sq('d8') &&
      (t.primary as StandardMove).promotion === 'R',
    )!;
    const after = applyTurnUnchecked(state, promo);
    // Check the promoted Rook's empowered attack directly via the ThreatModel (army-agnostic
    // of whose turn it is): it should now cover diagonal squares around d8 via empowerment.
    const attacked = accordThreatModel.attackedSquares(after, 'W');
    expect(attacked.has(sq('c7'))).toBe(true); // diagonal king-step from d8
    expect(attacked.has(sq('e7'))).toBe(true); // diagonal king-step from d8
  });
});

// ---------------------------------------------------------------------------
// Empowered knight: exact enumeration
// ---------------------------------------------------------------------------
describe('Empowered knight move set', () => {
  it('knight in the Banner generates exactly knight-moves union king-step squares', () => {
    // Knight at d4 (also the Herald's own square zone-member trivially via co-location is avoided;
    // place Herald at d4 too is impossible (occupied) — put Herald at e4, Knight at d4 (in zone).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e4' },
      { slot: 'N', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    const targets = movesFrom(turns, 'd4');

    const knightSquares = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'].map(sq);
    const kingStepSquares = ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e5'].map(sq);
    // e4 is occupied by the friendly Herald, so it's excluded from king-step targets.
    const expected = new Set([...knightSquares, ...kingStepSquares]);

    expect(targets).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Flag flip: 'queen' mode
// ---------------------------------------------------------------------------
describe("ACCORD_EMPOWERMENT='queen' mode", () => {
  it('default export value is king-step', () => {
    expect(ACCORD_EMPOWERMENT).toBe('king-step');
  });

  it('rook in zone slides diagonally across the whole board in queen mode', () => {
    setAccordEmpowerment('queen');
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    // From e5, diagonal slide reaches f6, g7, h8 (far beyond a single king-step).
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(true);
    expect(hasStdMove(turns, 'e5', 'g7')).toBe(true);
    expect(hasStdMove(turns, 'e5', 'h8')).toBe(true);
  });

  it('reverts to king-step-only after resetting the flag', () => {
    setAccordEmpowerment('queen');
    setAccordEmpowerment('king-step');
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(true);  // one-square king-step still present
    expect(hasStdMove(turns, 'e5', 'g7')).toBe(false); // far diagonal slide gone
  });

  it('queen-mode bonus also reverts the moment the piece leaves the zone', () => {
    setAccordEmpowerment('queen');
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'f6' }, // Chebyshev dist 2 from d4 — outside the zone
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'f6', 'g7')).toBe(false);
    expect(hasStdMove(turns, 'f6', 'h8')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Herald is capturable, not royal
// ---------------------------------------------------------------------------
describe('Herald is capturable and never royal', () => {
  it('Herald has no captures of its own', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h1' },
      { slot: 'N', color: 'B', at: 'd5' }, // adjacent to Herald
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(false); // can't capture
  });

  it('Herald is never reported in royalsInCheck even when attacked', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h1' },
      { slot: 'R', color: 'B', at: 'd8' }, // attacks the Herald along the d-file
    ]);
    expect(accordThreatModel.royalsInCheck(state, 'W')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cross-army
// ---------------------------------------------------------------------------
describe('Cross-army: Crown vs Accord', () => {
  it('Crown queen can capture the Herald', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h1' },
      { slot: 'Q', color: 'B', at: 'h4' },
    ], { sideToMove: 'B' });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'h4', 'd4')).toBe(true);
  });

  it('empowered cluster escorts the King across the midline for an invasion win', () => {
    // White (Accord) King marches to rank 5 (row index 4) behind an empowered phalanx that
    // denies the Black king's army any checking square. Herald at d5, Rook at d4 covers the
    // King's path; King steps from d4-area up to d5's neighbor e5? Simplify: King already on
    // e5 (row index 4), not in check, with the Accord's pieces on the board defending.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e5' }, // row index 4 = White's invasion rank
      { slot: 'Q', color: 'W', at: 'd5' }, // Herald, escorting
      { slot: 'R', color: 'W', at: 'd4' }, // empowered (in zone of d5), covers approach
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'B' }); // it is now Black's turn — White just arrived, so check from White's POV
    // gameStatus checks the side that just moved (previous = W) for invasion.
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });
});
