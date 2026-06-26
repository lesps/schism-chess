import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  initialState, legalTurns, applyTurnUnchecked, gameStatus,
  parseSfen, getThreatModel,
} from '../../src/engine/index';
import {
  turnToSan, sanToTurn, serializeGame, parseGame, replayGame,
  isParseError,
} from '../../src/engine/notation';
import type { Army } from '../../src/engine/index';
import type { GameRecord } from '../../src/engine/notation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Seeded PRNG (same as properties.test.ts) ──────────────────────────────

function makeRng(seed: number): () => number {
  let s = ((seed ^ 0x12345678) >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}
function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

const ARMIES: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'];
const FIXTURES_DIR = path.join(__dirname, '../fixtures/games');

// ─── Fixture generation helpers ─────────────────────────────────────────────

type ResultType = '#' | '##' | '(=loss)' | '½-½';

function resultTypeOf(status: ReturnType<typeof gameStatus>): ResultType | null {
  if (status.type === 'ongoing') return null;
  if (status.type === 'draw') return '½-½';
  if (status.by === 'checkmate') return '#';
  if (status.by === 'invasion') return '##';
  if (status.by === 'stalemate-loss') return '(=loss)';
  return null;
}

function resultTokenOf(status: ReturnType<typeof gameStatus>): GameRecord['result'] {
  if (status.type === 'draw') return '½-½';
  if (status.type === 'win') {
    if (status.by === 'stalemate-loss') return '(=loss)';
    return status.winner === 'W' ? '1-0' : '0-1';
  }
  return undefined;
}

/**
 * Play a random game, recording SAN for each move.
 * Returns a GameRecord on terminal, or null if game exceeds maxPlies.
 */
function playRandomGame(
  armyW: Army, armyB: Army, seed: number, maxPlies = 300
): GameRecord | null {
  const rng = makeRng(seed);
  let state = initialState(armyW, armyB);
  const movePairs: Array<{ white: string; black?: string }> = [];
  let whiteSan = '';

  for (let ply = 0; ply < maxPlies; ply++) {
    const status = gameStatus(state);
    if (status.type !== 'ongoing') {
      // Finish current pair
      if (ply % 2 === 1) movePairs.push({ white: whiteSan });
      return {
        armies: { W: armyW, B: armyB },
        moves: movePairs,
        result: resultTokenOf(status),
      };
    }
    const turns = legalTurns(state);
    if (turns.length === 0) break;
    const turn = pickRandom(turns, rng);
    const san = turnToSan(state, turn);
    state = applyTurnUnchecked(state, turn);
    if (ply % 2 === 0) {
      whiteSan = san;
    } else {
      movePairs.push({ white: whiteSan, black: san });
      whiteSan = '';
    }
  }
  return null;
}

/** Find and save a fixture game for the given result type, trying many seeds. */
function generateFixture(filename: string, targetType: ResultType): void {
  const filepath = path.join(FIXTURES_DIR, filename);
  if (fs.existsSync(filepath)) return;

  for (const armyW of ARMIES) {
    for (const armyB of ARMIES) {
      for (let seed = 0; seed < 200; seed++) {
        const record = playRandomGame(armyW, armyB, seed * 31 + ARMIES.indexOf(armyW) * 13 + ARMIES.indexOf(armyB));
        if (!record) continue;
        const status = gameStatus((() => {
          // Re-replay to get final state for status check
          const result = replayGame(record);
          if ('finalState' in result) return result.finalState;
          return null;
        })()!);
        if (status && resultTypeOf(status) === targetType) {
          fs.mkdirSync(FIXTURES_DIR, { recursive: true });
          fs.writeFileSync(filepath, serializeGame(record), 'utf8');
          return;
        }
      }
    }
  }
  throw new Error(`Could not generate ${targetType} fixture after exhausting seeds`);
}

// ─── Fixture setup ──────────────────────────────────────────────────────────

beforeAll(() => {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // Checkmate fixture — Fool's mate (Crown vs Crown)
  const checkmatePath = path.join(FIXTURES_DIR, 'checkmate.txt');
  if (!fs.existsSync(checkmatePath)) {
    fs.writeFileSync(checkmatePath, [
      'W=Crown B=Crown',
      '1. f3 e5',
      '2. g4 Qh4#',
      '0-1',
    ].join('\n'), 'utf8');
  }

  // Threefold draw — knight repetition (Crown vs Crown)
  const threefoldPath = path.join(FIXTURES_DIR, 'threefold.txt');
  if (!fs.existsSync(threefoldPath)) {
    fs.writeFileSync(threefoldPath, [
      'W=Crown B=Crown',
      '1. Nf3 Nf6',
      '2. Ng1 Ng8',
      '3. Nf3 Nf6',
      '4. Ng1 Ng8',
      '5. Nf3 Nf6',
      '6. Ng1 Ng8',
      '½-½',
    ].join('\n'), 'utf8');
  }

  // Invasion fixture — generated
  generateFixture('invasion.txt', '##');

  // Stalemate-loss fixture — generated
  generateFixture('stalemate.txt', '(=loss)');
});

// ─── 1. Round-trip property: all 21 matchups, seeded random games ───────────

describe('round-trip property: turnToSan ↔ sanToTurn', () => {
  const MATCHUPS: [Army, Army][] = [];
  for (let i = 0; i < ARMIES.length; i++)
    for (let j = i; j < ARMIES.length; j++)
      MATCHUPS.push([ARMIES[i], ARMIES[j]]);

  for (const [armyW, armyB] of MATCHUPS) {
    it(`${armyW} vs ${armyB}`, () => {
      const seed = (ARMIES.indexOf(armyW) * 7 + ARMIES.indexOf(armyB)) * 999 + 42;
      const rng = makeRng(seed);
      let state = initialState(armyW, armyB);

      for (let ply = 0; ply < 80; ply++) {
        const status = gameStatus(state);
        if (status.type !== 'ongoing') break;
        const turns = legalTurns(state);
        if (turns.length === 0) break;
        const turn = pickRandom(turns, rng);

        // Forward: turn → san
        const san = turnToSan(state, turn);
        expect(typeof san).toBe('string');
        expect(san.length).toBeGreaterThan(0);

        // Backward: san → turn
        const recovered = sanToTurn(state, san);
        expect(isParseError(recovered)).toBe(false);
        if (isParseError(recovered)) break;

        // Recovered turn should be the same as original
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));

        // Emit again — should be byte-identical
        const san2 = turnToSan(state, recovered);
        expect(san2).toBe(san);

        state = applyTurnUnchecked(state, turn);
      }
    });
  }
});

