import { describe, expect, it } from 'vitest';
import { parseSfen, legalTurns, algebraicToSquare } from '../../src/engine/index';
import type { GameState } from '../../src/engine/index';
import { pieceNotes, moveLegend, armyRoster } from '../../src/ui/pieceGuide';

const sq = algebraicToSquare;
const movesFrom = (s: GameState, from: string) =>
  legalTurns(s).filter(t => ('from' in t.primary ? t.primary.from : t.primary.warlordSquare) === sq(from));

describe('pieceNotes — live notes about the piece in this position', () => {
  it('Wraith: shows its Essence and whether it can bite', () => {
    const fed = parseSfen('4k3/8/8/8/8/8/8/3QK3/w/Veil,Crown/-/-/2,0/-/0/1');
    expect(pieceNotes(fed, sq('d1')).join(' ')).toMatch(/Essence 2\/4/);
    const starved = parseSfen('4k3/8/8/8/8/8/8/3QK3/w/Veil,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(starved, sq('d1')).join(' ')).toMatch(/Essence 0\/4.*can’t capture or give check/);
  });

  it('Veil minor pieces: capturing pawns feeds the Wraith', () => {
    const s = parseSfen('4k3/8/8/8/8/8/8/3QKN2/w/Veil,Crown/-/-/2,0/-/0/1');
    expect(pieceNotes(s, sq('f1')).join(' ')).toMatch(/\+1 Essence/);
  });

  it('Accord: names the moves a piece borrows in Concord', () => {
    // Herald d4, Rook d5, Knight e5 share the Banner
    const s = parseSfen('7k/8/8/3RN3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(s, sq('e5')).join(' ')).toMatch(/In Concord — also moves as a Rook/);
    expect(pieceNotes(s, sq('d5')).join(' ')).toMatch(/also moves as a Knight/);
  });

  it('Accord: a lone piece in the Banner gains nothing; a dead Herald means no Concord', () => {
    const alone = parseSfen('7k/8/8/4N3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(alone, sq('e5')).join(' ')).toMatch(/alone/);
    const noHerald = parseSfen('7k/8/8/4N3/8/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(noHerald, sq('e5')).join(' ')).toMatch(/Herald has fallen/);
  });

  it('Herald: says how many pieces are in Concord and when it can March', () => {
    const s = parseSfen('7k/8/8/3RN3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1');
    const notes = pieceNotes(s, sq('d4'), movesFrom(s, 'd4')).join(' ');
    expect(notes).toMatch(/2 pieces in Concord/);
    expect(notes).toMatch(/March/);
  });

  it('Stalker: exhausted', () => {
    const s = parseSfen('7k/8/5r2/8/3B4/8/8/K7/w/Wild,Crown/-/-/0,0/d4/0/1');
    expect(pieceNotes(s, sq('d4')).join(' ')).toMatch(/Exhausted/);
  });

  it('Pawns near the end name what they can promote into (army pieces, open slots only)', () => {
    // Veil pawn on c6; one Wisp, one Bishop and one Knight lost, Wraith alive.
    const s = parseSfen('4k3/8/2P5/8/8/8/8/R2QKBN1/w/Veil,Crown/-/-/2,0/-/0/1');
    const promo = pieceNotes(s, sq('c6')).find(n => /promote/i.test(n));
    expect(promo).toBe('On the last rank it can promote to a Wisp, Bishop or Knight.');
  });

  it('Twins pawns never promote to a Queen-type piece', () => {
    const s = parseSfen('7k/2P5/8/8/8/8/8/3KK3/w/Twins,Crown/-/-/0,0/-/0/1');
    const notes = pieceNotes(s, sq('c7')).join(' ');
    expect(notes).toMatch(/Rook, Bishop or Knight/);
  });

  it('a pawn with no open slot is called out as blocked', () => {
    const s = parseSfen('4k3/2P5/8/8/8/8/8/RNBQKBNR/w/Wild,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(s, sq('c7')).join(' ')).toMatch(/Blocked/);
  });

  it('Shade giving piercing check, and a royal in check', () => {
    const s = parseSfen('4k3/8/4Q3/8/8/8/8/K7/b/Phantom,Crown/-/-/0,0/-/0/1');
    expect(pieceNotes(s, sq('e6')).join(' ')).toMatch(/piercing check/i);
    expect(pieceNotes(s, sq('e8')).join(' ')).toMatch(/In check/);
  });
});

describe('moveLegend — what the markers on the board mean for this piece', () => {
  it('Wraith: move, teleport and teleport capture', () => {
    const s = parseSfen('7k/4r3/8/8/2Q5/8/8/K7/w/Veil,Crown/-/-/2,0/-/0/1');
    const labels = moveLegend(s, movesFrom(s, 'c4')).map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Move', 'Teleport', 'Teleport capture']));
  });

  it('Behemoth rampage and Thrall homing get their own names', () => {
    const wild = parseSfen('7k/8/8/8/3Rrr2/8/8/K7/w/Wild,Crown/-/-/0,0/-/0/1');
    expect(moveLegend(wild, movesFrom(wild, 'd4')).map(i => i.label)).toContain('Rampage');
    const ph = parseSfen('3k4/8/8/8/8/4P3/8/K7/w/Phantom,Crown/-/-/0,0/-/0/1');
    expect(moveLegend(ph, movesFrom(ph, 'e3')).map(i => i.label)).toContain('Homing step');
  });
});

describe('armyRoster', () => {
  it('lists every piece type an army fields', () => {
    expect(armyRoster('Twins')).toEqual(['K', 'R', 'B', 'N', 'P']);
    expect(armyRoster('Veil')).toEqual(['K', 'Q', 'R', 'B', 'N', 'P']);
  });
});
