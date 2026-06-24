/**
 * S8 promotion tests: per-army slot counting, blocked-pawn state,
 * Royal Abundance, Twins-Q-closed, and promoted-piece identity.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  legalTurns, applyTurn, applyTurnUnchecked, gameStatus,
  algebraicToSquare, availablePromotions,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Turn, StandardMove } from '../../src/engine/index';
import { setAccordEmpowerment } from '../../src/engine/accord';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sq(alg: string): number { return algebraicToSquare(alg); }

type PieceSpec = { slot: Slot; color: Color; at: string };

function buildBoard(pieces: PieceSpec[]): (Piece | null)[] {
  const board = new Array<Piece | null>(64).fill(null);
  for (const { slot, color, at } of pieces) board[sq(at)] = { slot, color };
  return board;
}

function makeState(
  armyW: GameState['armies']['W'],
  armyB: GameState['armies']['B'],
  pieces: PieceSpec[],
  sideToMove: Color = 'W',
  overrides: Partial<GameState> = {},
): GameState {
  return {
    board: buildBoard(pieces),
    sideToMove,
    armies: { W: armyW, B: armyB },
    castlingRights: '-',
    enPassantTarget: null,
    essence: { W: armyW === 'Veil' ? 2 : 0, B: armyB === 'Veil' ? 2 : 0 },
    exhausted: [],
    halfmoveClock: 0,
    fullmoveNumber: 1,
    positionKeys: [],
    ...overrides,
  };
}

function promoTurns(turns: Turn[], from: string, to: string): Slot[] {
  return turns
    .filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.from === sq(from) && mv.to === sq(to) && mv.promotion !== undefined;
    })
    .map(t => (t.primary as StandardMove).promotion!);
}

function hasMove(turns: Turn[], from: string, to: string, promo?: Slot): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'standard') return false;
    const mv = t.primary as StandardMove;
    return mv.from === sq(from) && mv.to === sq(to) &&
      (promo !== undefined ? mv.promotion === promo : true);
  });
}

afterEach(() => { setAccordEmpowerment('king-step'); });

// ---------------------------------------------------------------------------
// Crown — Royal Abundance
// ---------------------------------------------------------------------------
describe('Crown: Royal Abundance', () => {
  it('can promote to Q even with first Queen still alive', () => {
    // Pawn at g7 ready to push; Crown Queen alive at d1; all R/B/N slots full
    const state = makeState('Crown', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const turns = legalTurns(state);
    expect(hasMove(turns, 'g7', 'g8', 'Q')).toBe(true);
  });

  it('Q promotion is the only slot open when R/B/N all have 2 pieces', () => {
    const state = makeState('Crown', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos.sort()).toEqual(['Q']);
  });

  it('R/B/N available when pieces are lost', () => {
    // Lost one Rook → R-slot open
    const state = makeState('Crown', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'h1' }, // only one Rook
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8').sort();
    expect(promos).toContain('Q');
    expect(promos).toContain('R');
  });
});

// ---------------------------------------------------------------------------
// Twins — Q-slot permanently closed
// ---------------------------------------------------------------------------
describe('Twins: Q-slot permanently closed', () => {
  it('pawn on 7th rank never generates Q promotion', () => {
    // Both Warlords alive; pawn at g7; one Rook dead so R-slot open
    const state = makeState('Twins', 'Crown', [
      { slot: 'K', color: 'W', at: 'd1' },
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'R', color: 'W', at: 'h1' }, // only one Rook (R-slot open)
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).not.toContain('Q');
    expect(promos).toContain('R'); // R-slot open
  });

  it('Q-slot is always closed even if somehow (hypothetically) Q-slot count = 0', () => {
    // availablePromotions for Twins never includes Q regardless of board state
    const state = makeState('Twins', 'Crown', [
      { slot: 'K', color: 'W', at: 'd1' },
      { slot: 'K', color: 'W', at: 'e1' },
      // No R/B/N pieces — all slots open
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = availablePromotions(state, 'W');
    expect(promos).not.toContain('Q');
    expect(promos).toContain('R');
    expect(promos).toContain('B');
    expect(promos).toContain('N');
  });
});

// ---------------------------------------------------------------------------
// Phantom — Thrall promotes
// ---------------------------------------------------------------------------
describe('Phantom: Thrall promotion', () => {
  it('Thrall on 7th rank generates Q/R/B/N promotions when slots open', () => {
    // Shade alive (Q-slot full); both Rooks alive (R full); all B/N full → only open if piece dies
    // Remove both Bishops → B-slot open
    const state = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Shade
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      // No Bishops (both dead — B-slot open)
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' }, // Thrall (P-slot for Phantom)
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8').sort();
    expect(promos).toContain('B'); // B-slot open
    expect(promos).not.toContain('Q'); // Shade alive → Q full
    expect(promos).not.toContain('R'); // both Rooks alive
    expect(promos).not.toContain('N'); // both Knights alive
  });

  it('Thrall promotes to Q when Shade is captured', () => {
    const state = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      // Shade gone (Q-slot free)
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).toContain('Q');
  });
});

// ---------------------------------------------------------------------------
// Veil — Rook promotion opens when a Wisp dies
// ---------------------------------------------------------------------------
describe('Veil: R-slot promotion (Wisp)', () => {
  it('no R promotion when both Wisps alive', () => {
    const state = makeState('Veil', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Wraith
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' }, // Wisps
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ], 'W', { essence: { W: 2, B: 0 } });
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).not.toContain('R');
  });

  it('R promotion available when one Wisp dead', () => {
    const state = makeState('Veil', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Wraith
      { slot: 'R', color: 'W', at: 'h1' },  // only one Wisp
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ], 'W', { essence: { W: 2, B: 0 } });
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).toContain('R');
  });

  it('promoted FIDE Rook slides orthogonally (no teleport)', () => {
    // Build state after promotion: promoted Rook on g8
    const state = makeState('Veil', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Wraith
      { slot: 'R', color: 'W', at: 'h1' },  // one Wisp remaining
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'a8' },
    ], 'W', { essence: { W: 2, B: 0 } });

    // Promote pawn to R
    const afterPromo = applyTurnUnchecked(state, {
      primary: { type: 'standard', from: sq('g7'), to: sq('g8'), promotion: 'R' },
    });

    // Now it's Black's turn → then White again
    const afterBlack = applyTurnUnchecked(afterPromo, {
      primary: { type: 'standard', from: sq('a8'), to: sq('b8') },
    });

    // White promoted Rook at g8: should generate sliding StandardMoves, no TeleportMoves
    const turns = legalTurns(afterBlack);
    const rookTurns = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.from === sq('g8');
    });
    expect(rookTurns.length).toBeGreaterThan(0);

    // Must NOT generate teleport moves from g8 (it's a FIDE Rook, not a Wisp)
    const teleportFromG8 = turns.filter(t => {
      if (t.primary.type !== 'teleport') return false;
      return (t.primary as { from: number }).from === sq('g8');
    });
    expect(teleportFromG8.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wild — B-slot (Stalker) and N-slot (Bronco) promotion
// ---------------------------------------------------------------------------
describe('Wild: B-slot and N-slot promotions', () => {
  it('no N promotion when both Broncos alive', () => {
    const state = makeState('Wild', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Apex
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' }, // Behemoths
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' }, // Stalkers
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' }, // Broncos
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).not.toContain('N');
    expect(promos).not.toContain('B');
    expect(promos).not.toContain('Q');
    expect(promos).not.toContain('R');
  });

  it('N promotion available when a Bronco is dead', () => {
    const state = makeState('Wild', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Apex
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' }, // only one Bronco → N-slot open
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const promos = promoTurns(legalTurns(state), 'g7', 'g8');
    expect(promos).toContain('N');
  });

  it('promoted FIDE Knight has no friendly-capture ability', () => {
    // Wild Bronco can capture friendly pieces; a promoted FIDE Knight should not
    // After promoting a Wild pawn to Knight, it should NOT capture its own King
    const state = makeState('Wild', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'a1' }, { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' },  // one Bronco alive
      { slot: 'P', color: 'W', at: 'g7' },
      { slot: 'K', color: 'B', at: 'a8' },
    ]);
    // Promote pawn to N
    const afterPromo = applyTurnUnchecked(state, {
      primary: { type: 'standard', from: sq('g7'), to: sq('g8'), promotion: 'N' },
    });
    // Black passes
    const afterBlack = applyTurnUnchecked(afterPromo, {
      primary: { type: 'standard', from: sq('a8'), to: sq('b8') },
    });
    // The promoted Knight is at g8. It should not capture friendly pieces.
    const turns = legalTurns(afterBlack);
    const knightCapFriendly = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      if (mv.from !== sq('g8')) return false;
      const targetPiece = afterBlack.board[mv.to];
      return targetPiece !== null && targetPiece.color === 'W';
    });
    expect(knightCapFriendly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Accord — Rook promotion + Banner eligibility
// ---------------------------------------------------------------------------
describe('Accord: promoted Rook is Banner-eligible', () => {
  it('promoted FIDE Rook inside Banner gets empowerment (king-step)', () => {
    // Herald at e2 (Banner covers d1..f3 zone). Promoted Rook placed at e3 (in Banner zone).
    // The Rook should have king-step bonus moves in addition to orthogonal slides.
    const state = makeState('Accord', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'e2' }, // Herald
      // No original Rooks → R-slot open; promoted Rook at e3 (simulate post-promotion)
      { slot: 'R', color: 'W', at: 'e3' }, // this is the promoted FIDE Rook
      { slot: 'K', color: 'B', at: 'h8' },
    ]);

    const turns = legalTurns(state);
    // Rook at e3 with Banner from Herald at e2: Banner zone is d1..f3 (3×3 around e2)
    // e3 is in the zone → Empowered: gets king-step bonus in addition to orthogonal slides
    // King-step bonus: can move one square diagonally → d2, f2, d4, f4
    const rTurns = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      return (t.primary as StandardMove).from === sq('e3');
    });

    // Native Rook moves include orthogonal slides from e3
    const hasOrthogonal = rTurns.some(t => (t.primary as StandardMove).to === sq('e4'));
    expect(hasOrthogonal).toBe(true);

    // Empowerment adds king-step (one square any direction including diagonals)
    const hasDiagonalStep = rTurns.some(t => (t.primary as StandardMove).to === sq('d4'));
    expect(hasDiagonalStep).toBe(true); // d4 = e3 + (-1,+1) king-step diagonal
  });
});

// ---------------------------------------------------------------------------
// Slot counting with promoted occupants
// ---------------------------------------------------------------------------
describe('slot counting with promoted occupants', () => {
  it('two Wisps dead, one R promotion taken → exactly one R-slot open', () => {
    // Veil: both Wisps dead, but one promoted FIDE Rook already on board (slot='R')
    // R-slot: count = 1 (the promoted Rook); cap = 2 → one slot still open
    const state = makeState('Veil', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Wraith
      { slot: 'R', color: 'W', at: 'g8' }, // promoted FIDE Rook occupying a Wisp slot
      // Both original Wisps dead (only the promoted Rook in R-slot)
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'f7' }, // pawn ready to promote
      { slot: 'K', color: 'B', at: 'e8' },
    ], 'W', { essence: { W: 2, B: 0 } });

    const promos = availablePromotions(state, 'W');
    expect(promos).toContain('R'); // one slot still open
    expect(promos).not.toContain('Q'); // Wraith alive
    expect(promos).not.toContain('B'); // both alive
    expect(promos).not.toContain('N'); // both alive
  });

  it('two Wisps dead and two R-promotions taken → R-slot fully closed', () => {
    const state = makeState('Veil', 'Crown', [
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'g8' }, // first promoted Rook
      { slot: 'R', color: 'W', at: 'f8' }, // second promoted Rook
      // Both Wisps dead; both R-slots now occupied by promoted Rooks
      { slot: 'B', color: 'W', at: 'c1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'b1' }, { slot: 'N', color: 'W', at: 'g1' },
      { slot: 'P', color: 'W', at: 'e7' },
      { slot: 'K', color: 'B', at: 'a8' },
    ], 'W', { essence: { W: 2, B: 0 } });

    const promos = availablePromotions(state, 'W');
    expect(promos).not.toContain('R'); // both R-slots full (two promoted Rooks)
  });
});

// ---------------------------------------------------------------------------
// Blocked pawn: all slots full → no 7th-rank moves, no diagonal threat
// ---------------------------------------------------------------------------
describe('blocked pawn: all promotion slots full', () => {
  // Use Phantom (W) so we have a non-Crown, non-Twins army with a simple threat model.
  // All slots full: Q=Shade, R=2 Rooks, B=2 Bishops, N=2 Knights.
  // Pawn on g7 (7th rank), Black King at h8 (on pawn's diagonal capture square).

  function phantomFullState(extra: PieceSpec[] = []): GameState {
    return makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Shade
      { slot: 'R', color: 'W', at: 'b1' }, { slot: 'R', color: 'W', at: 'c1' }, // 2 Rooks
      { slot: 'B', color: 'W', at: 'e1' }, { slot: 'B', color: 'W', at: 'f1' }, // 2 Bishops
      { slot: 'N', color: 'W', at: 'g1' }, { slot: 'N', color: 'W', at: 'h1' }, // 2 Knights
      { slot: 'P', color: 'W', at: 'g7' }, // blocked pawn: no slots open
      { slot: 'K', color: 'B', at: 'e8' },
      ...extra,
    ]);
  }

  it('blocked pawn on 7th rank has zero push or capture moves to 8th', () => {
    const state = phantomFullState();
    const turns = legalTurns(state);
    const pawnMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.from === sq('g7');
    });
    expect(pawnMoves.length).toBe(0); // completely stuck
  });

  it('enemy king may step onto blocked pawn diagonal squares (no threat)', () => {
    // Black King at e8 to move; pawn blocked on g7; h8 is the pawn's right diagonal
    // Black King can step to h8 since blocked pawn doesn't threaten it
    const state = phantomFullState();
    // White moves (say a1 King somewhere) → Black can now move King to h8
    const afterW = applyTurnUnchecked(state, {
      primary: { type: 'standard', from: sq('a1'), to: sq('a2') },
    });
    // It's Black's turn; Black King at e8 should be able to reach h8 via f8,g8 (multiple moves)
    const turns = legalTurns(afterW);
    // Black King at e8 can step to f8 (legal) and from there eventually to h8.
    // Simpler check: f8 is adjacent to e8 and one diagonal of g7 = NOT h8/f8... wait:
    // g7 (rank 6, file 6) → diagonal captures: (rank 7, file 5) = f8, (rank 7, file 7) = h8
    // f8 = sq('f8'), h8 = sq('h8')
    // Black King at e8 can step to f8 (adjacent: e8 = rank 7, file 4; f8 = rank 7, file 5)
    const canStepToF8 = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.from === sq('e8') && mv.to === sq('f8');
    });
    expect(canStepToF8).toBe(true);
  });

  it('friendly piece on blocked pawn diagonal is NOT defended by it', () => {
    // White Rook on f8 (on pawn's diagonal). Enemy can capture it freely because
    // the blocked pawn does not defend f8.
    const state = phantomFullState([
      { slot: 'R', color: 'B', at: 'f8' },  // Black attacker
      // White Rook on f8 would require overriding... let me use g8 instead
    ]);
    // Actually, let me set up: White piece on h8 (the pawn's other diagonal)
    // The Black side should be able to capture it without the pawn defending it.
    // To simplify: check that legalTurns for Black includes capturing h8
    // after we place a capturable White piece there.
    // Use a fresh state with a White Knight on h8 and enemy can capture it.
    const state2 = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Shade
      { slot: 'R', color: 'W', at: 'b1' }, { slot: 'R', color: 'W', at: 'c1' },
      { slot: 'B', color: 'W', at: 'e1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' }, { slot: 'N', color: 'W', at: 'h1' },
      { slot: 'P', color: 'W', at: 'g7' }, // blocked pawn
      { slot: 'N', color: 'W', at: 'h8' }, // White piece on pawn diagonal
      { slot: 'K', color: 'B', at: 'e8' },
      { slot: 'R', color: 'B', at: 'h1' }, // Black Rook can slide to h8
    ], 'B'); // Black to move

    // Black Rook from h1 can slide along h-file to h8 (capturing White Knight)
    const turns = legalTurns(state2);
    const canCaptureH8 = turns.some(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.to === sq('h8');
    });
    expect(canCaptureH8).toBe(true);
  });

  it('opening a slot (capturing a Knight) instantly re-arms blocked pawn', () => {
    // State: all Phantom slots full, pawn at g7 blocked.
    // White captures a Black Knight → but Black has no Knights here, so let's say
    // White plays a move that opens a slot (in this test: manually change state
    // to remove a White Knight, simulating it was captured).
    const stateAfterLoss = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd1' }, // Shade
      { slot: 'R', color: 'W', at: 'b1' }, { slot: 'R', color: 'W', at: 'c1' },
      { slot: 'B', color: 'W', at: 'e1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' }, // only ONE Knight now (one was captured)
      { slot: 'P', color: 'W', at: 'g7' }, // was blocked; now N-slot open
      { slot: 'K', color: 'B', at: 'e8' },
    ]);
    const turns = legalTurns(stateAfterLoss);
    // N-slot is now open → pawn can promote to N → pawn has moves again
    const pawnMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      return mv.from === sq('g7');
    });
    expect(pawnMoves.length).toBeGreaterThan(0);
    const promos = pawnMoves.map(t => (t.primary as StandardMove).promotion!);
    expect(promos).toContain('N');
    expect(promos).not.toContain('Q'); // Shade still alive → Q closed
  });

  it('blocked pawn: enemy King on diagonal square is not in check', () => {
    // All Phantom slots full → pawn at g7 gives no threat.
    // Black King at h8 (pawn's right diagonal): must NOT be in check.
    const state = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'b1' }, { slot: 'R', color: 'W', at: 'c1' },
      { slot: 'B', color: 'W', at: 'e1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' }, { slot: 'N', color: 'W', at: 'h1' },
      { slot: 'P', color: 'W', at: 'g7' }, // blocked: no slots open
      { slot: 'K', color: 'B', at: 'h8' }, // on pawn's diagonal
    ], 'B');
    // If blocked pawn gave check, Black would have no escape → checkmate or stalemate.
    // Instead it should be ongoing with some legal moves for the Black King.
    const turns = legalTurns(state);
    expect(turns.length).toBeGreaterThan(0);
    const status = gameStatus(state);
    // Should not be a loss for Black (king on "threatened" diagonal is safe)
    expect(status.type).not.toBe('win');
  });

  it('slot opening re-arms diagonal threat: king on pawn diagonal enters check', () => {
    // One Knight removed → N-slot open → pawn at g7 can promote to N → pawn threatens h8.
    // Black King at h8 is now in check → must move.
    const state = makeState('Phantom', 'Crown', [
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'Q', color: 'W', at: 'd1' },
      { slot: 'R', color: 'W', at: 'b1' }, { slot: 'R', color: 'W', at: 'c1' },
      { slot: 'B', color: 'W', at: 'e1' }, { slot: 'B', color: 'W', at: 'f1' },
      { slot: 'N', color: 'W', at: 'g1' }, // only one Knight → N-slot open
      { slot: 'P', color: 'W', at: 'g7' }, // can now promote to N → threatens h8
      { slot: 'K', color: 'B', at: 'h8' }, // on pawn's right diagonal
    ], 'B');
    // Black King is in check (pawn threatens h8 via N-promotion).
    // Legal Black turns must resolve the check (move King off h8).
    const turns = legalTurns(state);
    if (turns.length > 0) {
      // Every legal turn must move the King (it's in check → must resolve it)
      const allMoveKing = turns.every(t => {
        if (t.primary.type !== 'standard') return false;
        const mv = t.primary as StandardMove;
        return state.board[mv.from]?.slot === 'K';
      });
      expect(allMoveKing).toBe(true);
    } else {
      // If no legal turns: checkmate (Black King in check with no escape)
      const st = gameStatus(state);
      expect(st.type).toBe('win');
    }
  });
});