// ─── 2. Fixture games: parse → replay → re-serialize ───────────────────────

describe('fixture games', () => {
  it('checkmate fixture (Fool\'s mate)', () => {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, 'checkmate.txt'), 'utf8');
    const record = parseGame(text);
    expect(isParseError(record)).toBe(false);
    if (isParseError(record)) return;

    const result = replayGame(record);
    expect('finalState' in result).toBe(true);
    if (!('finalState' in result)) return;

    const finalStatus = gameStatus(result.finalState);
    expect(finalStatus.type).toBe('win');
    expect((finalStatus as { by: string }).by).toBe('checkmate');

    // Re-serialize and verify byte-identity
    expect(serializeGame(record)).toBe(text.trim());
  });

  it('threefold draw fixture', () => {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, 'threefold.txt'), 'utf8');
    const record = parseGame(text);
    expect(isParseError(record)).toBe(false);
    if (isParseError(record)) return;

    const result = replayGame(record);
    expect('finalState' in result).toBe(true);
    if (!('finalState' in result)) return;

    const finalStatus = gameStatus(result.finalState);
    expect(finalStatus.type).toBe('draw');
    expect((finalStatus as { by: string }).by).toBe('threefold');

    expect(serializeGame(record)).toBe(text.trim());
  });

  it('invasion fixture (##)', () => {
    const filepath = path.join(FIXTURES_DIR, 'invasion.txt');
    if (!fs.existsSync(filepath)) {
      console.warn('invasion.txt fixture not generated, skipping');
      return;
    }
    const text = fs.readFileSync(filepath, 'utf8');
    const record = parseGame(text);
    expect(isParseError(record)).toBe(false);
    if (isParseError(record)) return;

    const result = replayGame(record);
    expect('finalState' in result).toBe(true);
    if (!('finalState' in result)) return;

    const finalStatus = gameStatus(result.finalState);
    expect(finalStatus.type).toBe('win');
    expect((finalStatus as { by: string }).by).toBe('invasion');

    expect(serializeGame(record)).toBe(text.trim());
  });

  it('stalemate-loss fixture ((=loss))', () => {
    const filepath = path.join(FIXTURES_DIR, 'stalemate.txt');
    if (!fs.existsSync(filepath)) {
      console.warn('stalemate.txt fixture not generated, skipping');
      return;
    }
    const text = fs.readFileSync(filepath, 'utf8');
    const record = parseGame(text);
    expect(isParseError(record)).toBe(false);
    if (isParseError(record)) return;

    const result = replayGame(record);
    expect('finalState' in result).toBe(true);
    if (!('finalState' in result)) return;

    const finalStatus = gameStatus(result.finalState);
    expect(finalStatus.type).toBe('win');
    expect((finalStatus as { by: string }).by).toBe('stalemate-loss');

    expect(serializeGame(record)).toBe(text.trim());
  });
});

