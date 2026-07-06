import { describe, it, expect } from 'vitest';
import {
  initialState, legalTurns, applyTurnUnchecked,
  gameStatus, parseSfen, algebraicToSquare,
  registerGenerator, registerThreatModel, fideThreatModel, fideGenerator,
} from '../../src/engine/index';
import type { StandardMove, Turn } from '../../src/engine/index';
import { THRALL_HOMING_TWINS } from '../../src/engine/phantom';

import '../../src/engine/threat';
import '../../src/engine/movegen';
import '../../src/engine/phantom';

// Stub registrations for armies used in cross-army tests but not yet implemented.
// Twins uses FIDE semantics: K-slot royals on d/e files, standard FIDE moves.
registerGenerator('Twins', fideGenerator);
registerThreatModel('Twins', fideThreatModel);

function sq(alg: string) { return algebraicToSquare(alg); }

function mv(from: string, to: string, promotion?: string): Turn {
  const m: StandardMove = { type: 'standard', from: sq(from), to: sq(to) };
  if (promotion) m.promotion = promotion as StandardMove['promotion'];
  return { primary: m };
}

function hasMove(turns: Turn[], from: string, to: string, promo?: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'standard') return false;
    const p = t.primary as StandardMove;
    return p.from === sq(from) && p.to === sq(to) &&
      (promo ? p.promotion === promo : !p.promotion);
  });
}

function hasMoveAnyPromo(turns: Turn[], from: string, to: string): boolean {
  return turns.some(t => {
    if (t.primary.type !== 'standard') return false;
    const p = t.primary as StandardMove;
    return p.from === sq(from) && p.to === sq(to);
  });
}

