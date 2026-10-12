import { describe, it, expect } from 'vitest';
import {
  initialState, parseSfen, positionKey, applyTurn, gameStatus, sanToTurn, isParseError, replayGame,
} from '../../src/engine/index';
import type { GameState } from '../../src/engine/index';

// Threefold repetition follows standard (FIDE 9.2.3) counting:
//  - the starting position counts as the first occurrence;
//  - positions are the same if the same side is to move, the same pieces stand on the
//    same squares, and the possible moves are the same — so castling rights matter, and
//    the en-passant square matters only when an en-passant capture is actually legal.

function play(state: GameState, sans: string[]): GameState {
  for (const san of sans) {
    const t = sanToTurn(state, san);
    if (isParseError(t)) throw new Error(`${san}: ${t.error}`);
    state = applyTurn(state, t);
  }
  return state;
}

const CYCLE = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];

describe('the starting position counts', () => {
  it('two knight shuffles back to the start are a threefold draw', () => {
    const once = play(initialState('Crown', 'Crown'), CYCLE);
    expect(gameStatus(once)).toEqual({ type: 'ongoing' });
    const twice = play(once, CYCLE);
    expect(gameStatus(twice)).toEqual({ type: 'draw', by: 'threefold' });
  });

  it('holds for every army pairing (initialState seeds the history)', () => {
    const s = initialState('Veil', 'Wild');
    expect(s.positionKeys).toEqual([positionKey(s)]);
  });

  it('a position loaded from SFEN-X counts as its own first occurrence', () => {
    const s = parseSfen('4k3/8/8/8/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');
    expect(s.positionKeys).toEqual([positionKey(s)]);
    const back = play(s, ['Kd1', 'Kd8', 'Ke1', 'Ke8', 'Kd1', 'Kd8', 'Ke1']);
    expect(gameStatus(back)).toEqual({ type: 'ongoing' });
    expect(gameStatus(play(back, ['Ke8']))).toEqual({ type: 'draw', by: 'threefold' });
  });

  it('replayGame stops accepting moves once the start position has occurred three times', () => {
    const res = replayGame({
      armies: { W: 'Crown', B: 'Crown' },
      moves: [
        { white: 'Nf3', black: 'Nf6' }, { white: 'Ng1', black: 'Ng8' },
        { white: 'Nf3', black: 'Nf6' }, { white: 'Ng1', black: 'Ng8' },
        { white: 'Nf3' },
      ],
    });
    expect('moveNumber' in res && res.reason).toMatch(/game is over/i);
  });
});

describe('the en-passant square only counts when the capture is possible', () => {
  it('no enemy pawn beside the double-stepped pawn: same position as without the ep square', () => {
    const base = initialState('Crown', 'Crown');
    expect(positionKey({ ...base, enPassantTarget: 20 /* e3 */ })).toBe(positionKey(base));
  });

  it('an enemy pawn able to capture en passant makes it a different position', () => {
    // Black just played d7-d5; White pawn e5 can take on d6.
    const withEp = parseSfen('4k3/8/8/3pP3/8/8/8/4K3/w/Crown,Crown/-/d6/0,0/-/0/1');
    const withoutEp = parseSfen('4k3/8/8/3pP3/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');
    expect(positionKey(withEp)).not.toBe(positionKey(withoutEp));
  });

  it('a pinned pawn that cannot legally capture en passant does not count', () => {
    // White pawn e5 is pinned on the e-file by the rook e8 against the king e1:
    // exd6 e.p. would expose the king, so the capture is illegal.
    const withEp = parseSfen('4r2k/8/8/3pP3/8/8/8/4K3/w/Crown,Crown/-/d6/0,0/-/0/1');
    const withoutEp = parseSfen('4r2k/8/8/3pP3/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');
    expect(positionKey(withEp)).toBe(positionKey(withoutEp));
  });

  it('Phantom Thralls never capture en passant, so their presence does not count', () => {
    const withEp = parseSfen('4k3/8/8/3pP3/8/8/8/4K3/w/Phantom,Crown/-/d6/0,0/-/0/1');
    const withoutEp = parseSfen('4k3/8/8/3pP3/8/8/8/4K3/w/Phantom,Crown/-/-/0,0/-/0/1');
    expect(positionKey(withEp)).toBe(positionKey(withoutEp));
  });

  it('repetition is reached despite an uncapturable ep square on the first occurrence', () => {
    // 1. e4 sets ep e3 but no black pawn can take: the position after 1. e4 equals the
    // one reached again after knight shuffles.
    const s = play(initialState('Crown', 'Crown'), ['e4', 'Nf6', 'Nf3', 'Ng8', 'Ng1', 'Nf6', 'Nf3', 'Ng8', 'Ng1']);
    // Position "after 1. e4, Black to move" has now occurred three times.
    expect(gameStatus(s)).toEqual({ type: 'draw', by: 'threefold' });
  });
});

describe('castling rights still distinguish positions', () => {
  it('a king that walks out and back has a different position (rights lost)', () => {
    const start = parseSfen('r3k2r/8/8/8/8/8/8/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const back = play(start, ['Kf1', 'Kf8', 'Ke1', 'Ke8']);
    expect(positionKey(back)).not.toBe(positionKey(start));
  });
});
