import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurn, applyTurnUnchecked, gameStatus, algebraicToSquare,
  initialState,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, StandardMove, TeleportMove } from '../../src/engine/index';
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
  // No blocking pieces — Apex has full rook slide + knight jumps.
  const pieces: PieceSpec[] = [
    { slot: 'K', color: 'W', at: 'a1' },
    { slot: 'Q', color: 'W', at: 'd4' },  // Apex
    { slot: 'K', color: 'B', at: 'h8' },
  ];

  it('generates rook slides in all 4 orthogonal directions', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Right on rank 4
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(true);
    // Left on rank 4
    expect(hasStdMove(turns, 'd4', 'c4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'a4')).toBe(true);
    // Up along d-file
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd8')).toBe(true);
    // Down along d-file
    expect(hasStdMove(turns, 'd4', 'd3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd1')).toBe(true);
  });

  it('generates all 8 knight jumps from d4', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // All 8 knight destinations from d4 (rank 3, file 3)
    expect(hasStdMove(turns, 'd4', 'e6')).toBe(true); // +2,+1
    expect(hasStdMove(turns, 'd4', 'c6')).toBe(true); // +2,-1
    expect(hasStdMove(turns, 'd4', 'f5')).toBe(true); // +1,+2
    expect(hasStdMove(turns, 'd4', 'b5')).toBe(true); // +1,-2
    expect(hasStdMove(turns, 'd4', 'f3')).toBe(true); // -1,+2
    expect(hasStdMove(turns, 'd4', 'b3')).toBe(true); // -1,-2
    expect(hasStdMove(turns, 'd4', 'e2')).toBe(true); // -2,+1
    expect(hasStdMove(turns, 'd4', 'c2')).toBe(true); // -2,-1
  });

  it('does NOT generate diagonal slides (not a Queen)', () => {
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'g7')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'a7')).toBe(false);
    expect(hasStdMove(turns, 'd4', 'a1')).toBe(false); // own king anyway, but also diagonal
  });

  it('exact count: 22 Apex moves from d4 with clear board', () => {
    const state = makeState(pieces);
    const apexMoves = movesFrom(legalTurns(state), 'd4');
    // 7 left/right on rank 4 + 7 up/down on d-file + 8 knight jumps = 22
    expect(apexMoves.length).toBe(22);
  });

  it('captures enemy piece on rook line', () => {
    const withEnemy: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'g4' },  // on rank 4, Apex can capture
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(withEnemy);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(true);   // capture
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(false);  // blocked by rook
  });

  it('captures enemy piece via knight jump', () => {
    const withEnemy: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd4' },
      { slot: 'R', color: 'B', at: 'e6' },  // knight-jump away from d4
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
      { slot: 'N', color: 'W', at: 'e6' },  // friendly — Apex cannot take it
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
      { slot: 'R', color: 'B', at: 'f4' },  // blocks rank-4 slide at f4
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(blocking);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true);  // capture the blocker
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(false); // beyond the blocker
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
    // All 8 knight destinations from d4
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
    // Bronco at b1 (rank 0, file 1), friendly pawn at a3 (rank 2, file 0): +2,-1 knight jump
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'b1' },  // Bronco
      { slot: 'P', color: 'W', at: 'a3' },  // friendly pawn
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'b1', 'a3')).toBe(true); // friendly capture!
  });

  it('may NOT capture own royal (K-slot)', () => {
    // Bronco at c2, King at e1: +0,-2? No. c2=(rank1,file2), e1=(rank0,file4): dr=-1,df=+2 → valid knight jump.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'c2' },  // Bronco; c2=(1,2) → e1=(0,4): dr=-1,df=+2 ✓
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c2', 'e1')).toBe(false); // cannot capture own king
  });

  it('friendly capture that exposes own royal is absent', () => {
    // Bronco at e4 blocks rook-check on e-file; all its jumps leave the file, exposing king.
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'N', color: 'W', at: 'e4' },  // Bronco pinned on e-file by rook
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'R', color: 'B', at: 'e8' },  // checks via e-file if Bronco moves
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    const broncoMoves = movesFrom(turns, 'e4');
    // Bronco cannot move anywhere without exposing king to rook
    expect(broncoMoves.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behemoth (R-slot, interim): up to 3 orthogonal squares
// ---------------------------------------------------------------------------
describe('Behemoth interim moves', () => {
  it.todo('rampage — S7b: capture triggers continuation to max distance, removing all pieces');

  it('moves up to 3 squares orthogonally', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // Can move 1, 2, or 3 squares in each direction
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true); // 1 right
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true); // 2 right
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(true); // 3 right
    expect(hasStdMove(turns, 'd4', 'h4')).toBe(false); // 4 right — too far
    expect(hasStdMove(turns, 'd4', 'd5')).toBe(true); // 1 up
    expect(hasStdMove(turns, 'd4', 'd6')).toBe(true); // 2 up
    expect(hasStdMove(turns, 'd4', 'd7')).toBe(true); // 3 up
    expect(hasStdMove(turns, 'd4', 'd8')).toBe(false); // 4 up — too far
  });

  it('captures an enemy piece (lands on target square)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'R', color: 'B', at: 'f4' },  // enemy: 2 squares right
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true); // capture (lands on target)
    expect(hasStdMove(turns, 'd4', 'g4')).toBe(false); // blocked by enemy
  });

  it('may capture a friendly non-royal piece', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth
      { slot: 'N', color: 'W', at: 'f4' },  // friendly Bronco: 2 squares right
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'f4')).toBe(true); // friendly capture!
  });

  it('may NOT capture own royal', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'd1' },  // king directly below Behemoth
      { slot: 'R', color: 'W', at: 'd4' },  // Behemoth — 3 squares from king
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    // d4→d3 and d4→d2 are valid empty-square moves, but d4→d1 must never appear
    expect(hasStdMove(turns, 'd4', 'd3')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd2')).toBe(true);
    expect(hasStdMove(turns, 'd4', 'd1')).toBe(false); // own royal
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
});

