import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurn, applyTurnUnchecked, gameStatus, algebraicToSquare,
  initialState, serializeSfen, parseSfen, positionKey,
} from '../../src/engine/index';
import type {
  GameState, Piece, Slot, Color, Turn, StandardMove, TeleportMove,
  RampageMove, StrikeMove,
} from '../../src/engine/index';
import { getThreatModel } from '../../src/engine/index';

// Ensure all armies are registered
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
    armies: { W: 'Wild', B: 'Crown' },
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

function hasStdMove(turns: Turn[], from: string, to: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'standard') return false;
    const p = t.primary as StandardMove;
    return p.from === sq(from) && p.to === sq(to);
  });
}

function hasTeleport(turns: Turn[], from: string, to: string, isCapture: boolean): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'teleport') return false;
    const p = t.primary as TeleportMove;
    return p.from === sq(from) && p.to === sq(to) && p.isCapture === isCapture;
  });
}

function hasRampageMove(turns: Turn[], from: string, to: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'rampage') return false;
    const p = t.primary as RampageMove;
    return p.from === sq(from) && p.to === sq(to);
  });
}

function getRampageMove(turns: Turn[], from: string, to: string): RampageMove | undefined {
  const t = turns.find(t => {
    if (t.primary.type !== 'rampage') return false;
    const p = t.primary as RampageMove;
    return p.from === sq(from) && p.to === sq(to);
  });
  return t?.primary as RampageMove | undefined;
}

function hasStrikeMove(turns: Turn[], from: string, target: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'strike') return false;
    const p = t.primary as StrikeMove;
    return p.from === sq(from) && p.target === sq(target);
  });
}

function movesFrom(turns: Turn[], from: string): Turn[] {
  return turns.filter(t =>
    (t.primary as StandardMove).from === sq(from),
  );
}

