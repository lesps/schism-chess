import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurn, applyTurnUnchecked, gameStatus, algebraicToSquare, getThreatModel,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, StandardMove, MarchMove } from '../../src/engine/index';
import { bannerZone, concordPool, computeMarch, accordThreatModel } from '../../src/engine/accord';

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

function findMarch(turns: Turn[], to: string): (Turn & { primary: MarchMove }) | undefined {
  return turns.find(t => t.primary.type === 'march' && (t.primary as MarchMove).to === sq(to)) as
    (Turn & { primary: MarchMove }) | undefined;
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
// Concord: pooled movement (RULES v2.3)
// ---------------------------------------------------------------------------
describe('Concord pooled movement', () => {
  it('a lone Rook in the Banner gains nothing', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(concordPool(state.board, 'W')).toEqual(new Set(['R']));
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(false); // no diagonal
    expect(hasStdMove(turns, 'e5', 'e8')).toBe(true);  // native slide intact
  });

  it('Rook + Bishop in the Banner: both move as Queens', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(concordPool(state.board, 'W')).toEqual(new Set(['R', 'B']));
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'h8')).toBe(true); // rook slides diagonally
    expect(hasStdMove(turns, 'c3', 'c8')).toBe(true); // bishop slides orthogonally
  });

  it('adding a Knight: all three may also leap, and the Knight gains the slides', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'N', color: 'W', at: 'd5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(concordPool(state.board, 'W')).toEqual(new Set(['R', 'B', 'N']));
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f7')).toBe(true); // rook leaps like a knight
    expect(hasStdMove(turns, 'd5', 'd8')).toBe(true); // knight slides like a rook
    expect(hasStdMove(turns, 'c3', 'a1')).toBe(false); // own king blocks — friendly squares stay off-limits
  });

  it('knight jump targets are exact for a pooled Bishop', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'N', color: 'W', at: 'd5' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c3', 'b5')).toBe(true); // bishop leaps (N in pool)
    expect(hasStdMove(turns, 'c3', 'c8')).toBe(false); // no rook in pool — no orthogonal slide
  });

  it('a piece outside the Banner gains nothing even when the pool is rich', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'R', color: 'W', at: 'h8' }, // far from the Banner
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'h8', 'g7')).toBe(false); // no diagonal for the distant rook
  });

  it('normal blocking applies: a friendly pawn blocks the pooled slide', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'P', color: 'W', at: 'f6' }, // blocks e5's new diagonal
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(false); // friendly landing
    expect(hasStdMove(turns, 'e5', 'g7')).toBe(false); // no slide-through (v2.2 rule is gone)
  });

  it('the pool dissolves when the Herald dies', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e5' },
      { slot: 'B', color: 'W', at: 'c3' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(concordPool(state.board, 'W').size).toBe(0);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'h8')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Concord threat
// ---------------------------------------------------------------------------
describe('Concord threat', () => {
  it('a Bishop sharing the Banner with a Rook gives rook-line check', () => {
    // Herald d4; Bishop d5, Rook c4 (both in zone). Bishop checks d8 up the d-file.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'B', color: 'W', at: 'd5' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'd8' },
    ]);
    expect(accordThreatModel.royalsInCheck(state, 'B')).toEqual([sq('d8')]);
  });

  it('the Herald stepping away dissolves the check', () => {
    const afterHeraldLeaves = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'f2' }, // out of range of d5/c4
      { slot: 'B', color: 'W', at: 'd5' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'd8' },
    ]);
    expect(accordThreatModel.royalsInCheck(afterHeraldLeaves, 'B')).toEqual([]);
  });

  it('capturing the Herald dissolves the check', () => {
    const heraldGone = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd5' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'd8' },
    ]);
    expect(accordThreatModel.royalsInCheck(heraldGone, 'B')).toEqual([]);
  });

  it('enemy king may not step onto a square covered only by the pool', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'B', color: 'W', at: 'd5' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'e8' },
    ], { sideToMove: 'B' });
    const turns = legalTurns(state);
    // d8 is attacked by the bishop's pooled rook-line up the d-file.
    expect(hasStdMove(turns, 'e8', 'd8')).toBe(false);
  });

  it('Concord-dependent checkmate: mate with the Herald, no check without it', () => {
    // Bishop b8 with a Rook in the Banner attacks along the 8th rank → h8 is mated
    // (g7/h7 blocked by Black's own pawns, g8 covered by the same ray).
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'a7' },
      { slot: 'R', color: 'W', at: 'a8' },
      { slot: 'B', color: 'W', at: 'b8' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'P', color: 'B', at: 'g7' },
      { slot: 'P', color: 'B', at: 'h7' },
    ];
    const mate = makeState(pieces, { sideToMove: 'B' });
    const status = gameStatus(mate);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }

    const withoutHerald = makeState(pieces.filter(p => !(p.slot === 'Q' && p.color === 'W')), { sideToMove: 'B' });
    expect(accordThreatModel.royalsInCheck(withoutHerald, 'B')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The March (RULES v2.3)
// ---------------------------------------------------------------------------
describe('The March', () => {
  it('the whole formation steps one square with the Herald', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'P', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const march = findMarch(legalTurns(state), 'd5');
    expect(march).toBeDefined();
    const after = applyTurn(state, march!);
    expect(after.board[sq('d5')]?.slot).toBe('Q');
    expect(after.board[sq('c5')]?.slot).toBe('R');
    expect(after.board[sq('e5')]?.slot).toBe('P');
    expect(after.board[sq('d4')]).toBeNull();
    expect(after.board[sq('c4')]).toBeNull();
    expect(after.board[sq('e4')]).toBeNull();
  });

  it('the column steps from the front: a piece ahead vacates the Herald\'s destination', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'P', color: 'W', at: 'd5' }, // directly ahead, inside the Banner
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const march = findMarch(legalTurns(state), 'd5');
    expect(march).toBeDefined();
    const after = applyTurn(state, march!);
    expect(after.board[sq('d6')]?.slot).toBe('P'); // front piece stepped first
    expect(after.board[sq('d5')]?.slot).toBe('Q'); // Herald followed into the vacated square
  });

  it('a blocked marcher holds formation; the rest step', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'P', color: 'W', at: 'e4' }, // free to step — keeps the march alive
      { slot: 'N', color: 'B', at: 'c5' }, // blocks the rook's step (not the Herald's)
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const march = findMarch(legalTurns(state), 'd5');
    expect(march).toBeDefined();
    const after = applyTurn(state, march!);
    expect(after.board[sq('d5')]?.slot).toBe('Q');
    expect(after.board[sq('e5')]?.slot).toBe('P');
    expect(after.board[sq('c4')]?.slot).toBe('R'); // held
    expect(after.board[sq('c5')]?.slot).toBe('N'); // NOT captured — the March takes nothing
    expect(after.board[sq('c5')]?.color).toBe('B');
  });

  it('a march where only the Herald can step does not exist (it is just a Herald move)', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'N', color: 'B', at: 'c5' }, // the rook (only other marcher) is blocked
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(findMarch(legalTurns(state), 'd5')).toBeUndefined();
    expect(hasStdMove(legalTurns(state), 'd4', 'd5')).toBe(true); // the plain Herald step remains
  });

  it('no march in a direction where the Herald itself is blocked', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'N', color: 'B', at: 'd5' }, // enemy on the Herald's destination
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    expect(findMarch(legalTurns(state), 'd5')).toBeUndefined();
  });

  it('a lone Herald generates no march turns (that is just a Herald move)', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const marches = legalTurns(state).filter(t => t.primary.type === 'march');
    expect(marches).toEqual([]);
  });

  it('the King marches with the Banner (escort)', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd3' }, // inside the Banner of d4
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const march = findMarch(legalTurns(state), 'd5');
    expect(march).toBeDefined();
    const after = applyTurn(state, march!);
    expect(after.board[sq('d4')]?.slot).toBe('K');
    expect(after.board[sq('d5')]?.slot).toBe('Q');
  });

  it('a march that exposes the King to check is illegal', () => {
    // King d3 marches to d4 where a rook on h4... instead: rook pins the rank the king
    // would step onto. Black rook on a4 covers rank 4; the north march would put the King on d4.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd3' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'a5' }, // will NOT matter for d4... use a5? covers rank 5 (herald dest d5 empty is fine)
      { slot: 'R', color: 'B', at: 'h4' }, // covers rank 4 → King may not end on d4
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    expect(findMarch(legalTurns(state), 'd5')).toBeUndefined();
  });

  it('a pawn holds rather than march onto the final rank', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd7' },
      { slot: 'P', color: 'W', at: 'c7' }, // one step from promotion
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const march = findMarch(legalTurns(state), 'd8');
    // The pawn holds — but the march still needs one OTHER marcher to exist,
    // and the pawn holding means only the Herald steps → no march at all.
    expect(march).toBeUndefined();

    // Add a rook that can step: the march exists, the pawn stays on c7.
    const state2 = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd7' },
      { slot: 'P', color: 'W', at: 'c7' },
      { slot: 'R', color: 'W', at: 'e7' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const march2 = findMarch(legalTurns(state2), 'd8');
    expect(march2).toBeDefined();
    const after = applyTurn(state2, march2!);
    expect(after.board[sq('c7')]?.slot).toBe('P'); // held before the final rank
    expect(after.board[sq('e8')]?.slot).toBe('R');
    expect(after.board[sq('d8')]?.slot).toBe('Q');
  });

  it('fifty-move clock: a march that steps a pawn resets it; a pawnless march does not', () => {
    const withPawn = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'P', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ], { halfmoveClock: 7 });
    const m1 = findMarch(legalTurns(withPawn), 'd5')!;
    expect(applyTurnUnchecked(withPawn, m1).halfmoveClock).toBe(0);

    const withoutPawn = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ], { halfmoveClock: 7 });
    const m2 = findMarch(legalTurns(withoutPawn), 'd5')!;
    expect(applyTurnUnchecked(withoutPawn, m2).halfmoveClock).toBe(8);
  });

  it('computeMarch: diagonal march moves the whole cluster diagonally', () => {
    const board = buildBoard([
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c3' },
      { slot: 'B', color: 'W', at: 'e5' },
    ]);
    const steps = computeMarch(board, 'W', 1, 1); // north-east
    expect(steps).not.toBeNull();
    const map = new Map(steps!.map(s => [s.from, s.to]));
    expect(map.get(sq('d4'))).toBe(sq('e5')); // Herald follows the bishop
    expect(map.get(sq('e5'))).toBe(sq('f6')); // front first
    expect(map.get(sq('c3'))).toBe(sq('d4'));
  });
});

// ---------------------------------------------------------------------------
// Pawns and the Herald take no part in Concord
// ---------------------------------------------------------------------------
describe('Concord scope', () => {
  it('a pawn standing in the Banner keeps only its native moves', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'P', color: 'W', at: 'e5' }, // in zone, rich pool nearby
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    const targets = movesFrom(turns, 'e5');
    expect(targets).toEqual(new Set([sq('e6')]));
  });

  it('the King in the Banner gains no pooled movement', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'd3' }, // in zone
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd3', 'd1')).toBe(false); // no rook slide for the King
  });

  it('the Herald contributes nothing and receives nothing', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h1' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'd8')).toBe(false); // Herald never slides
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

  it('cluster escorts the King across the midline for an invasion win', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e5' }, // row index 4 = White's invasion rank
      { slot: 'Q', color: 'W', at: 'd5' }, // Herald, escorting
      { slot: 'R', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { sideToMove: 'B' });
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });

  it('threat model consistency: getThreatModel(Accord) is the exported model', () => {
    expect(getThreatModel('Accord')).toBe(accordThreatModel);
  });
});