// ---------------------------------------------------------------------------
// Stalker (B-slot, interim): up to 2 diagonal squares
// ---------------------------------------------------------------------------
describe('Stalker interim moves', () => {
  it.todo('strike-and-return + exhaustion — S7b: capture removes piece, Stalker returns home; Stalker Exhausted next turn');

  it('moves up to 2 squares diagonally', () => {
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

  it('captures an enemy piece (ordinary landing on target square)', () => {
    const pieces: PieceSpec[] = [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'd4' },  // Stalker
      { slot: 'N', color: 'B', at: 'f6' },  // enemy 2 squares NE
      { slot: 'K', color: 'B', at: 'h8' },
    ];
    const state = makeState(pieces);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'f6')).toBe(true);  // captures enemy
    expect(hasStdMove(turns, 'd4', 'e5')).toBe(true);  // intermediate square still reachable
    expect(hasStdMove(turns, 'd4', 'g7')).toBe(false); // blocked beyond enemy
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
});

// ---------------------------------------------------------------------------
// Behemoth Armor — the central deliverable
// ---------------------------------------------------------------------------
describe('Behemoth Armor', () => {
  // Fixture: Wild White Behemoth at e4. Enemy pieces at various distances.

  it('enemy Rook at distance 4 (a4) CANNOT capture the Behemoth at e4', () => {
    // a4 to e4: file distance = 4, rank distance = 0 → chebyshev = 4 > 2
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'a4' },  // enemy Rook far away
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'a4', 'e4')).toBe(false); // Armor blocks
    expect(hasStdMove(turns, 'a4', 'b4')).toBe(true);  // can still slide nearby
    expect(hasStdMove(turns, 'a4', 'd4')).toBe(true);  // can reach d4 (empty)
  });

  it('enemy Rook at distance 2 (c4) CAN capture the Behemoth at e4', () => {
    // c4 to e4: file distance = 2 → chebyshev = 2 ≤ 2
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'c4' },  // enemy Rook within Chebyshev 2
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c4', 'e4')).toBe(true); // Armor allows (distance 2)
  });

  it('enemy Knight at c3 (chebyshev 2) CAN capture the Behemoth at e4', () => {
    // c3=(rank2,file2), e4=(rank3,file4): chebyshev = max(1,2) = 2 ≤ 2; valid knight jump (+1,+2)
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'N', color: 'B', at: 'c3' },  // chebyshev 2, valid knight jump
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c3', 'e4')).toBe(true);
  });

  it('adjacent enemy King (d4, chebyshev 1) CAN capture the Behemoth at e4', () => {
    // d4 to e4: chebyshev = 1 ≤ 2
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'd4' },  // adjacent Black king
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'd4', 'e4')).toBe(true);
  });

  it('enemy Bishop sliding from c2 (chebyshev 2) CAN capture Behemoth at e4', () => {
    // c2=(rank1,file2), e4=(rank3,file4): chebyshev = max(2,2) = 2 ≤ 2; valid diagonal
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'B', color: 'B', at: 'c2' },  // chebyshev 2, diagonal slide via d3
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c2', 'e4')).toBe(true);
  });

  it('enemy Bishop sliding from b1 (chebyshev 3) CANNOT capture Behemoth at e4', () => {
    // b1=(rank0,file1), e4=(rank3,file4): chebyshev = max(3,3) = 3 > 2
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // Behemoth
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'B', color: 'B', at: 'b1' },  // chebyshev 3 — Armor blocks
    ], { sideToMove: 'B', armies: { W: 'Wild', B: 'Crown' } });
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'b1', 'e4')).toBe(false);
  });

  it('enemy Behemoth (Wild vs Wild) at h4 (chebyshev 3) CANNOT capture White Behemoth at e4', () => {
    // h4=(rank3,file7), e4=(rank3,file4): chebyshev = max(0,3) = 3 > 2
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // White Behemoth
      { slot: 'K', color: 'B', at: 'a8' },
      { slot: 'R', color: 'B', at: 'h4' },  // Black Behemoth — 3 squares away
    ], {
      sideToMove: 'B',
      armies: { W: 'Wild', B: 'Wild' },
    });
    const turns = legalTurns(state);
    // Black Behemoth slides left: h4→g4→f4→e4 (3 steps), but Armor blocks at e4
    expect(hasStdMove(turns, 'h4', 'e4')).toBe(false);  // Armor: chebyshev 3
    expect(hasStdMove(turns, 'h4', 'g4')).toBe(true);   // empty, fine
    expect(hasStdMove(turns, 'h4', 'f4')).toBe(true);   // empty, fine
  });

  it('friendly Bronco capturing own Behemoth is NOT blocked by Armor', () => {
    // Armor only applies to enemy pieces. White Bronco at c3 can always capture White Behemoth.
    // c3=(rank2,file2), e4=(rank3,file4): knight jump +1,+2 ✓; chebyshev 2 but it's friendly
    const state = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'e4' },  // White Behemoth
      { slot: 'N', color: 'W', at: 'c3' },  // White Bronco — friendly
      { slot: 'K', color: 'B', at: 'h8' },
    ]);
    const turns = legalTurns(state);
    expect(hasStdMove(turns, 'c3', 'e4')).toBe(true); // friendly capture, no Armor
  });
});