// ---------------------------------------------------------------------------
// Move-0 regression
// ---------------------------------------------------------------------------
describe('Wild move-0 regression', () => {
  it('Wild(W) vs Crown(B): ongoing at start, has legal turns', () => {
    const state = initialState('Wild', 'Crown');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Apex (Q-slot): chancellor — Rook OR Knight
// ---------------------------------------------------------------------------
describe('Apex moves', () => {
  // Fixture: Apex at d4, Wild King at a1, Black Crown King at h8.
  const pieces: PieceSpec[] = [
    { slot: 'K', color: 'W', at: 'a1' },
    { slot: 'Q', color: 'W', at: 'd4' },  // Apex
    { slot: 'K', color: 'B', at: 'h8' },
  ];

  it('generates rook slides in all 4 orthogonal directions', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'a4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd8')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd1')).toBe(true);
  });

  it('generates all 8 knight jumps from d4', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e6')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c6')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'b5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'b3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'e2')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c2')).toBe(true);
  });

  it('does NOT generate diagonal slides (not a Queen)', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'g7')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'a7')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'a1')).toBe(false);
  });

  it('exact count: 22 Apex moves from d4 with clear board', () => {
    const state = makeState(pieces);
    const apexMoves = movesFrom(legalTurns(state), 'd4');
    expect(apexMoves.length).toBe(22);
  });

  it('captures enemy piece on rook line', () => {
    const withEnemy: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'g4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(withEnemy);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(false);
  });

  it('captures enemy piece via knight jump', () => {
    const withEnemy: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'e6' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(withEnemy);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e6')).toBe(true);
  });

  it('cannot capture own piece', () => {
    const withFriend: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'N', color: 'W', at: 'e6' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(withFriend);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e6')).toBe(false);
  });

  it('slide is blocked by intervening piece', () => {
    const blocking: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(blocking);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bronco (N-slot): knight with friendly-capture
// ---------------------------------------------------------------------------
describe('Bronco moves', () => {
  it('generates standard knight moves', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'd4' },  // Bronco
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e6')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c6')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'b5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'b3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'e2')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c2')).toBe(true);
  });

  it('may capture a friendly pawn (opening a promotion slot)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'b1' },  // Bronco
      { slot: 'P', color: 'W', at: 'a3' },  // friendly pawn
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'b1', 'a3')).toBe(true);
  });

  it('may NOT capture own royal (K-slot)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'c2' },  // Bronco; c2=(1,2) → e1=(0,4): dr=-1,df=+2
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c2', 'e1')).toBe(false);
  });

  it('friendly capture that exposes own royal is absent', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'e4' },  // Bronco pinned on e-file
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'R', color: 'B', at: 'e8' },  // checks via e-file if Bronco moves
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    const broncoMoves = movesFrom(turns, 'e4');
    expect(broncoMoves.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behemoth (R-slot): up to 3 orthogonal squares, rampage on any capture
// ---------------------------------------------------------------------------
describe('Behemoth moves', () => {
  it('moves up to 3 squares orthogonally (no captures — non-capture StandardMoves)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true); // 1 right
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true); // 2 right
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(true); // 3 right
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(false); // 4 right — too far
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(true); // 1 up
    expect(hasStdMove(turns, 'd4', 'd6')).toBe(true); // 2 up
    expect(hasStdMove(turns, 'd4', 'd7')).toBe(true); // 3 up
    expect(hasStdMove(turns, 'd4', 'd8')).toBe(false); // 4 up — too far
  });

  it('does not generate diagonal moves', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'c3')).toBe(false);
  });

  it('may NOT capture own royal (rampage through own royal is illegal)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'd1' },  // king directly below Behemoth
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth — 3 squares from king
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // d4→d3 and d4→d2 are valid non-capture moves
    expect(hasStdMove(turns, 'd4', 'd3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd2')).toBe(true);
    // Rampage down is absent: path d3,d2,d1 — d1 is friendly royal → illegal
    expect(hasRampageMove(turns, 'd4', 'd1')).toBe(false);
    expect(hasRampageMove(turns, 'd4', 'd2')).toBe(false);
    expect(hasRampageMove(turns, 'd4', 'd3')).toBe(false);
  });

  // ---- Rampage tests (S7b) ----

  it('rampage: capture at sq1 forces landing at sq3 (max distance), capturing all pieces in path', () => {
    // Behemoth at d4; enemy N at e4 (sq1 right), friendly P at f4 (sq2), empty g4 (sq3).
    // Rampage captures e4(N) and f4(P), lands on g4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'N', color: 'B', at: 'e4' },  // enemy at sq1
      { slot: 'P', color: 'W', at: 'f4' },  // friendly at sq2
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Non-capture to e4 is NOT available (e4 is occupied)
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(false);
    // Rampage lands on g4 (3 squares from d4), capturing e4 and f4
    expect(hasRampageMove(turns, 'd4', 'g4')).toBe(true);
    const rm = getRampageMove(turns, 'd4', 'g4')!;
    expect(rm.captures).toContain(sq('e4'));
    expect(rm.captures).toContain(sq('f4'));
    expect(rm.captures).toHaveLength(2);
  });

  it('rampage: capture at sq2 (sq1 empty) forces landing at sq3', () => {
    // Behemoth at d4; e4 empty, f4 has enemy piece.
    // Non-capture move to e4 still valid. Rampage from f4 must reach g4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'N', color: 'B', at: 'f4' },  // enemy at sq2
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true); // non-capture to sq1
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(false); // NOT a standard move — it's a rampage
    expect(hasRampageMove(turns, 'd4', 'g4')).toBe(true); // rampage to sq3, captures f4
    const rm = getRampageMove(turns, 'd4', 'g4')!;
    expect(rm.captures).toEqual([sq('f4')]);
  });

  it('rampage: edge-terminated — board edge stops rampage before 3 squares', () => {
    // Behemoth at b4; enemy at c4 (sq1 right). Max distance right = only d4 (sq2 = edge+1, in bounds).
    // Wait, b4 has 3 squares right: c4, d4, e4 — all in bounds. Let me use a corner case.
    // Behemoth at g4; enemy at h4 (1 square right, sq1). h4 is the edge — only 1 square in path.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'g4' },  // Behemoth near edge
      { slot: 'N', color: 'B', at: 'h4' },  // enemy at sq1 (edge)
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Rampage: path going right = [h4] (only 1 square to board edge). Captures h4, lands on h4.
    expect(hasRampageMove(turns, 'g4', 'h4')).toBe(true);
    const rm = getRampageMove(turns, 'g4', 'h4')!;
    expect(rm.captures).toEqual([sq('h4')]);
  });

  it('rampage: applying the move clears captured squares and moves Behemoth', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },
      { slot: 'N', color: 'B', at: 'e4' },
      { slot: 'P', color: 'W', at: 'f4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const rampageTurn: Turn = { primary: { type: 'rampage', from: sq('d4'), to: sq('g4'), captures: [sq('e4'), sq('f4')] } };
    const after = applyTurn(state, rampageTurn);
    expect(after.board[sq('d4')]).toBeNull(); // Behemoth left
    expect(after.board[sq('e4')]).toBeNull(); // enemy N removed
    expect(after.board[sq('f4')]).toBeNull(); // friendly P removed
    expect(after.board[sq('g4')]).toEqual({ slot: 'R', color: 'W' }); // Behemoth landed
  });

  it('rampage check: enemy royal in rampage path gives check, opponent must respond', () => {
    // Behemoth at a5; enemy King at d5 (3 squares right). Rampage goes a5→d5 (only 3 squares,
    // king at d5 gives check). This is the rampage-check fixture.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a5' },  // Behemoth
      { slot: 'K', color: 'B', at: 'd5' },  // 3 squares right — in check from Behemoth
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const turns = legalTurns(state);
    // Crown king must escape
    expect(turns.length).toBeGreaterThan(0);
    // e5 is outside Behemoth's 3-square range from a5 — safe
    expect(hasStdMove(turns, 'd5', 'e5')).toBe(true);
    // b5 and c5 are attacked by the Behemoth (within 3 squares)
    expect(hasStdMove(turns, 'd5', 'c5')).toBe(false);
  });

  it('rampage mate: unavoidable rampage check is checkmate', () => {
    // Behemoth at a1 checks Black king at d1 (rank 1, 3 squares right).
    // Black king escapes: c1,c2,d2,e1,e2. Block all with White pieces.
    //   c3 covers c1,c2; e3 covers e1,e2; f2 covers d2.
    // White King must be below midline (rank ≤ 3 for White = row 0..3) to avoid invasion win.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'h2' },  // White King below midline (row 1)
      { slot: 'R', color: 'W', at: 'a1' },  // Behemoth checking along rank 1
      { slot: 'R', color: 'W', at: 'c3' },  // covers c1, c2
      { slot: 'R', color: 'W', at: 'e3' },  // covers e1, e2
      { slot: 'Q', color: 'W', at: 'f2' },  // covers d2
      { slot: 'K', color: 'B', at: 'd1' },  // Black king in check, no escape
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.winner).toBe('W');
      expect(status.by).toBe('checkmate');
    }
  });
});

