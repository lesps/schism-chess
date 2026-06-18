import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurnUnchecked, gameStatus, algebraicToSquare, positionKey,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, TeleportMove, StandardMove } from '../../src/engine/index';

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

function makeState(
  pieces: PieceSpec[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    board: buildBoard(pieces),
    sideToMove: 'W',
    armies: { W: 'Veil', B: 'Crown' },
    castlingRights: '-',
    enPassantTarget: null,
    essence: { W: 2, B: 0 },
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

function hasTeleport(turns: Turn[], from: string, to: string, isCapture?: boolean): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'teleport') return false;
    const p = t.primary as TeleportMove;
    return p.from === sq(from) && p.to === sq(to) &&
      (isCapture === undefined || p.isCapture === isCapture);
  });
}

function findTeleport(turns: Turn[], from: string, to: string, isCapture: boolean): Turn | undefined {
  return turns.find(t => {
    if (t.primary.type !== 'teleport') return false;
    const p = t.primary as TeleportMove;
    return p.from === sq(from) && p.to === sq(to) && p.isCapture === isCapture;
  });
}

function hasAnyCapture(turns: Turn[], board: (Piece | null)[]): boolean {
  return turns.some(t => {
    if (t.primary.type === 'teleport') return (t.primary as TeleportMove).isCapture;
    if (t.primary.type === 'standard') return board[(t.primary as StandardMove).to] !== null;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Move-0 regression: Veil starting position is valid
// ---------------------------------------------------------------------------
describe('Veil move-0 regression', () => {
  it('Veil(W) vs Crown(B): ongoing at start, has legal turns', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },  // Wraith
      { slot: 'R', color: 'W', at: 'a1' },  // Wisp
      { slot: 'R', color: 'W', at: 'h1' },  // Wisp
      { slot: 'B', color: 'W', at: 'c1' },
      { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' },
      { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'K', color: 'B', at: 'e8' },
      { slot: 'Q', color: 'B', at: 'd8' },
      { slot: 'R', color: 'B', at: 'a8' },
      { slot: 'R', color: 'B', at: 'h8' },
    ], { essence: { W: 2, B: 0 } });
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Wraith Essence drain
// ---------------------------------------------------------------------------
describe('Wraith Essence drain', () => {
  // Wraith at e4; white pawn at e7 blocks e-file slide upward.
  // Black pawns at e8 (behind own pawn, teleport-only) and c8 (off queen lines, teleport-only).
  // Black King at h8 (not on any queen line from e4).
  const pieces: PieceSpec[] = [
    { slot: 'K', color: 'W', at: 'a1' },
    { slot: 'Q', color: 'W', at: 'e4' },  // Wraith
    { slot: 'P', color: 'W', at: 'e7' },  // blocks e-file slide above e4
    { slot: 'K', color: 'B', at: 'h8' },
    { slot: 'P', color: 'B', at: 'e8' },  // teleport-only target (behind own pawn)
    { slot: 'P', color: 'B', at: 'c8' },  // teleport-only (off queen lines from e4)
  ];

  it('at Essence=2, TeleportCapture to e8 is in legalTurns', () => {
    const state = makeState(pieces, { essence: { W: 2, B: 0 } });
    const turns = legalTurns(state);
    // e8 is behind the white pawn at e7 on the e-file, so only teleport reaches it
    expect(hasTeleport(turns, 'e4', 'e8', true)).toBe(true);
  });

  it('TeleportCapture decrements Essence 2→1 and sets lastTurnMeta', () => {
    const state = makeState(pieces, { essence: { W: 2, B: 0 } });
    const cap = findTeleport(legalTurns(state), 'e4', 'e8', true)!;
    expect(cap).toBeDefined();
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(1);
    expect(after.lastTurnMeta?.essenceDelta).toEqual({ color: 'W', from: 2, to: 1 });
  });

  it('TeleportCapture decrements Essence 1→0', () => {
    const state = makeState(pieces, { essence: { W: 1, B: 0 } });
    const cap = findTeleport(legalTurns(state), 'e4', 'c8', true)!;
    expect(cap).toBeDefined();
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(0);
    expect(after.lastTurnMeta?.essenceDelta).toEqual({ color: 'W', from: 1, to: 0 });
  });

  it('at Essence=0, Wraith generates no captures at all', () => {
    const state = makeState(pieces, { essence: { W: 0, B: 0 } });
    const turns = legalTurns(state);
    expect(hasAnyCapture(turns, state.board)).toBe(false);
  });

  it('slide-capture also costs Essence and no teleport duplicate is generated', () => {
    // Black pawn at f5 is reachable by Wraith at e4 via diagonal slide (f5 is first piece on [+1,+1])
    const p2: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'P', color: 'B', at: 'f5' },  // reachable by diagonal slide from e4
    ];
    const state = makeState(p2, { essence: { W: 1, B: 0 } });
    const turns = legalTurns(state);
    // Should have a standard slide capture to f5
    expect(hasStdMove(turns, 'e4', 'f5')).toBe(true);
    // Should NOT also have a teleport capture to f5 (slide already covers it)
    expect(hasTeleport(turns, 'e4', 'f5', true)).toBe(false);

    const cap = turns.find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('e4') &&
      (t.primary as StandardMove).to === sq('f5'),
    )!;
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(0);
    expect(after.lastTurnMeta?.essenceDelta).toEqual({ color: 'W', from: 1, to: 0 });
  });
});

// ---------------------------------------------------------------------------
// Check gates on Essence
// ---------------------------------------------------------------------------
describe('Wraith check gates on Essence', () => {
  // Wraith at a4 gives check to Black King at e4 via rank 4 (b4/c4/d4 empty).
  // White King at g1.
  const pieces: PieceSpec[] = [
    { slot: 'K', color: 'W', at: 'g1' },
    { slot: 'Q', color: 'W', at: 'a4' },  // Wraith
    { slot: 'K', color: 'B', at: 'e4' },
  ];

  it('at Essence=1, Wraith gives check; king cannot move along rank 4', () => {
    const state = makeState(pieces, {
      essence: { W: 1, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    // d4 and f4 are still on rank 4 within LOS of Wraith — illegal
    expect(hasStdMove(turns, 'e4', 'd4')).toBe(false);
    expect(hasStdMove(turns, 'e4', 'f4')).toBe(false);
    // d5, e5 escape the rank — legal
    expect(hasStdMove(turns, 'e4', 'd5')).toBe(true);
    expect(hasStdMove(turns, 'e4', 'e5')).toBe(true);
  });

  it('at Essence=0, Wraith gives no check; king may move to d4 and f4', () => {
    const state = makeState(pieces, {
      essence: { W: 0, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e4', 'd4')).toBe(true);
    expect(hasStdMove(turns, 'e4', 'f4')).toBe(true);
  });

  it('checking position at Essence=1 is checkmate when all escapes covered', () => {
    // White Wraith at a8 checks Black King at h8 via rank 8 (b8–g8 empty).
    // Knights at h5 (covers g7) and g5 (covers h7). g8 only covered by Wraith rank.
    // White King at a1 stays below the midline. No K-slot piece past rank 5.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'a8' },  // Wraith
      { slot: 'N', color: 'W', at: 'h5' },  // covers g7
      { slot: 'N', color: 'W', at: 'g5' },  // covers h7
      { slot: 'K', color: 'B', at: 'h8' },
    ], {
      essence: { W: 1, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }
  });

  it('same mate position at Essence=0 is not checkmate (Wraith inert)', () => {
    // Same position but Essence=0: Wraith gives no check, Black king can flee to g8.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'a8' },  // Wraith (inert)
      { slot: 'N', color: 'W', at: 'h5' },  // covers g7 only
      { slot: 'N', color: 'W', at: 'g5' },  // covers h7 only
      { slot: 'K', color: 'B', at: 'h8' },
    ], {
      essence: { W: 0, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    // King can flee to g8 (Wraith inert; g8 not covered by knights)
    expect(gameStatus(state).type).toBe('ongoing');
  });
});

// ---------------------------------------------------------------------------
// Inert Wraith (Essence=0)
// ---------------------------------------------------------------------------
describe('Inert Wraith at Essence=0', () => {
  it('generates only empty-square slides and teleports; no captures', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },  // Wraith
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'P', color: 'B', at: 'g7' },  // not on queen line from d4
      { slot: 'P', color: 'B', at: 'g1' },  // on diagonal from d4 via [+dr,-1] ... actually check
    ];
    const state = makeState(pieces, { essence: { W: 0, B: 0 } });
    const turns = legalTurns(state);
    expect(hasAnyCapture(turns, state.board)).toBe(false);
  });

  it('can be used as an interposable blocker against a Crown rook check', () => {
    // Black Rook at a8 gives check to White King at a1 via a-file.
    // White Wraith at c4 (essence=0) can interpose by sliding to a4.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'c4' },  // Wraith
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'a8' },  // gives check on a-file
    ], { essence: { W: 0, B: 0 } });
    const turns = legalTurns(state);
    // Wraith slides to a4 (same rank as c4, going left: b4, a4), blocking the check
    expect(hasStdMove(turns, 'c4', 'a4')).toBe(true);
    // Wraith slides diagonally to a2 (c4→b3→a2) also blocks the a-file check
    expect(hasStdMove(turns, 'c4', 'a2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Essence gain
// ---------------------------------------------------------------------------
describe('Essence gain', () => {
  it('non-Wraith piece (Knight) capturing enemy pawn gains 1 Essence', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'h8' },  // Wraith out of the way
      { slot: 'N', color: 'W', at: 'e5' },  // Knight
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'P', color: 'B', at: 'f7' },  // can be captured by Knight (e5→f7)
    ], { essence: { W: 1, B: 0 } });
    // e5=(4,4), f7=(6,5): dr=2, df=1 → valid knight move
    expect(hasStdMove(legalTurns(state), 'e5', 'f7')).toBe(true);
    const cap = legalTurns(state).find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('e5') &&
      (t.primary as StandardMove).to === sq('f7'),
    )!;
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(2);  // 1 + 1 (pawn capture)
    expect(after.lastTurnMeta?.essenceDelta).toEqual({ color: 'W', from: 1, to: 2 });
  });

  it('non-Wraith piece capturing enemy knight does NOT gain Essence', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'N', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'N', color: 'B', at: 'f7' },  // enemy knight, not a pawn
    ], { essence: { W: 1, B: 0 } });
    const cap = legalTurns(state).find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('e5') &&
      (t.primary as StandardMove).to === sq('f7'),
    )!;
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(1);  // no change
    expect(after.lastTurnMeta).toBeUndefined();
  });

  it('Wraith capturing enemy pawn spends 1 Essence but does NOT gain', () => {
    // Wraith captures enemy pawn via slide (e8 pawn on same file as Wraith e4, no blocker)
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e4' },  // Wraith
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'P', color: 'B', at: 'e8' },  // on same file, reachable by slide
    ], { essence: { W: 2, B: 0 } });
    const cap = legalTurns(state).find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('e4') &&
      (t.primary as StandardMove).to === sq('e8'),
    )!;
    expect(cap).toBeDefined();
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(1);  // 2 - 1 (Wraith capture cost); NOT 2 - 1 + 1
    expect(after.lastTurnMeta?.essenceDelta).toEqual({ color: 'W', from: 2, to: 1 });
  });

  it('Essence gain is capped at 4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'N', color: 'W', at: 'e5' },
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'P', color: 'B', at: 'f7' },
    ], { essence: { W: 4, B: 0 } });  // already at max
    const cap = legalTurns(state).find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('e5') &&
      (t.primary as StandardMove).to === sq('f7'),
    )!;
    const after = applyTurnUnchecked(state, cap);
    expect(after.essence.W).toBe(4);  // capped, no change
    expect(after.lastTurnMeta).toBeUndefined();  // no delta if value didn't change
  });
});