// ---------------------------------------------------------------------------
// shade-move0-regression: no royal in check at start, game ongoing, legal turns exist
// ---------------------------------------------------------------------------
describe('shade-move0-regression', () => {
  it('Phantom(W) vs Twins(B): game ongoing, no check, has legal turns', () => {
    const state = initialState('Phantom', 'Twins');
    expect(state.sideToMove).toBe('W');
    const status = gameStatus(state);
    expect(status.type).toBe('ongoing');
    const turns = legalTurns(state);
    expect(turns.length).toBeGreaterThan(0);
  });

  it('Twins(W) vs Phantom(B): game ongoing, no check, has legal turns', () => {
    const state = initialState('Twins', 'Phantom');
    expect(state.sideToMove).toBe('W');
    const status = gameStatus(state);
    expect(status.type).toBe('ongoing');
    const turns = legalTurns(state);
    expect(turns.length).toBeGreaterThan(0);
  });

  it('Phantom vs Crown: game ongoing at move 0', () => {
    const state = initialState('Phantom', 'Crown');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });

  it('Crown vs Phantom: game ongoing at move 0', () => {
    const state = initialState('Crown', 'Phantom');
    expect(gameStatus(state).type).toBe('ongoing');
    expect(legalTurns(state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Shade check: interposition absent, capture-Shade and king-move present
// ---------------------------------------------------------------------------
describe('Shade piercing check', () => {
  it('interposition not a legal response to Shade check', () => {
    // White Shade on d1, Black king on d8, Black rook on d5 (would interpose).
    // Shade has LOS to d8 (d5 is between but nothing blocks yet — wait, rook IS on d5, blocking).
    // Let's set up: White Shade on a4, Black king on e4, nothing between a4 and e4.
    // Black king is on e4, Shade on a4 — same rank, LOS clear → check.
    // Black piece on c4 could interpose. Verify it can't.
    // White king needs to be somewhere: g1. Black rook on c4 could interpose on c4 or b4.
    // SFEN: White Shade(Q) on a4, White King on g1; Black King on e4, Black rook on h7 (can't interpose, just a piece)
    // Actually let's use: White Shade a4, White King g1; Black King e4, Black Rook f6
    // Shade on a4 checks e4 (same rank, b4/c4/d4 empty).
    // Black rook on f6 could move to b4/c4/d4 to interpose.
    const state = parseSfen('8/8/5r2/8/Q3k3/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Interposing moves (rook to b4, c4, d4) should NOT be legal
    expect(hasMove(turns, 'f6', 'b4')).toBe(false);
    expect(hasMove(turns, 'f6', 'c4')).toBe(false);
    expect(hasMove(turns, 'f6', 'd4')).toBe(false);
    // King moves away from the check should be legal
    const kingMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('e4');
    });
    expect(kingMoves.length).toBeGreaterThan(0);
  });

  it('capturing the Shade is a legal response to Shade check', () => {
    // White Shade on a4, White King on g1; Black King on e4, Black Rook on b4 (adjacent to Shade)
    // Shade checks king on e4. Rook can capture Shade on a4.
    const state = parseSfen('8/8/8/8/Qr2k3/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Rook captures Shade on a4
    expect(hasMove(turns, 'b4', 'a4')).toBe(true);
  });

  it('king move is a legal response to Shade check', () => {
    const state = parseSfen('8/8/8/8/Q3k3/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // King should be able to escape (not along the a-file or same rank as Shade)
    const kingMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('e4');
    });
    expect(kingMoves.length).toBeGreaterThan(0);
    // King moving to f5 or e5 (off the rank) is valid
    expect(hasMove(turns, 'e4', 'f5')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Double check: Shade + knight → only king moves legal
// ---------------------------------------------------------------------------
describe('double check Shade + knight', () => {
  it('only king moves when Shade + knight give double check', () => {
    // White Shade on a4 (checks Black king on e4 along rank).
    // White knight on f6 (checks Black king on e4: knight on f6 → e4? No, f6 to e4 is [−2,−1] ✓)
    // Actually f6 to e4: rank diff = 4-6 = -2, file diff = 4-5 = -1 → yes, valid knight move.
    // Black king on e4, White Shade a4, White knight f6, White king g1.
    // Black rook on d6 could capture knight (breaking knight check) but can't interpose Shade.
    // After capturing knight, Shade still checks → illegal. King must move.
    const state = parseSfen('8/8/3r1N2/8/Q3k3/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Only king moves should be legal
    for (const turn of turns) {
      expect(turn.primary.type).toBe('standard');
      const p = turn.primary as StandardMove;
      expect(p.from).toBe(sq('e4')); // only king moves
    }
    expect(turns.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Shade pin: piece pinned by Shade cannot move
// ---------------------------------------------------------------------------
describe('Shade pin', () => {
  it('piece pinned by Shade has no legal moves', () => {
    // White Shade on a4, White King g1; Black King on e4, Black rook on c4 (between Shade and King).
    // If Black rook moves off c4, Shade gets LOS to e4 → check → illegal.
    // So Black rook on c4 must stay (or capture Shade).
    const state = parseSfen('8/8/8/8/Q1r1k3/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Rook moves that don't capture the Shade (a4) should be illegal
    // Rook can move along the rank (b4 — but that exposes king to Shade? No, moving to b4 still blocks)
    // Actually moving to b4 doesn't block since c4→b4 still on the rank between a4 and e4.
    // Wait: Shade on a4, rook on c4, king on e4. Rank 4. Rook on b4 still blocks a4→e4?
    // No: with rook on b4, path is a4→b4(blocked). So moving to b4 is legal (still blocks).
    // Moving to d4: path is a4→b4→c4(empty now)→d4(rook)... still blocks? No: rook on d4,
    // Shade on a4, king on e4. d4 is between a4 and e4, so it still blocks.
    // Moving to c8 (off the rank): a4→b4→c4(empty)→d4→e4(king) → CHECK → illegal.
    // So rook moves along rank 4 that keep blocking are legal; moves off rank are not.
    const rookOffRankMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      return p.from === sq('c4') && (p.to >> 3) !== 3; // rank 3 = row index 3 = rank 4
    });
    expect(rookOffRankMoves.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Shade cannot capture
// ---------------------------------------------------------------------------
describe('Shade cannot capture', () => {
  it('Shade generates no captures even with enemy piece on its line', () => {
    // White Shade on d4, enemy rook on d7. Shade should NOT have a move to d7.
    // White King on g1, Black King on h8, Black rook on d7.
    const state = parseSfen('7k/3r4/8/8/3Q4/8/8/6K1/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Shade (Q slot) on d4 should not capture the rook on d7
    expect(hasMove(turns, 'd4', 'd7')).toBe(false);
    // Empty squares on the file are legal; d7 (occupied) is not
    expect(hasMove(turns, 'd4', 'd5')).toBe(true);
    expect(hasMove(turns, 'd4', 'd6')).toBe(true);
    // Ghostwalk (v2.1): the Shade may pass THROUGH the rook to the empty d8
    expect(hasMove(turns, 'd4', 'd8')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shade Ghostwalk (v2.1): movement phases through pieces; threat does not
// ---------------------------------------------------------------------------
describe('Shade Ghostwalk', () => {
  it('Shade passes through an enemy piece to empty squares beyond it', () => {
    // Shade on a1, enemy rook on a4. Ghostwalk: a5..a8 reachable; a4 itself is not.
    const state = parseSfen('7k/8/8/8/r7/8/8/Q5K1/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'a1', 'a3')).toBe(true);
    expect(hasMove(turns, 'a1', 'a4')).toBe(false); // occupied: can't land, can't capture
    expect(hasMove(turns, 'a1', 'a5')).toBe(true);  // ghostwalked past the rook
    expect(hasMove(turns, 'a1', 'a8')).toBe(true);
  });

  it('Shade passes through friendly pieces (out of the starting position)', () => {
    // From the initial Phantom position, the Shade on d1 drifts through its
    // own Thrall wall: d-file to d3..d8? d8 holds the enemy Shade, d7 a Thrall.
    const state = initialState('Phantom', 'Phantom');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'd1', 'd2')).toBe(false); // own Thrall occupies d2
    expect(hasMove(turns, 'd1', 'd4')).toBe(true);  // through the wall
    expect(hasMove(turns, 'd1', 'd6')).toBe(true);
    expect(hasMove(turns, 'd1', 'd7')).toBe(false); // enemy Thrall occupies d7
    expect(hasMove(turns, 'd1', 'h5')).toBe(true);  // diagonal through e2 Thrall
  });

  it('Ghostwalk does not extend threat: no check through a wall', () => {
    // White Shade on e1, Black King on e8, White pawn-line piece on e4 blocks LOS.
    // Shade can MOVE past e4, but gives no check through it.
    const state = parseSfen('4k3/8/8/8/4N3/8/8/4Q1K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Black king is NOT in check (knight on e4 blocks the Shade's line):
    // any quiet Black king move like e8→d8 must be legal.
    expect(hasMove(turns, 'e8', 'd8')).toBe(true);
  });

  it('promoted Phantom Queen does NOT Ghostwalk (blocked sliding, captures normally)', () => {
    // No Shade on the board (Q-slot open) → Thrall on e7 may promote to Q.
    // White King a1, Black King g1, Black rook e4.
    const s0 = parseSfen('8/4P3/8/8/4r3/8/8/K5k1/w/Phantom,Crown/-/-/0,0/-/0/5');
    const s1 = applyTurnUnchecked(s0, mv('e7', 'e8', 'Q'));
    expect(s1.board[sq('e8')]?.promoted).toBe(true);
    // Black rook steps up the file: e4→e5. Now the promoted Queen on e8 faces
    // the rook on its own file with empty squares on both sides of it.
    const s2 = applyTurnUnchecked(s1, mv('e4', 'e5'));
    const turns = legalTurns(s2);
    expect(hasMove(turns, 'e8', 'e6')).toBe(true);  // slides up to the blocker
    expect(hasMove(turns, 'e8', 'e5')).toBe(true);  // CAPTURES it (Shade never could)
    expect(hasMove(turns, 'e8', 'e4')).toBe(false); // blocked — no ghostwalk past it
    expect(hasMove(turns, 'e8', 'e2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shade checkmate
// ---------------------------------------------------------------------------
describe('Shade checkmate', () => {
  it('Shade delivers checkmate (no interpose escape)', () => {
    // Black king on h8. White Shade on a8 (rank check). Knight f6 covers g8+h7.
    // Rook g1 covers g-file (g7, g8). White king stays below the midline at a1.
    // No interpose (Shade check, interposition banned). Black has no pieces to capture Shade.
    const state = parseSfen('Q6k/8/5N2/8/8/8/8/K5R1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }
  });
});

// ---------------------------------------------------------------------------
// Stalemate-loss with Phantom as winner
// ---------------------------------------------------------------------------
describe('Phantom stalemate-loss win', () => {
  it('opponent stalemated → Phantom wins', () => {
    // Black king on h8, not in check, but no legal moves.
    // White Shade on f7 covers rank-7 (g7, h7) and diagonal g8. White king at a1 below midline.
    // Black king at h8: g8 (Shade diagonal), g7 (Shade rank), h7 (Shade rank) all covered.
    // Shade at f7 does NOT check h8 (f7→h8 is Δrow=1,Δfile=2, not a queen line).
    const state = parseSfen('7k/5Q2/8/8/8/8/8/K7/b/Phantom,Crown/-/-/0,0/-/0/5');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('stalemate-loss');
      expect(status.winner).toBe('W');
    }
  });
});

// ---------------------------------------------------------------------------
// Thrall moves
// ---------------------------------------------------------------------------
describe('Thrall moves', () => {
  it('no double push for Thralls', () => {
    // Thrall on a2 (starting square for White). Should not generate a4.
    const state = parseSfen('4k3/8/8/8/8/8/P7/4K3/w/Phantom,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'a2', 'a4')).toBe(false);
    expect(hasMove(turns, 'a2', 'a3')).toBe(true);
  });

  it('Thrall captures diagonally forward', () => {
    // White Thrall on d4, Black piece on e5 (diagonal forward)
    const state = parseSfen('4k3/8/8/4r3/3P4/8/8/4K3/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'd4', 'e5')).toBe(true);
    expect(hasMove(turns, 'd4', 'd6')).toBe(false); // can't skip
  });

  it('homing move reduces Chebyshev distance', () => {
    // White Thrall on a4, Black King on e4 (same rank, distance = 4).
    // Homing to b4 reduces distance to 3 (Chebyshev max(|4-4|,|1-4|)=3). Legal.
    // Homing to a5: distance from a5 to e4 = max(1,4) = 4. Not reduced. Illegal.
    // Homing to a3: distance from a3 to e4 = max(1,4) = 4. Not reduced. Illegal.
    // Homing to b3: distance from b3 to e4 = max(1,3) = 3. Reduced. Legal.
    // Homing to b5: distance from b5 to e4 = max(1,3) = 3. Reduced. Legal.
    // Note: forward for White is +rank (up the board). Forward from a4 is a5 (already generated as push).
    // White King needs to be somewhere safe.
    const state = parseSfen('8/8/8/8/P3k3/8/8/7K/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // b4 reduces distance (4→3)
    expect(hasMove(turns, 'a4', 'b4')).toBe(true);
    // b3 reduces distance (4→3)
    expect(hasMove(turns, 'a4', 'b3')).toBe(true);
    // b5 reduces distance (4→3)
    expect(hasMove(turns, 'a4', 'b5')).toBe(true);
    // a5 IS generated as a normal forward push (Thrall can push forward); it's not a homing move.
    expect(hasMove(turns, 'a4', 'a5')).toBe(true);
    // a3 does NOT reduce distance (max(1,4)=4, same as current 4) → no homing move
    expect(hasMove(turns, 'a4', 'a3')).toBe(false);
  });

  it('homing move to occupied square is illegal', () => {
    // White Thrall on a4, Black King on e4, White piece on b4 (blocks homing there).
    const state = parseSfen('8/8/8/8/PR2k3/8/8/7K/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'a4', 'b4')).toBe(false); // b4 occupied by own rook
  });

  it('homing move that increases distance is illegal', () => {
    // Thrall on e4, king on e5 (distance 1). Moving to d4 increases distance to max(1,1)=1 — same.
    // Moving to d3 increases to max(2,1)=2. Moving to f4 same distance 1.
    // To test strictly: Thrall on a1, king on b2 (distance 1). No homing move can reduce further.
    const state = parseSfen('8/8/8/8/8/8/1k6/P7/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // Distance from a1 to b2 = max(1,1) = 1. No square adjacent to a1 is closer to b2.
    // (b1: distance max(1,0)=1, same. a2: distance max(0,1)=1, same. b2 is occupied.)
    // So no homing moves expected
    const homingFromA1 = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const p = t.primary as StandardMove;
      if (p.from !== sq('a1')) return false;
      // Homing would be to b1 or a2 (only adjacent empty non-forward squares)
      return p.to === sq('b1'); // a2 is forward (dir=1), so excluded from homing
    });
    expect(homingFromA1.length).toBe(0);
  });

  it('homing Thrall vs Twins: either Warlord suffices', () => {
    expect(THRALL_HOMING_TWINS).toBe('either');
    // Thrall on e4, Warlord1 on a4 (distance 4), Warlord2 on h8 (distance max(4,3)=4).
    // Moving to d4: distance to a4 = 3 (reduced), distance to h8 = max(4,4)=4 (same).
    // With 'either': legal (reduces distance to at least one Warlord).
    // White King h1; Black has two Kings (Twins).
    const state = parseSfen('7k/8/8/8/k3P3/8/8/7K/w/Phantom,Twins/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    // d4 reduces distance to h8 Warlord (from max(4,3)=4 to max(4,4)=4 — wait let me recalc)
    // e4 to h8: rank diff=4, file diff=3 → max=4
    // d4 to h8: rank diff=4, file diff=4 → max=4 — same!
    // e4 to a4: rank diff=0, file diff=4 → 4
    // d4 to a4: rank diff=0, file diff=3 → 3 — reduced!
    // So d4 reduces distance to a4 Warlord. With 'either', d4 should be legal.
    expect(hasMove(turns, 'e4', 'd4')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// En passant: Crown pawn double-push next to Thrall → no EP capture
// ---------------------------------------------------------------------------
describe('No en passant for Thralls', () => {
  it('Thrall does not capture via en passant even when Crown pawn double-pushes past it', () => {
    // Crown (Black) pawn on e7 double-pushes to e5 (past White Thrall on d5).
    // Black king on a1 (far from e6) so e6 is NOT a homing target for the Thrall.
    // Chebyshev d5→a1 = max(4,3)=4; Chebyshev e6→a1 = max(5,4)=5 → increases, so not a homing move.
    const s0 = parseSfen('8/4p3/8/3P4/8/8/8/k3K3/b/Phantom,Crown/-/-/0,0/-/0/5');
    // Black Crown pawn double-pushes: e7→e5
    const s1 = applyTurnUnchecked(s0, mv('e7', 'e5'));
    expect(s1.enPassantTarget).toBe(sq('e6')); // EP target set
    // Now White's turn — Thrall on d5 should not capture e6 (no EP for Thralls)
    const turns = legalTurns(s1);
    expect(hasMove(turns, 'd5', 'e6')).toBe(false);
  });

  it('Thrall double-step does NOT set en passant target', () => {
    // Thralls have no double push, so this is moot — but confirm no EP target after Thrall single push
    const state = parseSfen('4k3/8/8/8/8/8/P7/4K3/w/Phantom,Crown/-/-/0,0/-/0/1');
    const after = applyTurnUnchecked(state, mv('a2', 'a3'));
    expect(after.enPassantTarget).toBeNull();
  });

  it('Crown pawn adjacent to Thrall: Crown has no EP capture of Thrall', () => {
    // White Thrall single-steps from d4 to d5. Black Crown pawn on e5.
    // Crown pawn should not be able to capture d6 via EP (Thralls give no EP).
    const s0 = parseSfen('4k3/8/8/4p3/3P4/8/8/4K3/w/Phantom,Crown/-/-/0,0/-/0/5');
    const s1 = applyTurnUnchecked(s0, mv('d4', 'd5'));
    expect(s1.enPassantTarget).toBeNull(); // Thrall single-push sets no EP target
    // Black's turn
    const turns = legalTurns(s1);
    expect(hasMove(turns, 'e5', 'd6')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-army: Crown queen captures the Shade
// ---------------------------------------------------------------------------
describe('Cross-army captures', () => {
  it('Crown queen can capture the Shade', () => {
    // White Shade on d4, Black Crown Queen on h4 (same rank). Queen can capture d4.
    // (Remember Phantom is White here, Crown is Black)
    const state = parseSfen('4k3/8/8/8/3Q3q/8/8/4K3/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'h4', 'd4')).toBe(true);
  });

  it('after Crown captures the Shade, checkResponseConstraint no longer applies', () => {
    // White Shade on e4, White King on g1; Black King on e8 (same file, Shade checks via e5,e6,e7).
    // Black Rook on h4 can capture Shade on e4 (same rank, f4/g4 empty).
    // After capture, Black king is free.
    const state3 = parseSfen('4k3/8/8/8/4Q2r/8/8/6K1/b/Phantom,Crown/-/-/0,0/-/0/5');
    const turns3 = legalTurns(state3);
    // Shade on e4 checks king on e8 (e5,e6,e7 all empty → LOS). Rook captures Shade = legal.
    expect(hasMove(turns3, 'h4', 'e4')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Homing Thralls converge on cornered Crown king (zugzwang fixture)
// ---------------------------------------------------------------------------
describe('Homing convergence on cornered king', () => {
  it('multiple Thralls have homing moves toward cornered king', () => {
    // Black king cornered at h8. White Thralls on f6, g5 can home toward h8.
    // f6: dist to h8 = max(2,2)=2. Adjacent squares closer: g7(max(1,1)=1), g6(max(2,1)=2 same),
    //   g5(max(3,1)=3 far), e5(far), e6(far), e7(far), f7(max(1,2)=2 same), f5(far).
    //   So only g7 reduces. g7 empty → homing to g7 legal.
    // g5: dist to h8 = max(3,1)=3. Adjacent: h6(max(2,0)=2 reduced), h5(max(3,0)=3 same),
    //   f6(max(2,2)=2 reduced), h4(far), f5(far), f4(far).
    //   h6 is empty → homing to h6 legal. f6 occupied by Thrall → can't home there.
    const state = parseSfen('7k/8/5P2/6P1/8/8/8/6K1/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'f6', 'g7')).toBe(true);
    expect(hasMove(turns, 'g5', 'h6')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Thrall promotion
// ---------------------------------------------------------------------------
describe('Thrall promotion', () => {
  it('Thrall promotes on reaching back rank', () => {
    // White Thrall on e7, empty e8, Black king on h8, White king on a1.
    const state = parseSfen('7k/4P3/8/8/8/8/8/K7/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e7', 'e8', 'Q')).toBe(true);
    expect(hasMove(turns, 'e7', 'e8', 'R')).toBe(true);
    expect(hasMove(turns, 'e7', 'e8', 'B')).toBe(true);
    expect(hasMove(turns, 'e7', 'e8', 'N')).toBe(true);
    // No promotion without slot specified
    expect(hasMove(turns, 'e7', 'e8')).toBe(false);
  });

  it('Thrall promotes via diagonal capture', () => {
    // White Thrall on d7, Black rook on e8, Black king on h8, White king on a1.
    const state = parseSfen('4rk1k/3P4/8/8/8/8/8/K7/w/Phantom,Crown/-/-/0,0/-/0/5');
    const turns = legalTurns(state);
    expect(hasMoveAnyPromo(turns, 'd7', 'e8')).toBe(true);
  });
});