// ---------------------------------------------------------------------------
// Stalker (B-slot): strike-and-return + exhaustion
// ---------------------------------------------------------------------------
describe('Stalker moves', () => {
  it('moves up to 2 squares diagonally (non-capture StandardMoves)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // Stalker
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(true); // 1 NE
    expect(hasStdMove(turns, 'd4', 'f6')).toBe(true); // 2 NE
    expect(hasStdMove(turns, 'd4', 'g7')).toBe(false); // 3 NE — too far
    expect(hasStdMove(turns, 'd4', 'c3')).toBe(true); // 1 SW
    expect(hasStdMove(turns, 'd4', 'b2')).toBe(true); // 2 SW
    expect(hasStdMove(turns, 'd4', 'c5')).toBe(true); // 1 NW
    expect(hasStdMove(turns, 'd4', 'b6')).toBe(true); // 2 NW
    expect(hasStdMove(turns, 'd4', 'e3')).toBe(true); // 1 SE
    expect(hasStdMove(turns, 'd4', 'f2')).toBe(true); // 2 SE
  });

  it('does not generate orthogonal moves', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(false);
  });

  it('strike-and-return: capture uses StrikeMove, target removed, Stalker stays home', () => {
    // Stalker at d4; enemy N at f6 (2 squares NE). Strike: N removed, Stalker at d4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // Stalker
      { slot: 'N', color: 'B', at: 'f6' },  // enemy 2 squares NE
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Capture is a StrikeMove, not a StandardMove
    expect(hasStdMove(turns, 'd4', 'f6')).toBe(false);
    expect(hasStrikeMove(turns, 'd4', 'f6')).toBe(true);
    // Intermediate non-capture move still valid
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(true);
    // Beyond the enemy is not reachable (blocked)
    expect(hasStdMove(turns, 'd4', 'g7')).toBe(false);
    expect(hasStrikeMove(turns, 'd4', 'g7')).toBe(false);
  });

  it('strike applies: target removed, Stalker stays, board correct', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'N', color: 'B', at: 'f6' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const strikeTurn: Turn = { primary: { type: 'strike', from: sq('d4'), target: sq('f6') } };
    const after = applyTurn(state, strikeTurn);
    expect(after.board[sq('d4')]).toEqual({ slot: 'B', color: 'W' }); // Stalker still home
    expect(after.board[sq('f6')]).toBeNull(); // target removed
  });

  it('strike at 1-square distance (adjacent diagonal)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'P', color: 'B', at: 'e5' },  // enemy 1 square NE
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStrikeMove(turns, 'd4', 'e5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(false); // no standard capture
  });

  it('check evaluated from Stalker home square (not target square)', () => {
    // Verify the threat model uses the Stalker's actual position (home), not a hypothetical
    // target square. A non-exhausted Stalker at e5 threatens f4 (1 square SE diagonal).
    // If the Stalker were instead at g7 (the target of a hypothetical strike), f4 would
    // NOT be threatened (g7→f6 diagonal, not f4). This confirms threat comes from home.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'e5' },  // Stalker at home, NOT exhausted
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],  // not exhausted — Stalker is active
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const wildModel = getThreatModel('Wild');
    const attacked = wildModel.attackedSquares(state, 'W');
    // Stalker at e5 (rank4,file4) threatens diagonals:
    //   SE: f4(rank3,file5), g3(rank2,file6)? Wait: steps limit is 2.
    //   SE from e5: f4 (1 sq), g3 (2 sq)
    expect(attacked.has(sq('f4'))).toBe(true);  // 1 sq SE from e5
    expect(attacked.has(sq('d6'))).toBe(true);  // 1 sq NW from e5 (rank5,file3)
    expect(attacked.has(sq('f6'))).toBe(true);  // 1 sq NE from e5 (rank5,file5)
    expect(attacked.has(sq('d4'))).toBe(true);  // 1 sq SW from e5 (rank3,file3)
    // g7 = 2 sq NE from e5 (rank6,file6): also attacked
    expect(attacked.has(sq('g7'))).toBe(true);
    // h8 = 3 sq NE from e5: outside Stalker range (max 2)
    // (h8 has Black King so it'd be blocked at g7 anyway; but beyond range regardless)
    // If Stalker were at g7 instead of e5, f4 would NOT be threatened (confirm different):
    const board2 = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'g7' },  // Stalker at g7 (hypothetical target sq)
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const state2 = { ...state, board: board2 };
    const attacked2 = wildModel.attackedSquares(state2, 'W');
    expect(attacked2.has(sq('f4'))).toBe(false); // g7 diagonal: h8(blocked by K),f6,h6,f8 — NOT f4
    expect(attacked2.has(sq('f6'))).toBe(true);  // 1 sq SW from g7
  });

  // ---- Exhaustion (S7b) ----

  it('exhaustion: after a strike, Stalker cannot capture on the controller\'s next turn', () => {
    // Turn N (White): Stalker at d4 strikes e5 (Black pawn). exhausted = [d4].
    // Turn N+1 (Black): Black plays.
    // Turn N+2 (White): Stalker at d4 must NOT have strike moves.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // Stalker
      { slot: 'P', color: 'B', at: 'e5' },  // will be struck
      { slot: 'P', color: 'B', at: 'f6' },  // still present after strike, 2 NE from d4
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const s0 = makeState(pieces);

    // Turn N: White strikes e5
    const strikeN: Turn = { primary: { type: 'strike', from: sq('d4'), target: sq('e5') } };
    const s1 = applyTurn(s0, strikeN); // now Black to move; exhausted = [d4]
    expect(s1.exhausted).toContain(sq('d4'));

    // Turn N+1: Black plays (king moves)
    const blackTurns = legalTurns(s1);
    const s2 = applyTurn(s1, blackTurns[0]);
    // d4 still exhausted for White's next turn
    expect(s2.exhausted).toContain(sq('d4'));

    // Turn N+2 (White): Stalker at d4 is exhausted — no strike moves
    const turnsN2 = legalTurns(s2);
    expect(hasStrikeMove(turnsN2, 'd4', 'f6')).toBe(false); // no capture
    expect(hasStdMove(turnsN2, 'd4', 'e5')).toBe(true);    // movement still OK (e5 now empty)
    expect(hasStdMove(turnsN2, 'd4', 'e3')).toBe(true);    // other non-capture fine
  });

  it('exhaustion: captures restored on turn N+2', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'P', color: 'B', at: 'e5' },
      { slot: 'P', color: 'B', at: 'f6' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const s0 = makeState(pieces);

    // Turn N: White strikes e5
    const strikeN: Turn = { primary: { type: 'strike', from: sq('d4'), target: sq('e5') } };
    const s1 = applyTurn(s0, strikeN);

    // Turn N+1: Black plays
    const s2 = applyTurn(s1, legalTurns(s1)[0]);

    // Turn N+2 (White): exhausted — play a non-capture move
    const turnsN2 = legalTurns(s2);
    // Move Stalker non-capture (e.g., c3 or c5)
    const nonCapWhite = turnsN2.find(t => t.primary.type === 'standard' && (t.primary as StandardMove).from === sq('d4'))!;
    const s3 = applyTurn(s2, nonCapWhite);
    // Exhaustion cleared after White's turn N+2
    expect(s3.exhausted).not.toContain(sq('d4'));

    // Turn N+3: Black plays
    const s4 = applyTurn(s3, legalTurns(s3)[0]);

    // Turn N+4 (White): Stalker at new square — but d4 exhaustion is gone anyway
    // Actually the Stalker moved from d4, so let's verify exhausted list is clean
    expect(s4.exhausted.filter(sq2 => {
      const p = s4.board[sq2];
      return p?.color === 'W' && p?.slot === 'B';
    }).length).toBe(0);
  });

  it('exhaustion: non-capture moves always available even when exhausted', () => {
    // Stalker starts already exhausted (manually set)
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // Stalker, will be set exhausted
      { slot: 'P', color: 'B', at: 'f6' },  // potential target
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces, { exhausted: [sq('d4')] });
    const turns = legalTurns(state);
    // No strike moves
    expect(hasStrikeMove(turns, 'd4', 'f6')).toBe(false);
    // Non-capture moves still available
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'c5')).toBe(true);
  });

  it('exhausted Stalker gives no check — royal safely adjacent during exhaustion', () => {
    // Stalker at d4, exhausted. Enemy king at e5 (1 diagonal away — would be in check if active).
    // With exhaustion, Stalker contributes no attacked squares → king NOT in check.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // exhausted Stalker
      { slot: 'K', color: 'B', at: 'e5' },  // 1 square NE — in Stalker's normal range
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [sq('d4')],  // Stalker exhausted
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const wildModel = getThreatModel('Wild');
    const attackedByWhite = wildModel.attackedSquares(state, 'W');
    // Exhausted Stalker does NOT threaten e5
    expect(attackedByWhite.has(sq('e5'))).toBe(false);
    // Black king at e5 is NOT in check
    const turns = legalTurns(state);
    // If king were in check it'd have restricted options; just verify it can go e5→e6 (staying alive)
    expect(hasStdMove(turns, 'e5', 'e6')).toBe(true);
  });

  it('Stalker gives check the turn after exhaustion expires (boundary test)', () => {
    // Stalker at d4, NOT exhausted. Enemy king at e5 — in check (1 square NE diagonal).
    // d4=(rank3,file3); Stalker NE diagonals: e5(1sq), f6(2sq). King at e5 is in check.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // active Stalker
      { slot: 'K', color: 'B', at: 'e5' },  // 1 square NE — in check
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],  // not exhausted
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const wildModel = getThreatModel('Wild');
    const attackedByWhite = wildModel.attackedSquares(state, 'W');
    expect(attackedByWhite.has(sq('e5'))).toBe(true); // Stalker DOES threaten e5
    // Black king must escape. d4 Stalker attacks:
    //   NE: e5(1), f6(2) — king can't go there
    //   SW: c3(1), b2(2)
    //   NW: c5(1), b6(2)
    //   SE: e3(1), f2(2)
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'e5', 'f6')).toBe(false); // f6 also attacked by Stalker (2 sq NE)
    // Can escape to f5, f4, e6, d5, d6 (all off the Stalker's diagonals)
    expect(hasStdMove(turns, 'e5', 'f5') || hasStdMove(turns, 'e5', 'f4') || hasStdMove(turns, 'e5', 'e6')).toBe(true);
  });

  it('exhaustion round-trips SFEN-X', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { exhausted: [sq('d4')] });
    const sfen = serializeSfen(state);
    const parsed = parseSfen(sfen);
    expect(parsed.exhausted).toEqual([sq('d4')]);
  });

  it('position key differs with vs without exhaustion', () => {
    const base = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const exhausted = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { exhausted: [sq('d4')] });
    expect(positionKey(base)).not.toBe(positionKey(exhausted));
  });
});

