import { describe, it, expect } from 'vitest';
import {
  legalTurns, applyTurn, algebraicToSquare, initialState, gameStatus,
  parseSfen, replayGame, sanToTurn, turnToSan,
} from '../../src/engine/index';
import type { GameState, Piece, Slot, Color, Army } from '../../src/engine/index';

function sq(alg: string): number { return algebraicToSquare(alg); }

type PieceSpec = { slot: Slot; color: Color; at: string };

function makeState(pieces: PieceSpec[], overrides: Partial<GameState> = {}): GameState {
  const board = new Array<Piece | null>(64).fill(null);
  for (const { slot, color, at } of pieces) board[sq(at)] = { slot, color };
  return {
    board,
    sideToMove: 'W',
    armies: { W: 'Crown', B: 'Crown' },
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

// ── Castling rights must be revoked however the corner rook disappears ──────

describe('castling rights after non-standard rook removal', () => {
  it('a Stalker strike on the h1 rook revokes White kingside castling', () => {
    const s = makeState([
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'R', color: 'W', at: 'a1' },
      { slot: 'K', color: 'B', at: 'e8' },
      { slot: 'B', color: 'B', at: 'f3' }, // Wild Stalker, 2 diagonal steps from h1
    ], { armies: { W: 'Crown', B: 'Wild' }, castlingRights: 'KQ', sideToMove: 'B' });
    const strike = legalTurns(s).find(t => t.primary.type === 'strike' && t.primary.target === sq('h1'));
    expect(strike).toBeDefined();
    const after = applyTurn(s, strike!);
    expect(after.castlingRights).toBe('Q');
  });

  it('a later rook arriving on h1 cannot castle with stale rights', () => {
    // Rook struck on h1, then the a1 rook travels to h1: O-O must not appear.
    const s = makeState([
      { slot: 'K', color: 'W', at: 'e1' },
      { slot: 'R', color: 'W', at: 'h1' },
      { slot: 'K', color: 'B', at: 'e8' },
      { slot: 'B', color: 'B', at: 'f3' },
    ], { armies: { W: 'Crown', B: 'Wild' }, castlingRights: 'K', sideToMove: 'B' });
    const strike = legalTurns(s).find(t => t.primary.type === 'strike' && t.primary.target === sq('h1'))!;
    const after = applyTurn(s, strike);
    expect(after.castlingRights).toBe('-');
  });

  it('a Shatter that removes a corner rook revokes that castling right', () => {
    const s = makeState([
      { slot: 'K', color: 'W', at: 'g7' },
      { slot: 'K', color: 'W', at: 'c3' },
      { slot: 'K', color: 'B', at: 'e8' },
      { slot: 'R', color: 'B', at: 'h8' },
      { slot: 'R', color: 'B', at: 'a8' },
    ], { armies: { W: 'Twins', B: 'Crown' }, castlingRights: 'kq' });
    const shatter = legalTurns(s).find(t =>
      t.primary.type === 'shatter' && t.primary.warlordSquare === sq('g7') && !t.rally);
    expect(shatter).toBeDefined();
    const after = applyTurn(s, shatter!);
    expect(after.board[sq('h8')]).toBeNull();
    expect(after.castlingRights).toBe('q');
  });
});

// ── Exhaustion belongs to the Stalker, not to the square ─────────────────────

describe('Stalker exhaustion does not stick to the capturer', () => {
  it('capturing an exhausted Stalker drops the exhaustion mark', () => {
    // White Wild Stalker on c4 is exhausted; Black knight captures it.
    const s = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'N', color: 'B', at: 'b6' },
    ], { armies: { W: 'Wild', B: 'Crown' }, exhausted: [sq('c4')], sideToMove: 'B' });
    const cap = legalTurns(s).find(t => t.primary.type === 'standard' && t.primary.from === sq('b6') && t.primary.to === sq('c4'))!;
    const after = applyTurn(s, cap);
    expect(after.board[sq('c4')]).toEqual({ slot: 'N', color: 'B' });
    expect(after.exhausted).toEqual([]);
  });

  it('a Wild Stalker that later stands on a stale square can still strike', () => {
    // Black Wild pawn captures the exhausted White Stalker on c1 and promotes to a Stalker.
    const s = makeState([
      { slot: 'K', color: 'W', at: 'h1' },
      { slot: 'B', color: 'W', at: 'c1' },
      { slot: 'K', color: 'B', at: 'h8' },
      { slot: 'P', color: 'B', at: 'd2' },
      { slot: 'B', color: 'B', at: 'f8' }, // Black has only one Stalker → B slot open
    ], { armies: { W: 'Wild', B: 'Wild' }, exhausted: [sq('c1')], sideToMove: 'B' });
    const promo = legalTurns(s).find(t =>
      t.primary.type === 'standard' && t.primary.from === sq('d2') && t.primary.to === sq('c1') && t.primary.promotion === 'B');
    expect(promo).toBeDefined();
    const after = applyTurn(s, promo!);
    expect(after.exhausted).toEqual([]);
  });

  it('an exhausted Stalker that stays put keeps its mark through the opponent turn', () => {
    const s = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'B', color: 'W', at: 'c4' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { armies: { W: 'Wild', B: 'Crown' }, exhausted: [sq('c4')], sideToMove: 'B' });
    const kingMove = legalTurns(s).find(t => t.primary.type === 'standard' && t.primary.from === sq('h8'))!;
    expect(applyTurn(s, kingMove).exhausted).toEqual([sq('c4')]);
  });
});