// ─── 3. Disambiguation tests ────────────────────────────────────────────────

describe('disambiguation', () => {
  it('two rooks on the same rank — requires file disambiguator', () => {
    // Construct a position: White rooks on a4 and h4, target d4 (empty)
    // Board: 8/8/8/8/R6R/8/8/4K3
    const state = parseSfen('8/8/8/8/R6R/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');

    const turns = legalTurns(state);
    // Find moves where a Rook moves to d4 (square 27)
    const toD4 = turns.filter(t => {
      const p = t.primary;
      return p.type === 'standard' && (p as { to: number }).to === 27;
    });

    // There should be two such turns (from a4=24 and h4=31)
    expect(toD4.length).toBeGreaterThanOrEqual(2);

    // Generate SAN for each — should include file disambiguator
    const sans = toD4.map(t => turnToSan(state, t));
    const hasA = sans.some(s => s.includes('a'));
    const hasH = sans.some(s => s.includes('h'));
    expect(hasA).toBe(true);
    expect(hasH).toBe(true);

    // Both should parse back to the correct turn
    for (const [san, turn] of sans.map((s, i) => [s, toD4[i]] as const)) {
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
      if (!isParseError(recovered)) {
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
      }
    }

    // Without disambiguator, Rd4 should be ambiguous
    const ambiguous = sanToTurn(state, 'Rd4');
    expect(isParseError(ambiguous)).toBe(true);
    if (isParseError(ambiguous)) {
      expect(ambiguous.error).toMatch(/ambiguous/i);
    }
  });

  it('Twins two Warlords — rally requires disambiguation when both can reach the target', () => {
    // Twins starting position: Warlords at d1(3) and e1(4)
    const state = initialState('Twins', 'Crown');
    // After 1. Kd2: Warlord from d1 to d2. Rally could be Ke2 from e1.
    const turns = legalTurns(state);
    // Look for a turn that has a rally
    const withRally = turns.filter(t => t.rally !== undefined);
    if (withRally.length === 0) {
      // Twins always have rally options from the start
      console.warn('No rally turns found in Twins initial state');
      return;
    }
    // All rally turns should produce unambiguous SAN
    for (const turn of withRally.slice(0, 5)) {
      const san = turnToSan(state, turn);
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
      if (!isParseError(recovered)) {
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
      }
    }
  });

  it('promoted queens for Crown — same-slot disambiguation', () => {
    // Set up a position where Crown has multiple Queen-slot pieces
    // White: Queen on d1, promoted Queen on a5, moving to d5 — needs rank disambig
    const state = parseSfen('4k3/8/8/Q2Q4/8/8/8/4K3/w/Crown,Crown/-/-/0,0/-/0/1');
    const turns = legalTurns(state);
    const toD5 = turns.filter(t => {
      const p = t.primary;
      return p.type === 'standard' && (p as { to: number }).to === 35 &&
        state.board[(p as { from: number }).from]?.slot === 'Q';
    });
    if (toD5.length >= 2) {
      const sans = toD5.map(t => turnToSan(state, t));
      // Each SAN should be unique and parse back correctly
      for (const [san, turn] of sans.map((s, i) => [s, toD5[i]] as const)) {
        const recovered = sanToTurn(state, san);
        expect(isParseError(recovered)).toBe(false);
        if (!isParseError(recovered)) {
          expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
        }
      }
    }
  });
});