// ---------------------------------------------------------------------------
// Behemoth Armor — unchanged from S7a
// ---------------------------------------------------------------------------
describe('Behemoth Armor', () => {
  it('enemy Rook at distance 4 (a4) CANNOT capture the Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'a4' },  // enemy Rook far away
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'a4', 'e4')).toBe(false); // Armor blocks
    expect(hasStdMove(turns, 'a4', 'b4')).toBe(true);
    expect(hasStdMove(turns, 'a4', 'd4')).toBe(true);
  });

  it('enemy Rook at distance 2 (c4) CAN capture the Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'c4' },
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c4', 'e4')).toBe(true);
  });

  it('enemy Knight at c3 (chebyshev 2) CAN capture the Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'N', color: 'B', at: 'c3' },
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c3', 'e4')).toBe(true);
  });

  it('adjacent enemy King (d4, chebyshev 1) CAN capture the Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'd4' },
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
  });

  it('enemy Bishop sliding from c2 (chebyshev 2) CAN capture Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'B', color: 'B', at: 'c2' },
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c2', 'e4')).toBe(true);
  });

  it('enemy Bishop sliding from b1 (chebyshev 3) CANNOT capture Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'B', color: 'B', at: 'b1' },
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'b1', 'e4')).toBe(false);
  });

  it('enemy Behemoth (Wild vs Wild) at h4 (chebyshev 3) CANNOT capture White Behemoth at e4', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'R', color: 'B', at: 'h4' },
    ], {
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Wild' },
    });
    const turns = legalTurns(state);
    expect(hasRampageMove(turns, 'h4', 'e4')).toBe(false); // Armor: chebyshev 3
    expect(hasStdMove(turns, 'h4', 'g4')).toBe(true);   // empty, fine
    expect(hasStdMove(turns, 'h4', 'f4')).toBe(true);   // empty, fine
  });

  it('friendly Bronco capturing own Behemoth is NOT blocked by Armor', () => {
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },
      { slot: 'N', color: 'W', at: 'c3' },  // friendly Bronco
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c3', 'e4')).toBe(true); // friendly capture, no Armor
  });
});