// ---------------------------------------------------------------------------
// Armor: not part of the threat model
// ---------------------------------------------------------------------------
describe('Armor is not threat — Wild ThreatModel', () => {
  it('attackedSquares includes Behemoth attack range regardless of Armor', () => {
    // A Behemoth at e4 attacks up to 3 orthogonal squares in each direction.
    // Armor only affects capture legality, not which squares are "attacked."
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
    // Behemoth attacks orthogonally up to 3 squares — not gated by Armor
    expect(attacked.has(sq('f4'))).toBe(true);
    expect(attacked.has(sq('g4'))).toBe(true);
    expect(attacked.has(sq('h4'))).toBe(true);  // 3rd square: still attacked
    expect(attacked.has(sq('d4'))).toBe(true);
    expect(attacked.has(sq('c4'))).toBe(true);
    expect(attacked.has(sq('b4'))).toBe(true);
    // Square outside range is NOT attacked by Behemoth (but might be by king)
    // h4 is 3 squares away so it IS attacked; a4 (4 away) is NOT
    expect(attacked.has(sq('a4'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-army Armor: Wraith teleport vs Behemoth (Veil S4 done)
// ---------------------------------------------------------------------------
describe('cross-army Armor: Veil Wraith teleport vs Wild Behemoth', () => {
  // Fixture: Veil(W) vs Wild(B).

  it('Wraith at a1 CANNOT teleport-capture a Behemoth at h6 (chebyshev 7)', () => {
    // a1=(rank0,file0), h6=(rank5,file7): not on any queen line → teleport
    // chebyshev = max(5,7) = 7 > 2 → Armor blocks
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'g1' },
      { slot: 'Q', color: 'W', at: 'a1' },  // Wraith at a1
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'h6' },  // Wild Behemoth at h6
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
    expect(hasTeleport(turns, 'a1', 'h6', true)).toBe(false); // Armor blocks
  });

  it('Wraith at f5 CAN teleport-capture a Behemoth at h6 (chebyshev 2)', () => {
    // f5=(rank4,file5), h6=(rank5,file7): not on same queen line → teleport
    // chebyshev = max(1,2) = 2 ≤ 2 → Armor allows
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'f5' },  // Wraith at f5
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'h6' },  // Wild Behemoth at h6
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
    expect(hasTeleport(turns, 'f5', 'h6', true)).toBe(true); // Armor allows (chebyshev 2)
  });
});

// ---------------------------------------------------------------------------
// Cross-army Armor: Shatter (Twins S6 done)
// ---------------------------------------------------------------------------
describe('cross-army Armor: Twins Shatter clears Wild Behemoth', () => {
  it('Shatter removes adjacent Behemoth regardless of Armor (bypasses captureConstraints)', () => {
    // Twins Warlord at e4 shatters; Black Wild Behemoth at e5 is adjacent.
    // Shatter does not route through captureConstraints — it removes all adjacent pieces directly.
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'd1' },  // first Warlord (not adjacent to e4)
      { slot: 'K', color: 'W', at: 'e4' },  // shattering Warlord
      { slot: 'K', color: 'B', at: 'h8' },  // Wild King
      { slot: 'R', color: 'B', at: 'e5' },  // Wild Behemoth adjacent to e4
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
    expect(after.board[sq('e5')]).toBeNull(); // Behemoth removed by Shatter
    expect(after.board[sq('e4')]).toEqual({ slot: 'K', color: 'W' }); // Warlord stays
  });
});

// ---------------------------------------------------------------------------
// Wild vs Crown short game fixture
// ---------------------------------------------------------------------------
describe('Wild vs Crown: short game', () => {
  it('starting position is ongoing with legal turns for both sides', () => {
    const s0 = initialState('Wild', 'Crown');
    expect(gameStatus(s0).type).toBe('ongoing');
    const whiteTurns = legalTurns(s0);
    expect(whiteTurns.length).toBeGreaterThan(0);

    // Play White's first move (any legal turn)
    const s1 = applyTurnUnchecked(s0, whiteTurns[0]);
    expect(gameStatus(s1).type).toBe('ongoing');
    const blackTurns = legalTurns(s1);
    expect(blackTurns.length).toBeGreaterThan(0);
  });

  it('Apex on open board can check the Crown king', () => {
    // Wild White Apex at e5 (rank 4, file 4). Black Crown King at e8 (rank 7, file 4).
    // Apex rook slide up the e-file: e5→e6→e7→e8 — gives check!
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e5' },  // Apex — checks along e-file
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
    // Black king must escape check
    const turns = legalTurns(state);
    expect(turns.length).toBeGreaterThan(0);
    // King cannot stay on e-file (still in check from Apex)
    expect(hasStdMove(turns, 'e8', 'e7')).toBe(false); // still on e-file, in check
    // King can escape sideways
    expect(hasStdMove(turns, 'e8', 'd8') || hasStdMove(turns, 'e8', 'f8')).toBe(true);
  });

  it('Wild Behemoth can check the Crown king at 3-square distance', () => {
    // White Behemoth at a5, Black Crown King at d5 — 3 squares right, orthogonal
    const board = buildBoard([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'R', color: 'W', at: 'a5' },  // Behemoth
      { slot: 'K', color: 'B', at: 'd5' },  // 3 squares right of a5
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
    // Crown king must escape from Behemoth attack
    expect(turns.length).toBeGreaterThan(0);
    // Black king at d5 is in check; cannot stay adjacent on the same rank
    // (b5 and c5 are attacked by Behemoth; e5 would be fine if Behemoth range stops at d5)
    // Behemoth at a5 attacks b5, c5, d5 only (3 squares). e5 is NOT attacked.
    expect(hasStdMove(turns, 'd5', 'e5')).toBe(true); // escape: outside Behemoth range
  });
});