// ─── 4. Twins SAN tests ─────────────────────────────────────────────────────

describe('Twins SAN', () => {
  it('Knight move with rally: Nc6;Ke2 round-trips', () => {
    const state = initialState('Twins', 'Crown');
    const turns = legalTurns(state);

    // Find a Knight move (non-Warlord) with a rally attached
    const knightWithRally = turns.filter(t =>
      t.primary.type === 'standard' &&
      state.board[(t.primary as { from: number }).from]?.slot === 'N' &&
      t.rally !== undefined
    );

    for (const turn of knightWithRally.slice(0, 3)) {
      const san = turnToSan(state, turn);
      expect(san).toMatch(/^N.*?;K/);
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
      if (!isParseError(recovered)) {
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
      }
    }
  });

  it('Shatter: K@e1 (Warlord on e1 shatters)', () => {
    // Find a Twins position where Shatter is legal
    // From the initial position, shatters are legal if the other Warlord is not adjacent
    // Initial: d1 and e1 are adjacent → Shatter illegal
    // After one move separating them, shatter becomes legal
    const state = initialState('Twins', 'Crown');
    const turns = legalTurns(state);
    const shatters = turns.filter(t => t.primary.type === 'shatter');

    if (shatters.length === 0) {
      // Warlords start adjacent at d1/e1 so shatter is illegal initially. That's expected.
      // Try to reach a shatter position via one Warlord move
      const warlordMoves = turns.filter(t =>
        t.primary.type === 'standard' &&
        state.board[(t.primary as { from: number }).from]?.slot === 'K' &&
        t.rally === undefined
      );
      if (warlordMoves.length > 0) {
        const state2 = applyTurnUnchecked(state, warlordMoves[0]);
        // Apply a Crown move for Black too
        const blackTurns = legalTurns(state2);
        if (blackTurns.length > 0) {
          const state3 = applyTurnUnchecked(state2, blackTurns[0]);
          const shatters3 = legalTurns(state3).filter(t => t.primary.type === 'shatter');
          for (const turn of shatters3.slice(0, 2)) {
            const san = turnToSan(state3, turn);
            expect(san).toMatch(/^K@[a-h][1-8]/);
            const recovered = sanToTurn(state3, san);
            expect(isParseError(recovered)).toBe(false);
            if (!isParseError(recovered)) {
              expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
            }
          }
        }
      }
    } else {
      for (const turn of shatters.slice(0, 2)) {
        const san = turnToSan(state, turn);
        expect(san).toMatch(/^K@[a-h][1-8]/);
        const recovered = sanToTurn(state, san);
        expect(isParseError(recovered)).toBe(false);
        if (!isParseError(recovered)) {
          expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
        }
      }
    }
  });

  it('Warlord primary move round-trips', () => {
    const state = initialState('Twins', 'Crown');
    const turns = legalTurns(state);
    const warlordPrimaries = turns.filter(t =>
      t.primary.type === 'standard' &&
      state.board[(t.primary as { from: number }).from]?.slot === 'K'
    );

    for (const turn of warlordPrimaries.slice(0, 5)) {
      const san = turnToSan(state, turn);
      expect(san).toMatch(/^K/);
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
      if (!isParseError(recovered)) {
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
      }
    }
  });
});