// ── Twins: en passant may resolve a single check ─────────────────────────────

describe('Twins single-check rule sees en passant', () => {
  it('capturing the checking pawn en passant is a legal answer', () => {
    // Black pawn just played d7-d5, checking the Warlord on e4. White pawn e5 takes e.p.
    const s = makeState([
      { slot: 'K', color: 'W', at: 'e4' },
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'P', color: 'W', at: 'e5' },
      { slot: 'P', color: 'B', at: 'd5' },
      { slot: 'K', color: 'B', at: 'h8' },
    ], { armies: { W: 'Twins', B: 'Crown' }, enPassantTarget: sq('d6') });
    const ep = legalTurns(s).filter(t =>
      t.primary.type === 'standard' && t.primary.from === sq('e5') && t.primary.to === sq('d6'));
    expect(ep.length).toBeGreaterThan(0);
    const after = applyTurn(s, ep.find(t => !t.rally)!);
    expect(after.board[sq('d5')]).toBeNull();
  });
});

// ── No moves after the game is over ──────────────────────────────────────────

describe('replay rejects moves after a terminal position', () => {
  it('a move appended after an invasion win is rejected', () => {
    // Invasion: White king walks e1-e2-e3-e4-e5 against a Crown that shuffles a knight.
    const armies: { W: Army; B: Army } = { W: 'Crown', B: 'Crown' };
    let state = initialState(armies.W, armies.B);
    const plies = ['e4', 'Nc6', 'Ke2', 'Nb8', 'Ke3', 'Nc6', 'Kf4', 'Nb8', 'Kf5'];
    for (const san of plies) {
      const t = sanToTurn(state, san);
      if ('error' in t) throw new Error(t.error);
      state = applyTurn(state, t);
    }
    expect(gameStatus(state)).toEqual({ type: 'win', by: 'invasion', winner: 'W' });
    // Black still has legal moves — but the game is over.
    expect(legalTurns(state).length).toBeGreaterThan(0);

    const pairs = [
      { white: 'e4', black: 'Nc6' }, { white: 'Ke2', black: 'Nb8' },
      { white: 'Ke3', black: 'Nc6' }, { white: 'Kf4', black: 'Nb8' },
      { white: 'Kf5##', black: 'Nc6' },
    ];
    const res = replayGame({ armies, moves: pairs });
    expect('moveNumber' in res).toBe(true);
    if ('moveNumber' in res) {
      expect(res.moveNumber).toBe(5);
      expect(res.side).toBe('B');
      expect(res.reason).toMatch(/game is over/i);
    }
  });

  it('a complete game still replays', () => {
    const res = replayGame({
      armies: { W: 'Crown', B: 'Crown' },
      moves: [{ white: 'f3', black: 'e6' }, { white: 'g4', black: 'Qh4#' }],
    });
    expect('finalState' in res).toBe(true);
  });
});

// ── Sanity: helpers used above produce the intended SAN ───────────────────────

describe('fixture sanity', () => {
  it('parseSfen + turnToSan round-trips an ordinary move', () => {
    const s = parseSfen('4k3/8/8/8/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');
    const t = legalTurns(s).find(t => t.primary.type === 'standard' && t.primary.to === sq('e2'))!;
    expect(turnToSan(s, t)).toBe('Ke2');
  });
});

// ── Thralls never capture en passant — not even via a homing step ────────────

describe('Thrall homing onto the en-passant square is not a capture', () => {
  it('the passed pawn survives and the SAN is a homing move', () => {
    // Black just played d7-d5 (ep target d6). White Thrall e5 homes to d6 toward the d8 king.
    const s = makeState([
      { slot: 'K', color: 'W', at: 'a1' },
      { slot: 'P', color: 'W', at: 'e5' },
      { slot: 'P', color: 'B', at: 'd5' },
      { slot: 'K', color: 'B', at: 'd8' },
    ], { armies: { W: 'Phantom', B: 'Crown' }, enPassantTarget: sq('d6') });
    const homing = legalTurns(s).find(t =>
      t.primary.type === 'standard' && t.primary.from === sq('e5') && t.primary.to === sq('d6'));
    expect(homing).toBeDefined();
    const san = turnToSan(s, homing!);
    expect(san).toMatch(/^Pd6/);
    const after = applyTurn(s, homing!);
    expect(after.board[sq('d5')]).toEqual({ slot: 'P', color: 'B' });
    expect(after.halfmoveClock).toBe(0); // still a pawn move
    expect(sanToTurn(s, san)).toEqual(homing);
  });
});
