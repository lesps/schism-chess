import { describe, it, expect } from 'vitest';
import {
  initialState, legalTurns, applyTurn, applyTurnUnchecked,
  gameStatus, parseSfen, algebraicToSquare,
} from '../../src/engine/index';
import type { StandardMove, Turn } from '../../src/engine/index';

import '../../src/engine/threat';
import '../../src/engine/movegen';

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
      (promo ? p.promotion === promo : true);
  });
}

// ---------------------------------------------------------------------------
// Castling
// ---------------------------------------------------------------------------
describe('castling', () => {
  it('white can castle kingside', () => {
    // Clear f1, g1 but keep rights
    const state = parseSfen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e1', 'g1')).toBe(true);
  });

  it('white can castle queenside', () => {
    const state = parseSfen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e1', 'c1')).toBe(true);
  });

  it('cannot castle if rights are lost', () => {
    const state = parseSfen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e1', 'g1')).toBe(false);
    expect(hasMove(turns, 'e1', 'c1')).toBe(false);
  });

  it('cannot castle through check', () => {
    // Black rook on f8 attacks f1 — white cannot castle kingside
    const state = parseSfen('4k1r1/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e1', 'g1')).toBe(false);
    expect(hasMove(turns, 'e1', 'c1')).toBe(true);
  });

  it('cannot castle out of check', () => {
    // Black rook on e8 gives check to white king on e1
    const state = parseSfen('4r3/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e1', 'g1')).toBe(false);
    expect(hasMove(turns, 'e1', 'c1')).toBe(false);
  });

  it('cannot castle into check', () => {
    // Black rook on g8 attacks g1 — white cannot castle kingside
    // Black rook on g8 attacks g1, so white cannot castle kingside
    const state2 = parseSfen('6r1/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQ/-/0,0/-/0/1');
    const turns = legalTurns(state2);
    expect(hasMove(turns, 'e1', 'g1')).toBe(false);
    expect(hasMove(turns, 'e1', 'c1')).toBe(true);
  });

  it('rook moves correctly after castling', () => {
    const state = parseSfen('r3k2r/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const after = applyTurn(state, mv('e1', 'g1'));
    expect(after.board[sq('g1')]?.slot).toBe('K');
    expect(after.board[sq('f1')]?.slot).toBe('R');
    expect(after.board[sq('e1')]).toBeNull();
    expect(after.board[sq('h1')]).toBeNull();
  });

  it('castling rights lost after king move', () => {
    const state = parseSfen('r3k2r/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const after = applyTurn(state, mv('e1', 'f1'));
    expect(after.castlingRights).not.toContain('K');
    expect(after.castlingRights).not.toContain('Q');
  });

  it('black can castle both sides in a game', () => {
    const state = parseSfen('r3k2r/8/8/8/8/8/8/4K3/b/Crown,Crown/kq/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e8', 'g8')).toBe(true);
    expect(hasMove(turns, 'e8', 'c8')).toBe(true);
    const after = applyTurn(state, mv('e8', 'c8'));
    expect(after.board[sq('c8')]?.slot).toBe('K');
    expect(after.board[sq('d8')]?.slot).toBe('R');
  });
});