// ---------------------------------------------------------------------------
// Wisp mechanics
// ---------------------------------------------------------------------------
describe('Wisp mechanics', () => {
  it('Wisp teleports to exactly all empty squares', () => {
    // 3 occupied squares: a1 (King), d4 (Wisp), h8 (enemy King)
    // Empty squares: 61. Wisp has 61 teleport moves.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Wisp
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    const wispMoves = turns.filter(t =>
      t.primary.type === 'teleport' && (t.primary as TeleportMove).from === sq('d4'),
    );
    // All 61 empty squares (64 - 3 occupied)
    expect(wispMoves.length).toBe(61);
    // All are non-capturing
    expect(wispMoves.every(t => !(t.primary as TeleportMove).isCapture)).toBe(true);
  });

  it('Wisp generates zero capture turns', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Wisp
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'N', color: 'B', at: 'e5' },  // adjacent to Wisp
    ]);
    const turns = legalTurns(state);
    const wispCaptures = turns.filter(t =>
      t.primary.type === 'teleport' &&
      (t.primary as TeleportMove).from === sq('d4') &&
      (t.primary as TeleportMove).isCapture,
    );
    expect(wispCaptures.length).toBe(0);
  });

  it('Wisp blocks a Crown rook sliding through its square', () => {
    // Black Rook at a4, White Wisp at d4. Rook cannot pass d4.
    const state = makeState([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Wisp
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'a4' },
    ], {
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    // Rook can reach b4, c4 and capture d4 (Wisp)
    expect(hasStdMove(turns, 'a4', 'b4')).toBe(true);
    expect(hasStdMove(turns, 'a4', 'c4')).toBe(true);
    expect(hasStdMove(turns, 'a4', 'd4')).toBe(true);  // captures Wisp
    // Rook CANNOT pass through Wisp
    expect(hasStdMove(turns, 'a4', 'e4')).toBe(false);
    expect(hasStdMove(turns, 'a4', 'h4')).toBe(false);
  });

  it('Wisp can be captured normally by an enemy knight', () => {
    // f5=(4,5) → d4=(3,3): dr=-1, df=-2 — valid knight jump
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Wisp
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'N', color: 'B', at: 'f5' },
    ], {
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'f5', 'd4')).toBe(true);
    const cap = turns.find(t =>
      t.primary.type === 'standard' &&
      (t.primary as StandardMove).from === sq('f5') &&
      (t.primary as StandardMove).to === sq('d4'),
    )!;
    const after = applyTurnUnchecked(state, cap);
    expect(after.board[sq('d4')]).toEqual({ slot: 'N', color: 'B' });
    expect(after.board[sq('f5')]).toBeNull();
  });

  it('Wisp blocks Shade LOS (Phantom vs Veil): teleport off-rank exposes king', () => {
    // White Phantom: Shade (Q-slot) at a8; Black Veil: King at h8, Wisp at f8.
    // Wisp blocks Shade's rank-8 LOS to Black King.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'Q', color: 'W', at: 'a8' },  // Shade (Phantom)
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'f8' },  // Wisp (Veil)
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Phantom', B: 'Veil' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 2 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const turns = legalTurns(state);
    // Wisp teleporting off rank 8 would expose King at h8 to Shade → illegal
    expect(hasTeleport(turns, 'f8', 'd1', false)).toBe(false);
    expect(hasTeleport(turns, 'f8', 'a1', false)).toBe(false);
    // Wisp can stay on rank 8 between Shade and King (still blocks LOS)
    expect(hasTeleport(turns, 'f8', 'c8', false)).toBe(true);
    expect(hasTeleport(turns, 'f8', 'e8', false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-army: Wraith pins a Crown queen (like a Queen would)
// ---------------------------------------------------------------------------
describe('Cross-army Wraith pin', () => {
  it('at Essence≥1, Wraith pins Crown queen along a-file', () => {
    // White Veil Wraith at a4; Black Crown King at a8, Queen at a6 (between them).
    const state = makeState([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'Q', color: 'W', at: 'a4' },  // Wraith
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'Q', color: 'B', at: 'a6' },  // pinned
    ], {
      essence: { W: 1, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    // Queen cannot move off the a-file (exposes king)
    expect(hasStdMove(turns, 'a6', 'b6')).toBe(false);
    expect(hasStdMove(turns, 'a6', 'b5')).toBe(false);
    expect(hasStdMove(turns, 'a6', 'b7')).toBe(false);
    // Queen can move along the pin line (stays on a-file, still blocks)
    expect(hasStdMove(turns, 'a6', 'a5')).toBe(true);
    expect(hasStdMove(turns, 'a6', 'a7')).toBe(true);
    // Queen can capture the Wraith (resolves threat)
    expect(hasStdMove(turns, 'a6', 'a4')).toBe(true);  // a5 is empty between
  });

  it('at Essence=0, Wraith gives no threat; queen is not pinned', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'Q', color: 'W', at: 'a4' },  // Wraith
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'Q', color: 'B', at: 'a6' },
    ], {
      essence: { W: 0, B: 0 },
      sideToMove: 'B',
      armies: { W: 'Veil', B: 'Crown' },
    });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'a6', 'b6')).toBe(true);  // can move freely off a-file
    expect(hasStdMove(turns, 'a6', 'b7')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Threefold repetition and Essence
// ---------------------------------------------------------------------------
describe('Threefold repetition and Essence', () => {
  it('same board with different Essence produces different position keys', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const s1 = makeState(pieces, { essence: { W: 1, B: 0 } });
    const s2 = makeState(pieces, { essence: { W: 2, B: 0 } });
    expect(positionKey(s1)).not.toBe(positionKey(s2));
  });

  it('repetition loop with constant Essence draws by threefold', () => {
    // Only kings, oscillate a1↔b1 (White) and h8↔g8 (Black).
    // After 3 returns to the same position, threefold applies.
    const s0: GameState = {
      board: buildBoard([
        { slot: 'K', color: 'W', at: 'a1' },
        { slot: 'K', color: 'B', at: 'h8' },
      ]),
      sideToMove: 'W',
      armies: { W: 'Veil', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 2, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };

    function kmv(from: string, to: string): Turn {
      return { primary: { type: 'standard', from: sq(from), to: sq(to) } };
    }

    // Cycle: W a1→b1, B h8→g8, W b1→a1, B g8→h8 (back to start — 1 repetition)
    // After 3 full cycles the start position appears ≥ 3 times in positionKeys.
    let s = s0;
    // populate initial key
    s = { ...s, positionKeys: [positionKey(s)] };

    for (let i = 0; i < 3; i++) {
      s = applyTurnUnchecked(s, kmv('a1', 'b1'));
      s = applyTurnUnchecked(s, kmv('h8', 'g8'));
      s = applyTurnUnchecked(s, kmv('b1', 'a1'));
      s = applyTurnUnchecked(s, kmv('g8', 'h8'));
    }

    expect(gameStatus(s).type).toBe('draw');
    if (gameStatus(s).type === 'draw') {
      expect((gameStatus(s) as { type: 'draw'; by: string }).by).toBe('threefold');
    }
  });

  it('Essence change mid-cycle breaks repetition — no draw', () => {
    // Same king oscillation but Essence changes after first cycle (simulated).
    const s0: GameState = {
      board: buildBoard([
        { slot: 'K', color: 'W', at: 'a1' },
        { slot: 'K', color: 'B', at: 'h8' },
      ]),
      sideToMove: 'W',
      armies: { W: 'Veil', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 2, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [positionKey({
        board: buildBoard([
          { slot: 'K', color: 'W', at: 'a1' },
          { slot: 'K', color: 'B', at: 'h8' },
        ]),
        sideToMove: 'W',
        armies: { W: 'Veil', B: 'Crown' },
        castlingRights: '-',
        enPassantTarget: null,
        essence: { W: 2, B: 0 },
        exhausted: [],
        halfmoveClock: 0,
        fullmoveNumber: 1,
        positionKeys: [],
      })],
    };

    function kmv(from: string, to: string): Turn {
      return { primary: { type: 'standard', from: sq(from), to: sq(to) } };
    }

    // Simulate one cycle
    let s = s0;
    s = applyTurnUnchecked(s, kmv('a1', 'b1'));
    s = applyTurnUnchecked(s, kmv('h8', 'g8'));
    s = applyTurnUnchecked(s, kmv('b1', 'a1'));
    s = applyTurnUnchecked(s, kmv('g8', 'h8'));
    // Manually change essence (simulates a capture event changing it mid-game)
    s = { ...s, essence: { W: 1, B: 0 } };

    // Two more cycles at essence=1 — but the start state was essence=2, so no threefold
    for (let i = 0; i < 2; i++) {
      s = applyTurnUnchecked(s, kmv('a1', 'b1'));
      s = applyTurnUnchecked(s, kmv('h8', 'g8'));
      s = applyTurnUnchecked(s, kmv('b1', 'a1'));
      s = applyTurnUnchecked(s, kmv('g8', 'h8'));
    }

    // Not threefold: the key includes Essence; essence=1 ≠ essence=2 keys don't mix
    expect(gameStatus(s).type).not.toBe('draw');
  });
});