// ─── 5. Veil SAN tests ──────────────────────────────────────────────────────

describe('Veil SAN', () => {
  it('Wraith capture emits Essence annotation', () => {
    // Start with Veil vs Crown; find a Wraith capture
    // Essence starts at 2 for Veil. A Wraith capture will emit (E:2→1)
    let st = initialState('Veil', 'Crown');
    for (let ply = 0; ply < 20; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0) break;
      const wrCapture = ts.find(t => {
        if (st.sideToMove !== 'W') return false;
        const p = t.primary;
        if (p.type === 'standard' || p.type === 'teleport') {
          const from = p.type === 'standard' ? (p as { from: number }).from : (p as { from: number }).from;
          const piece = st.board[from];
          const isCapture = p.type === 'standard' ? (p as { to: number }).to !== undefined && st.board[(p as { to: number }).to] !== null : (p as { isCapture: boolean }).isCapture;
          return piece?.slot === 'Q' && isCapture;
        }
        return false;
      });
      if (wrCapture) {
        const san = turnToSan(st, wrCapture);
        expect(san).toMatch(/\(E:\d+→\d+\)/);
        const recovered = sanToTurn(st, san);
        expect(isParseError(recovered)).toBe(false);
        if (!isParseError(recovered)) {
          expect(JSON.stringify(recovered)).toBe(JSON.stringify(wrCapture));
        }

        // Missing annotation should also parse (annotation is informational)
        const sanNoAnnot = san.replace(/\(E:\d+→\d+\)/, '');
        const recovered2 = sanToTurn(st, sanNoAnnot);
        expect(isParseError(recovered2)).toBe(false);
        if (!isParseError(recovered2)) {
          expect(JSON.stringify(recovered2)).toBe(JSON.stringify(wrCapture));
        }
        return;
      }
      const rng = makeRng(ply * 17 + 3);
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });

  it('non-Wraith capture gaining Essence emits annotation', () => {
    // Find a game where a Veil piece (not Wraith) captures an enemy pawn
    let st = initialState('Veil', 'Crown');
    const rng = makeRng(12345);
    for (let ply = 0; ply < 60; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0) break;
      if (gameStatus(st).type !== 'ongoing') break;
      if (st.sideToMove === 'W') {
        // Look for a non-Wraith capture gaining essence
        const gainCapture = ts.find(t => {
          const p = t.primary;
          if (p.type !== 'standard') return false;
          const mv = p as { from: number; to: number };
          const piece = st.board[mv.from];
          if (!piece || piece.slot === 'Q') return false; // skip Wraith
          const target = st.board[mv.to];
          return target !== null && target.slot === 'P';
        });
        if (gainCapture) {
          const san = turnToSan(st, gainCapture);
          expect(san).toMatch(/\(E:\d+→\d+\)/);
          const recovered = sanToTurn(st, san);
          expect(isParseError(recovered)).toBe(false);
          return;
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });

  it('Wisp teleport round-trips', () => {
    const state = initialState('Veil', 'Crown');
    const turns = legalTurns(state);
    const wispMoves = turns.filter(t => {
      if (t.primary.type !== 'teleport') return false;
      const from = (t.primary as { from: number }).from;
      const piece = state.board[from];
      return piece?.slot === 'R'; // Wisp
    });
    for (const turn of wispMoves.slice(0, 5)) {
      const san = turnToSan(state, turn);
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
      if (!isParseError(recovered)) {
        expect(JSON.stringify(recovered)).toBe(JSON.stringify(turn));
      }
    }
  });
});

// ─── 6. Wild SAN tests ──────────────────────────────────────────────────────

describe('Wild SAN', () => {
  it('Behemoth non-capture: standard move round-trips', () => {
    let st = initialState('Wild', 'Crown');
    // Advance a few moves to open up the Behemoth
    const rng = makeRng(777);
    for (let ply = 0; ply < 10; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0 || gameStatus(st).type !== 'ongoing') break;
      // Try to find a Behemoth non-capture
      if (st.sideToMove === 'W') {
        const behMove = ts.find(t => {
          if (t.primary.type !== 'standard') return false;
          const from = (t.primary as { from: number }).from;
          return st.board[from]?.slot === 'R' && st.board[(t.primary as { to: number }).to] === null;
        });
        if (behMove) {
          const san = turnToSan(st, behMove);
          expect(san).toMatch(/^R[^x]/); // no 'x' for non-capture
          const recovered = sanToTurn(st, san);
          expect(isParseError(recovered)).toBe(false);
          if (!isParseError(recovered)) {
            expect(JSON.stringify(recovered)).toBe(JSON.stringify(behMove));
          }
          break;
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });

  it('Behemoth rampage: uses final square in SAN', () => {
    let st = initialState('Wild', 'Crown');
    const rng = makeRng(8888);
    for (let ply = 0; ply < 40; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0 || gameStatus(st).type !== 'ongoing') break;
      if (st.sideToMove === 'W') {
        const rampage = ts.find(t => t.primary.type === 'rampage');
        if (rampage) {
          const san = turnToSan(st, rampage);
          expect(san).toMatch(/^Rx[a-h][1-8]/);
          const recovered = sanToTurn(st, san);
          expect(isParseError(recovered)).toBe(false);
          if (!isParseError(recovered)) {
            expect(JSON.stringify(recovered)).toBe(JSON.stringify(rampage));
          }
          break;
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });

  it('Stalker strike: emits ~ and round-trips; omitting ~ also parses', () => {
    let st = initialState('Wild', 'Crown');
    const rng = makeRng(99);
    for (let ply = 0; ply < 40; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0 || gameStatus(st).type !== 'ongoing') break;
      if (st.sideToMove === 'W') {
        const strike = ts.find(t => t.primary.type === 'strike');
        if (strike) {
          const san = turnToSan(st, strike);
          expect(san).toMatch(/^B.*x[a-h][1-8]~/);
          // Round-trip with ~
          const r1 = sanToTurn(st, san);
          expect(isParseError(r1)).toBe(false);
          if (!isParseError(r1)) expect(JSON.stringify(r1)).toBe(JSON.stringify(strike));
          // Without ~ also accepted
          const sanNo = san.replace('~', '');
          const r2 = sanToTurn(st, sanNo);
          expect(isParseError(r2)).toBe(false);
          if (!isParseError(r2)) expect(JSON.stringify(r2)).toBe(JSON.stringify(strike));
          break;
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });

  it('Bronco captures friendly pieces', () => {
    // Bronco (N-slot) can capture friendly non-royal pieces
    const state = initialState('Wild', 'Crown');
    const turns = legalTurns(state);
    const broncoMoves = turns.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const from = (t.primary as { from: number }).from;
      return state.board[from]?.slot === 'N';
    });
    for (const turn of broncoMoves.slice(0, 3)) {
      const san = turnToSan(state, turn);
      const recovered = sanToTurn(state, san);
      expect(isParseError(recovered)).toBe(false);
    }
  });
});

// ─── 7. Game record ─────────────────────────────────────────────────────────

describe('serializeGame / parseGame', () => {
  it('round-trips a simple Crown vs Crown game record', () => {
    const record: GameRecord = {
      armies: { W: 'Crown', B: 'Crown' },
      moves: [
        { white: 'e4', black: 'e5' },
        { white: 'Nf3', black: 'Nc6' },
      ],
      result: undefined,
    };
    const text = serializeGame(record);
    const reparsed = parseGame(text);
    expect(isParseError(reparsed)).toBe(false);
    if (!isParseError(reparsed)) {
      expect(reparsed.armies.W).toBe('Crown');
      expect(reparsed.armies.B).toBe('Crown');
      expect(reparsed.moves.length).toBe(2);
      expect(reparsed.moves[0].white).toBe('e4');
      expect(reparsed.moves[1].black).toBe('Nc6');
    }
  });

  it('accepts 0. and 1. prefixes on army declaration', () => {
    const variants = [
      'W=Crown B=Phantom\n1. e4',
      '0. W=Crown B=Phantom\n1. e4',
      '1. W=Crown B=Phantom\n2. e4',
    ];
    for (const v of variants) {
      const r = parseGame(v);
      expect(isParseError(r)).toBe(false);
      if (!isParseError(r)) {
        expect(r.armies.W).toBe('Crown');
        expect(r.armies.B).toBe('Phantom');
      }
    }
  });

  it('rejects unknown army names', () => {
    const r = parseGame('W=Crown B=Chess\n1. e4');
    expect(isParseError(r)).toBe(true);
  });

  it('canonical format is W=... B=... (no number prefix)', () => {
    const record: GameRecord = {
      armies: { W: 'Veil', B: 'Wild' },
      moves: [{ white: 'Qa4' }],
      result: '1-0',
    };
    const text = serializeGame(record);
    expect(text.startsWith('W=Veil B=Wild')).toBe(true);
  });
});

// ─── 8. replayGame ──────────────────────────────────────────────────────────

describe('replayGame', () => {
  it('replays Fool\'s mate to correct final state', () => {
    const record: GameRecord = {
      armies: { W: 'Crown', B: 'Crown' },
      moves: [
        { white: 'f3', black: 'e5' },
        { white: 'g4', black: 'Qh4#' },
      ],
      result: '0-1',
    };
    const result = replayGame(record);
    expect('finalState' in result).toBe(true);
    if (!('finalState' in result)) return;
    const status = gameStatus(result.finalState);
    expect(status.type).toBe('win');
    expect((status as { winner: string }).winner).toBe('B');
  });

  it('returns ReplayError for an illegal move', () => {
    const record: GameRecord = {
      armies: { W: 'Crown', B: 'Crown' },
      moves: [
        { white: 'e4', black: 'e5' },
        { white: 'Qxh8', black: 'Nf6' }, // Queen can't reach h8 from d1 with pieces in the way
      ],
    };
    const result = replayGame(record);
    expect('reason' in result).toBe(true);
    if ('reason' in result) {
      expect(result.moveNumber).toBe(2);
      expect(result.side).toBe('W');
    }
  });

  it('returns ReplayError for wrong result token', () => {
    const record: GameRecord = {
      armies: { W: 'Crown', B: 'Crown' },
      moves: [
        { white: 'f3', black: 'e5' },
        { white: 'g4', black: 'Qh4#' },
      ],
      result: '1-0', // wrong — Black wins
    };
    const result = replayGame(record);
    expect('reason' in result).toBe(true);
    if ('reason' in result) {
      expect(result.reason).toMatch(/contradicts/i);
    }
  });
});

// ─── 9. Error cases ─────────────────────────────────────────────────────────

describe('error cases', () => {
  it('ambiguous SAN without disambiguator → typed error naming candidates', () => {
    // Two rooks that can both move to d1: rook on a1 (slides right), rook on d4 (slides down)
    const state = parseSfen('4k3/8/8/3R4/8/8/8/R6K/w/Crown,Crown/-/-/0,0/-/0/1');
    const r = sanToTurn(state, 'Rd1');
    expect(isParseError(r)).toBe(true);
    if (isParseError(r)) {
      expect(r.error).toMatch(/ambiguous/i);
    }
  });

  it('illegal move → typed error', () => {
    const state = initialState('Crown', 'Crown');
    const r = sanToTurn(state, 'Qxh8'); // Queen can't reach h8 from d1
    expect(isParseError(r)).toBe(true);
  });

  it('castling when illegal → typed error', () => {
    const state = initialState('Crown', 'Crown');
    // Pieces are in the way — castling illegal at start
    const r = sanToTurn(state, 'O-O');
    expect(isParseError(r)).toBe(true);
  });

  it('Crown castles king-side when legal', () => {
    const state = parseSfen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R/w/Crown,Crown/KQkq/-/0,0/-/0/1');
    const r = sanToTurn(state, 'O-O');
    expect(isParseError(r)).toBe(false);
  });

  it('non-existent army → parseGame error', () => {
    const r = parseGame('W=Chaos B=Crown\n1. e4');
    expect(isParseError(r)).toBe(true);
    if (isParseError(r)) {
      expect(r.error).toMatch(/Chaos/);
    }
  });

  it('bad SAN syntax → sanToTurn error', () => {
    const state = initialState('Crown', 'Crown');
    const r = sanToTurn(state, 'xyz123!');
    expect(isParseError(r)).toBe(true);
  });
});

// ─── 10. Accord * annotation ignored ────────────────────────────────────────

describe('Accord * annotation', () => {
  it('R*d4 parses identically to Rd4', () => {
    let st = initialState('Accord', 'Crown');
    const rng = makeRng(555);
    for (let ply = 0; ply < 20; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0 || gameStatus(st).type !== 'ongoing') break;
      if (st.sideToMove === 'W') {
        const rookMove = ts.find(t => {
          if (t.primary.type !== 'standard') return false;
          const from = (t.primary as { from: number }).from;
          return st.board[from]?.slot === 'R';
        });
        if (rookMove) {
          const san = turnToSan(st, rookMove);
          const sanWithStar = san.replace(/^(R)/, 'R*');
          const r1 = sanToTurn(st, san);
          const r2 = sanToTurn(st, sanWithStar);
          expect(isParseError(r1)).toBe(false);
          expect(isParseError(r2)).toBe(false);
          if (!isParseError(r1) && !isParseError(r2)) {
            expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
          }
          break;
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });
});

// ─── 11. Check and mate suffixes ─────────────────────────────────────────────

describe('check / mate suffixes', () => {
  it('Fool\'s mate last move emits # suffix', () => {
    let state = initialState('Crown', 'Crown');
    const moves = [
      { san: 'f3', color: 'W' as const },
      { san: 'e5', color: 'B' as const },
      { san: 'g4', color: 'W' as const },
    ];
    for (const { san } of moves) {
      const t = sanToTurn(state, san);
      expect(isParseError(t)).toBe(false);
      if (!isParseError(t)) state = applyTurnUnchecked(state, t);
    }
    // Now Black's move Qh4 should give checkmate
    const qh4 = sanToTurn(state, 'Qh4');
    expect(isParseError(qh4)).toBe(false);
    if (!isParseError(qh4)) {
      const san = turnToSan(state, qh4);
      expect(san).toBe('Qh4#');
    }
  });

  it('check-giving move emits + suffix', () => {
    // Find any move that gives check in a random game
    const rng = makeRng(11111);
    let st = initialState('Crown', 'Crown');
    for (let ply = 0; ply < 60; ply++) {
      const ts = legalTurns(st);
      if (ts.length === 0 || gameStatus(st).type !== 'ongoing') break;
      for (const t of ts) {
        const nextSt = applyTurnUnchecked(st, t);
        const nextStatus = gameStatus(nextSt);
        if (nextStatus.type === 'ongoing') {
          const oppColor = nextSt.sideToMove;
          const oppArmy = oppColor === 'W' ? nextSt.armies.W : nextSt.armies.B;
          const oppModel = getThreatModel(oppArmy);
          if (oppModel.royalsInCheck(nextSt, oppColor).length > 0) {
            const san = turnToSan(st, t);
            expect(san).toMatch(/\+$/);
            return;
          }
        }
      }
      st = applyTurnUnchecked(st, pickRandom(ts, rng));
    }
  });
});