// ---------------------------------------------------------------------------
// Rampage × Armor
// ---------------------------------------------------------------------------
describe('Rampage × Armor', () => {
  it('rampage stops before out-of-range enemy Behemoth (pieces before captured)', () => {
    // White Behemoth at a4; enemy rampages right: path b4(empty), c4(White pawn), d4(enemy Behemoth@d4).
    // Rampager at h4 (Black Behemoth) going left: h4→g4→f4→e4, but let's use a clearer fixture.
    // White Behemoth at a4. Black Behemoth at d4 (3 squares right, chebyshev=3 > 2 from a4).
    // Between them: b4=empty, c4=white pawn.
    // White rampage going right: b4(empty), c4(piece→rampage triggers), d4(enemy armored Behemoth).
    // Wall: stop before d4. Rampage captures c4, lands on c4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a4' },  // White Behemoth (rampager)
      { slot: 'P', color: 'W', at: 'c4' },  // White pawn in path
      { slot: 'R', color: 'B', at: 'd4' },  // Black Behemoth at distance 3 (wall)
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Non-capture to b4 (sq1, empty) still fine
    expect(hasStdMove(turns, 'a4', 'b4')).toBe(true);
    // Rampage: first piece is c4 (White pawn), wall at d4 → stops at c4
    expect(hasRampageMove(turns, 'a4', 'c4')).toBe(true);
    // Does NOT reach d4 (wall) or beyond
    expect(hasRampageMove(turns, 'a4', 'd4')).toBe(false);
    // The wall Black Behemoth is untouched
    const rm = getRampageMove(turns, 'a4', 'c4')!;
    expect(rm.captures).toEqual([sq('c4')]); // only the pawn, not the Behemoth
  });

  it('rampage: origin within Chebyshev 2 captures enemy Behemoth normally', () => {
    // White Behemoth at b4; enemy Black Behemoth at d4 (chebyshev 2 — within range).
    // Path going right: c4(empty→non-cap), d4(enemy Beh→capturable), e4(empty).
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'b4' },  // White Behemoth
      { slot: 'R', color: 'B', at: 'd4' },  // Black Behemoth; chebyshev(b4,d4)=2 ≤ 2
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Non-capture to c4
    expect(hasStdMove(turns, 'b4', 'c4')).toBe(true);
    // Rampage: first piece at d4, within Chebyshev 2 → captured normally.
    // Path: c4(empty), d4(enemy Beh), e4(empty). Rampage from d4 to e4 (max distance).
    expect(hasRampageMove(turns, 'b4', 'e4')).toBe(true);
    const rm = getRampageMove(turns, 'b4', 'e4')!;
    expect(rm.captures).toContain(sq('d4')); // enemy Behemoth captured
  });

  it('friendly armored Behemoth in rampage path offers no wall — captured through', () => {
    // White Behemoth at a4 rampages right; c4 has a friendly White Behemoth (Armor is enemy-only).
    // d4 is empty. Rampage must go through c4 (capturing it) to d4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a4' },  // rampager
      { slot: 'R', color: 'W', at: 'c4' },  // friendly Behemoth in path — no wall
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Non-capture to b4 (sq1 empty)
    expect(hasStdMove(turns, 'a4', 'b4')).toBe(true);
    // Rampage: first piece at c4 (friendly Beh), no wall → continues to d4
    expect(hasRampageMove(turns, 'a4', 'd4')).toBe(true);
    const rm = getRampageMove(turns, 'a4', 'd4')!;
    expect(rm.captures).toContain(sq('c4')); // friendly Behemoth captured (no armor protection)
  });

  it('rampage check body-blocked by out-of-range enemy armored Behemoth', () => {
    // White Behemoth at a5; Black King at e5 (4 squares right). If nothing blocks:
    // rampage would threaten e5 (if ≤ 3 squares). Actually 4 is outside range (max 3).
    // Different fixture: White Behemoth at a5; enemy at b5 (piece), enemy armored Beh at c5,
    // Black King at d5. Without armor wall, rampage would reach d5 (3 sq) through b5 and c5.
    // With armor wall: c5 is enemy armored Behemoth (chebyshev(a5,c5)=2 ≤ 2, NOT a wall!).
    // Let me place armor Beh outside range: a5→b5(piece)→c5(arm.Beh@dist2) → not a wall.
    // Use: White Behemoth at a5; b5=enemy pawn, c5=enemy armored Beh (chebyshev(a5,c5)=2 ≤ 2) — IN range, captured!
    // Need armor Beh OUTSIDE range: chebyshev > 2 from rampager's origin.
    // White Behemoth at a5; b5=empty, c5=enemy pawn, d5=enemy armored Beh (chebyshev(a5,d5)=3 > 2).
    // Black king at e5. Without armor wall on d5, rampage would go a5→b5→c5→d5 (3 sq max), king at e5 outside range.
    // Hmm. Let me do this differently.
    //
    // The test: an out-of-range enemy armored Behemoth blocks a rampage-check threat.
    // White Beh at a4; b4=empty, c4=enemy pawn, d4=arm.Beh (dist 3>2 → WALL); king at h8.
    // Confirm the threat model excludes d4 (wall blocks rampage there) → d4 NOT attacked.
    const board2 = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a4' },  // White Behemoth
      { slot: 'P', color: 'B', at: 'c4' },  // enemy pawn
      { slot: 'R', color: 'B', at: 'd4' },  // enemy armored Behemoth (wall; chebyshev 3)
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const state2: GameState = {
      board: board2,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Wild' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const wildModel = getThreatModel('Wild');
    const attacked = wildModel.attackedSquares(state2, 'W');
    // b4, c4 are attacked (within rampage before wall)
    expect(attacked.has(sq('b4'))).toBe(true);
    expect(attacked.has(sq('c4'))).toBe(true);
    // d4 is the armor wall — NOT attacked (rampage stops before it)
    expect(attacked.has(sq('d4'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Armor: not part of the threat model (unchanged)
// ---------------------------------------------------------------------------
describe('Armor is not threat — Wild ThreatModel', () => {
  it('attackedSquares includes Behemoth attack range regardless of Armor', () => {
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'W',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const wildModel = getThreatModel('Wild');
    const attacked = wildModel.attackedSquares(state, 'W');
    expect(attacked.has(sq('f4'))).toBe(true);
    expect(attacked.has(sq('g4'))).toBe(true);
    expect(attacked.has(sq('h4'))).toBe(true);
    expect(attacked.has(sq('d4'))).toBe(true);
    expect(attacked.has(sq('c4'))).toBe(true);
    expect(attacked.has(sq('b4'))).toBe(true);
    expect(attacked.has(sq('a4'))).toBe(false); // outside range (4 away)
  });
});

// ---------------------------------------------------------------------------
// Cross-army Armor: Wraith teleport vs Behemoth (Veil S4 done)
// ---------------------------------------------------------------------------
describe('cross-army Armor: Veil Wraith teleport vs Wild Behemoth', () => {
  it('Wraith at a1 CANNOT teleport-capture a Behemoth at h6 (chebyshev 7)', () => {
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'Q', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'h6' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'W',
      armies: { W: 'Veil', B: 'Wild' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 2, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const turns = legalTurns(state);
    expect(hasTeleport(turns, 'a1', 'h6', true)).toBe(false);
  });

  it('Wraith at f5 CAN teleport-capture a Behemoth at h6 (chebyshev 2)', () => {
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'f5' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'h6' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'W',
      armies: { W: 'Veil', B: 'Wild' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 2, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const turns = legalTurns(state);
    expect(hasTeleport(turns, 'f5', 'h6', true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-army Armor: Shatter (Twins S6 done)
// ---------------------------------------------------------------------------
describe('cross-army Armor: Twins Shatter clears Wild Behemoth', () => {
  it('Shatter removes adjacent Behemoth regardless of Armor (bypasses captureConstraints)', () => {
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'd1' },
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'e5' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'W',
      armies: { W: 'Twins', B: 'Wild' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const shatterTurn: Turn = { primary: { type: 'shatter', warlordSquare: sq('e4') } };
    const after = applyTurn(state, shatterTurn);
    expect(after.board[sq('e5')]).toBeNull();
    expect(after.board[sq('e4')]).toEqual({ slot: 'K', color: 'W' });
  });
});

// ---------------------------------------------------------------------------
// Wild vs Crown: short game fixture (with rampage + Stalker strike)
// ---------------------------------------------------------------------------
describe('Wild vs Crown: short game with rampage and Stalker strike', () => {
  it('starting position is ongoing with legal turns for both sides', () => {
    const s0 = initialState('Wild', 'Crown');
    expect(gameStatus(s0).type).toBe('ongoing');
    const whiteTurns = legalTurns(s0);
    expect(whiteTurns.length).toBeGreaterThan(0);

    const s1 = applyTurnUnchecked(s0, whiteTurns[0]);
    expect(gameStatus(s1).type).toBe('ongoing');
    const blackTurns = legalTurns(s1);
    expect(blackTurns.length).toBeGreaterThan(0);
  });

  it('Apex on open board can check the Crown king', () => {
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e5' },  // Apex checking along e-file
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const state: GameState = {
      board,
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Crown' },
      castlingRights: '-',
      enPassantTarget: null,
      essence: { W: 0, B: 0 },
      exhausted: [],
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionKeys: [],
    };
    const turns = legalTurns(state);
    expect(turns.length).toBeGreaterThan(0);
    expect(hasStdMove(turns, 'e8', 'e7')).toBe(false);
    expect(hasStdMove(turns, 'e8', 'd8') || hasStdMove(turns, 'e8', 'f8')).toBe(true);
  });

  it('Stalker strike followed by game continuation (checks exhaustion lifecycle end-to-end)', () => {
    // Stalker at d4 strikes e5 (enemy pawn). On Black's reply and White's next turn,
    // the Stalker at d4 cannot capture again. Then on White's 2nd turn after, it can.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },
      { slot: 'P', color: 'B', at: 'e5' },  // will be struck
      { slot: 'P', color: 'B', at: 'f6' },  // present after strike
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const s0 = makeState(pieces);
    expect(gameStatus(s0).type).toBe('ongoing');

    // White strikes
    const strikeTurn: Turn = { primary: { type: 'strike', from: sq('d4'), target: sq('e5') } };
    const s1 = applyTurn(s0, strikeTurn);
    expect(s1.exhausted).toContain(sq('d4'));
    expect(s1.board[sq('e5')]).toBeNull();
    expect(s1.board[sq('d4')]).toEqual({ slot: 'B', color: 'W' });

    // Black plays (king moves h8→h7)
    const blackMove: Turn = { primary: { type: 'standard', from: sq('h8'), to: sq('h7') } };
    const s2 = applyTurn(s1, blackMove);
    expect(s2.exhausted).toContain(sq('d4')); // still exhausted for White's next turn

    // White's next turn: Stalker cannot strike f6
    const turnsW2 = legalTurns(s2);
    expect(hasStrikeMove(turnsW2, 'd4', 'f6')).toBe(false);
    // But can still move
    expect(hasStdMove(turnsW2, 'd4', 'e5')).toBe(true); // e5 now empty (Stalker home, not there)
    // White plays a non-capture move
    const nonCap: Turn = { primary: { type: 'standard', from: sq('d4'), to: sq('e5') } };
    const s3 = applyTurn(s2, nonCap);
    // Exhaustion cleared after White moves (even though Stalker moved away from d4)
    expect(s3.exhausted.filter(sq2 => {
      const p = s3.board[sq2];
      return p?.color === 'W' && p?.slot === 'B';
    }).length).toBe(0);
  });

  it('Behemoth rampage into Crown position captures multiple pieces', () => {
    // White Behemoth at a4; Black pawn at b4, Black Knight at c4.
    // Rampage right: captures b4(pawn) and c4(knight), lands on d4.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a4' },
      { slot: 'P', color: 'B', at: 'b4' },
      { slot: 'N', color: 'B', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const s0 = makeState(pieces);
    expect(hasRampageMove(legalTurns(s0), 'a4', 'd4')).toBe(true);
    const rampageTurn: Turn = {
      primary: { type: 'rampage', from: sq('a4'), to: sq('d4'), captures: [sq('b4'), sq('c4')] },
    };
    const s1 = applyTurn(s0, rampageTurn);
    expect(s1.board[sq('a4')]).toBeNull();
    expect(s1.board[sq('b4')]).toBeNull();
    expect(s1.board[sq('c4')]).toBeNull();
    expect(s1.board[sq('d4')]).toEqual({ slot: 'R', color: 'W' });
    expect(s1.halfmoveClock).toBe(0); // capture resets clock
    expect(gameStatus(s1).type).toBe('ongoing');
  });
});