// ---------------------------------------------------------------------------
// En passant
// ---------------------------------------------------------------------------
describe('en passant', () => {
  it('capture available exactly one turn', () => {
    // White pawn on e5 can capture black pawn that just pushed to d5
    const state = parseSfen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR/w/Crown,Crown/KQkq/d6/0,0/-/0/3');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e5', 'd6')).toBe(true);

    // After white plays something else, ep is gone
    const after = applyTurn(state, mv('a2', 'a3'));
    // Black's turn now — ep shouldn't bleed through
    expect(after.enPassantTarget).toBeNull();
    // Ensure ep still gone next white turn
    const after2 = applyTurnUnchecked(after, { primary: { type: 'standard', from: sq('a7'), to: sq('a6') } });
    const turns3 = legalTurns(after2);
    expect(hasMove(turns3, 'e5', 'd6')).toBe(false);
  });

  it('en passant removes the captured pawn', () => {
    const state = parseSfen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR/w/Crown,Crown/KQkq/d6/0,0/-/0/3');
    const after = applyTurn(state, mv('e5', 'd6'));
    expect(after.board[sq('d6')]?.color).toBe('W');
    expect(after.board[sq('d5')]).toBeNull(); // captured pawn removed
    expect(after.board[sq('e5')]).toBeNull();
  });

  it('double push sets ep target', () => {
    const state = initialState('Crown', 'Crown');
    const after = applyTurn(state, mv('e2', 'e4'));
    expect(after.enPassantTarget).toBe(sq('e3'));
  });

  it('ep target cleared after one turn', () => {
    const state = initialState('Crown', 'Crown');
    const s1 = applyTurn(state, mv('e2', 'e4'));
    const s2 = applyTurn(s1, mv('d7', 'd5'));
    expect(s2.enPassantTarget).toBe(sq('d6'));
    const s3 = applyTurn(s2, mv('a2', 'a3'));
    expect(s3.enPassantTarget).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stalemate = loss
// ---------------------------------------------------------------------------
describe('stalemate is a loss', () => {
  it('classic stalemate position → win for the other side', () => {
    // White queen on f7 (covers g8 diag, g7 rank, h7 rank). Black king on h8, stalemated.
    // White king at a1 (below midline) — only Q-slot piece is past rank 5, no invasion trigger.
    const state = parseSfen('7k/5Q2/8/8/8/8/8/K7/b/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('stalemate-loss');
      expect(status.winner).toBe('W');
    }
  });
});

// ---------------------------------------------------------------------------
// Invasion
// ---------------------------------------------------------------------------
describe('midline invasion', () => {
  it('white king on rank 5 not in check = immediate win', () => {
    // White king on e5 (rank 4 in 0-indexed = rank 5), not in check
    const state = parseSfen('8/8/8/4K3/8/8/8/7k/b/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('W');
    }
  });

  it('white king on rank 5 in check = not invasion win (would be illegal move anyway)', () => {
    // White king on e5 attacked by black rook on e8 — king would be in check, not an invasion win
    const state = parseSfen('4r3/8/8/4K3/8/8/8/7k/b/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(state);
    expect(status.type).not.toBe('win');
  });

  it('rank-5 square attacked by enemy is unreachable', () => {
    // Black rook on e8 attacks all e-file. White king cannot legally move to e5.
    const state = parseSfen('4r3/8/8/8/8/4K3/8/7k/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e3', 'e5')).toBe(false);
  });

  it('black king on rank 4 not in check = immediate win for black', () => {
    // Black king on e4 (rank 3 in 0-indexed = rank 4)
    const state = parseSfen('8/8/8/8/4k3/8/8/7K/w/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('invasion');
      expect(status.winner).toBe('B');
    }
  });
});

// ---------------------------------------------------------------------------
// Checkmate
// ---------------------------------------------------------------------------
describe('checkmate', () => {
  it('lone king checkmated by queen + king', () => {
    // Black king at a8, White Queen at a1 checks via a-file. White Rook at b1 covers b7, b8.
    // a7 covered by Queen (a-file). White king at h1 (below midline). Classic back-rank mate.
    const state = parseSfen('k7/8/8/8/8/8/8/QR5K/b/Crown,Crown/-/-/0,0/-/0/1');
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }
  });
});

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------
describe('draws', () => {
  it('threefold repetition via positionKey history', () => {
    // Inject a state where the current position key is already in positionKeys twice
    // Then play a null-cycle move to make it appear a third time
    const base = initialState('Crown', 'Crown');
    // Oscillate knights: Ng1-f3, Nf3-g1
    let state = base;
    for (let i = 0; i < 2; i++) {
      state = applyTurn(state, mv('g1', 'f3'));
      state = applyTurn(state, mv('g8', 'f6'));
      state = applyTurn(state, mv('f3', 'g1'));
      state = applyTurn(state, mv('f6', 'g8'));
    }
    // Position returned to initial 2 times, positionKeys has it twice
    // Now make one more round to trigger the third
    state = applyTurn(state, mv('g1', 'f3'));
    state = applyTurn(state, mv('g8', 'f6'));
    state = applyTurn(state, mv('f3', 'g1'));
    state = applyTurn(state, mv('f6', 'g8'));
    const status = gameStatus(state);
    expect(status.type).toBe('draw');
    if (status.type === 'draw') expect(status.by).toBe('threefold');
  });

  it('fifty-move rule via halfmoveClock injection', () => {
    // Set halfmoveClock to 99, make a quiet move → clock hits 100
    const base = parseSfen('4k3/8/8/8/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/99/1');
    const state = applyTurn(base, mv('e1', 'f1'));
    const status = gameStatus(state);
    expect(status.type).toBe('draw');
    if (status.type === 'draw') expect(status.by).toBe('fifty-move');
  });
});

// ---------------------------------------------------------------------------
// Royal Abundance (promotion slot counts)
// ---------------------------------------------------------------------------
describe('Royal Abundance', () => {
  it('can promote to Q with one already on board', () => {
    // White pawn on e7 (clear path to e8), black king on h8, white queen on h1
    const state = parseSfen('7k/4P3/8/8/8/8/8/4K2Q/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e7', 'e8', 'Q')).toBe(true);
  });

  it('cannot promote to third rook when two are on board', () => {
    // Two white rooks on board, white pawn on e7, black king on h8
    const state = parseSfen('7k/4P3/8/8/8/8/8/4K1RR/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e7', 'e8', 'R')).toBe(false);
    expect(hasMove(turns, 'e7', 'e8', 'Q')).toBe(true);
  });

  it('can promote to rook when only one is on board', () => {
    // One white rook on board, white pawn on e7, black king on h8
    const state = parseSfen('7k/4P3/8/8/8/8/8/4K2R/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    expect(hasMove(turns, 'e7', 'e8', 'R')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scripted Crown vs Crown game ending in checkmate via applyTurn only
// ---------------------------------------------------------------------------
describe('scripted game: Scholar\'s Mate', () => {
  it('plays to checkmate through applyTurn', () => {
    let state = initialState('Crown', 'Crown');
    state = applyTurn(state, mv('e2', 'e4'));
    state = applyTurn(state, mv('e7', 'e5'));
    state = applyTurn(state, mv('f1', 'c4'));
    state = applyTurn(state, mv('b8', 'c6'));
    state = applyTurn(state, mv('d1', 'h5'));
    state = applyTurn(state, mv('a7', 'a6'));
    state = applyTurn(state, mv('h5', 'f7'));
    const status = gameStatus(state);
    expect(status.type).toBe('win');
    if (status.type === 'win') {
      expect(status.by).toBe('checkmate');
      expect(status.winner).toBe('W');
    }
  });
});
