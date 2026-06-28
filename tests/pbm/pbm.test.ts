import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createGame, respondToCommit, revealArmy, appendTurn,
  encodePayload, decodePayload, validatePayload,
} from '../../src/pbm/index';
import type { PBMPayload, Hasher } from '../../src/pbm/index';
import {
  initialState, legalTurns, applyTurnUnchecked, gameStatus,
} from '../../src/engine/index';
import {
  sanToTurn, isParseError,
} from '../../src/engine/notation';
import type { Army, Turn, GameState } from '../../src/engine/index';

// ─── Node crypto hasher ─────────────────────────────────────────────────────

const nodeHasher: Hasher = {
  async sha256(s: string): Promise<string> {
    return createHash('sha256').update(s).digest('hex');
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTurn(state: GameState, san: string): Turn {
  const result = sanToTurn(state, san);
  if (isParseError(result)) throw new Error(`Bad SAN "${san}": ${result.error}`);
  return result;
}

// Play a list of SAN strings starting from initialState(armies), returning
// the sequence of Turn objects (needed for appendTurn calls).
function sanSequenceToTurns(armies: { W: Army; B: Army }, sans: string[]): Turn[] {
  let state = initialState(armies.W, armies.B);
  return sans.map(san => {
    const t = parseTurn(state, san);
    state = applyTurnUnchecked(state, t);
    return t;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PBM: full handshake (commit → respond → reveal → play → finished)', () => {
  it('Fool\'s Mate handshake validates clean at every stage', async () => {
    const SALT = 'cafebabe'.repeat(4); // 32 hex chars
    const W_ARMY: Army = 'Crown';
    const B_ARMY: Army = 'Crown';
    const armies = { W: W_ARMY, B: B_ARMY };

    // ── 1. Alice (White / Crown) creates game ──
    let payload = await createGame('Alice', 'W', W_ARMY, SALT, nodeHasher);
    expect(payload.phase).toBe('commit');
    expect(payload.v).toBe(1);
    expect(payload.white.label).toBe('Alice');
    expect(payload.commit.by).toBe('W');
    expect(payload.commit.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.armies.W).toBeUndefined();
    expect(payload.armies.B).toBeUndefined();

    // Encode / decode round-trip at commit phase
    const encoded1 = encodePayload(payload);
    expect(typeof encoded1).toBe('string');
    const decoded1 = decodePayload(encoded1);
    expect(decoded1).toEqual(payload);

    // validatePayload at commit phase
    let vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);

    // ── 2. Bob (Black / Crown) responds ──
    payload = respondToCommit(payload, 'Bob', B_ARMY);
    expect(payload.phase).toBe('reveal');
    expect(payload.black.label).toBe('Bob');
    expect(payload.armies.B).toBe(B_ARMY);
    expect(payload.armies.W).toBeUndefined();

    const encoded2 = encodePayload(payload);
    const decoded2 = decodePayload(encoded2);
    expect(decoded2).toEqual(payload);

    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);

    // ── 3. Alice reveals her army ──
    payload = await revealArmy(payload, W_ARMY, SALT, nodeHasher);
    expect(payload.phase).toBe('play');
    expect(payload.reveal).toBeDefined();
    expect(payload.reveal!.army).toBe(W_ARMY);
    expect(payload.armies.W).toBe(W_ARMY);
    expect(payload.armies.B).toBe(B_ARMY);
    expect(payload.result).toBeNull();

    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);
    if (vr.ok) {
      expect(vr.phase).toBe('play');
      expect(vr.whoseTurn).toBe('W');
    }

    // ── 4. Play Fool's Mate: f3, e5, g4, Qh4 ──
    const turns = sanSequenceToTurns(armies, ['f3', 'e5', 'g4', 'Qh4']);

    payload = appendTurn(payload, turns[0]); // White: f3
    expect(payload.moves).toHaveLength(1);
    expect(payload.result).toBeNull();
    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);

    payload = appendTurn(payload, turns[1]); // Black: e5
    expect(payload.moves).toHaveLength(2);
    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);

    payload = appendTurn(payload, turns[2]); // White: g4
    expect(payload.moves).toHaveLength(3);
    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);

    payload = appendTurn(payload, turns[3]); // Black: Qh4# (checkmate)
    expect(payload.phase).toBe('finished');
    expect(payload.result).toBe('0-1');
    expect(payload.moves).toHaveLength(4);

    // Final validation
    vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);
    if (vr.ok) {
      expect(vr.phase).toBe('finished');
      expect(vr.state).toBeDefined();
      expect(vr.record).toBeDefined();
    }

    // Final encoded string
    const encodedFinal = encodePayload(payload);
    const decodedFinal = decodePayload(encodedFinal);
    expect(decodedFinal).toEqual(payload);
  });
});

describe('PBM: hash mismatch errors', () => {
  it('wrong salt at reveal ⇒ hash-mismatch error', async () => {
    const SALT = 'aabbccdd'.repeat(4);
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');

    // Wrong salt
    await expect(
      revealArmy(payload, 'Crown', 'deadbeef'.repeat(4), nodeHasher)
    ).rejects.toThrow();
  });

  it('wrong army at reveal ⇒ hash-mismatch error', async () => {
    const SALT = '12345678'.repeat(4);
    let payload = await createGame('Alice', 'W', 'Phantom', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');

    await expect(
      revealArmy(payload, 'Crown', SALT, nodeHasher)
    ).rejects.toThrow();
  });

  it('validatePayload with tampered reveal.salt ⇒ hash-mismatch', async () => {
    const SALT = 'abcdef12'.repeat(4);
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    // Tamper with the reveal salt
    const tampered: PBMPayload = {
      ...payload,
      reveal: { army: 'Crown', salt: '00000000'.repeat(4) },
    };
    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('hash-mismatch');
  });

  it('validatePayload with tampered reveal.army ⇒ hash-mismatch', async () => {
    const SALT = 'fedcba98'.repeat(4);
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Phantom');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    // Tamper: reveal army changed, armies.W changed, but hash still from original
    const tampered: PBMPayload = {
      ...payload,
      reveal: { army: 'Phantom', salt: SALT },
      armies: { ...payload.armies, W: 'Phantom' },
    };
    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('hash-mismatch');
  });
});

describe('PBM: tampered move list ⇒ replay error at right move', () => {
  it('edited SAN mid-history gives replay error with move number', async () => {
    const SALT = '11223344'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['e4', 'e5', 'Nf3']);
    payload = appendTurn(payload, turns[0]); // e4
    payload = appendTurn(payload, turns[1]); // e5
    payload = appendTurn(payload, turns[2]); // Nf3

    // Tamper: replace move 2 (index 1, Black's e5) with Qh4, which is blocked by
    // the e7 pawn (queen at d8 cannot reach h4 through the diagonal).
    const tampered: PBMPayload = {
      ...payload,
      moves: [payload.moves[0], 'Qh4', payload.moves[2]],
    };

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) {
      expect(vr.error.type).toBe('replay');
      if (vr.error.type === 'replay') {
        // The illegal move is at ply 2 → move pair 1 → side B
        expect(vr.error.moveNumber).toBe(1);
        expect(vr.error.side).toBe('B');
      }
    }
  });

  it('completely invalid SAN gives replay error', async () => {
    const SALT = '55667788'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['e4']);
    payload = appendTurn(payload, turns[0]);

    const tampered: PBMPayload = {
      ...payload,
      moves: ['NOTVALIDSANXYZ'],
    };

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('replay');
  });
});

describe('PBM: forged result ⇒ result-mismatch error', () => {
  it('setting result on an ongoing game ⇒ result-mismatch', async () => {
    const SALT = '99aabbcc'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['e4', 'e5']);
    payload = appendTurn(payload, turns[0]);
    payload = appendTurn(payload, turns[1]);

    // Forge a result on an ongoing game
    const tampered: PBMPayload = { ...payload, result: '1-0' };

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('result-mismatch');
  });

  it('null result on a finished game ⇒ result-mismatch', async () => {
    const SALT = 'ddeeff00'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['f3', 'e5', 'g4', 'Qh4']);
    for (const t of turns) payload = appendTurn(payload, t);

    expect(payload.result).toBe('0-1');

    // Forge null result
    const tampered: PBMPayload = { ...payload, result: null };

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('result-mismatch');
  });

  it('wrong winner on a finished game ⇒ result-mismatch', async () => {
    const SALT = '11223344'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['f3', 'e5', 'g4', 'Qh4']);
    for (const t of turns) payload = appendTurn(payload, t);

    const tampered: PBMPayload = { ...payload, result: '1-0' }; // White didn't win

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('result-mismatch');
  });
});

describe('PBM: unknown version ⇒ newer-client error', () => {
  it('version 2 payload gives newer-client error', async () => {
    const fakePayload = { v: 2, gameId: 'abc', phase: 'play' };
    const vr = await validatePayload(fakePayload, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('newer-client');
  });

  it('schema error on missing version', async () => {
    const vr = await validatePayload({ gameId: 'abc' }, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('schema');
  });

  it('decodePayload of garbage string returns error', () => {
    const result = decodePayload('totally-not-a-valid-payload-string-at-all');
    expect('error' in result).toBe(true);
  });
});

describe('PBM: encode/decode round-trip', () => {
  it('encode→decode is identity for commit-phase payload', async () => {
    const payload = await createGame('Player1', 'W', 'Veil', 'aabbccdd'.repeat(4), nodeHasher);
    const encoded = encodePayload(payload);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    // Must not contain characters that require percent-encoding in a URL path
    expect(encoded).not.toMatch(/[<>#%{}|\\^[\]`\s]/);
    const decoded = decodePayload(encoded);
    expect(decoded).toEqual(payload);
  });

  it('encode→decode is identity for play-phase payload with moves', async () => {
    const SALT = 'cafef00d'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    const turns = sanSequenceToTurns(armies, ['e4', 'e5', 'Nf3', 'Nc6', 'd4']);
    for (const t of turns) payload = appendTurn(payload, t);

    const encoded = encodePayload(payload);
    const decoded = decodePayload(encoded);
    expect(decoded).toEqual(payload);
  });

  it('60-move game stays under 6KB encoded (records actual size)', async () => {
    const SALT = 'deadc0de'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('White', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Black', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    // Play up to 60 plies (30 full moves) using a seeded approach
    let state = initialState(armies.W, armies.B);
    let plies = 0;
    const MAX_PLIES = 60;

    while (plies < MAX_PLIES) {
      const moves = legalTurns(state);
      if (moves.length === 0) break;
      const status = gameStatus(state);
      if (status.type !== 'ongoing') break;

      // Pick first legal move (deterministic)
      const turn = moves[Math.floor(moves.length / 2)];
      state = applyTurnUnchecked(state, turn);

      payload = appendTurn(payload, turn);
      plies++;

      if (payload.phase === 'finished') break;
    }

    const encoded = encodePayload(payload);
    const bytes = encoded.length; // URL-safe chars ≈ bytes
    console.log(`60-ply game encoded size: ${bytes} chars (${plies} plies)`);
    expect(bytes).toBeLessThan(6144); // < 6 KB
  });

  it('decodePayload returns error for garbage input', () => {
    const result = decodePayload('not-valid-lz-string-garbage!!!');
    expect('error' in result).toBe(true);
  });
});

describe('PBM: commit binding', () => {
  it('mutating armies.B after reveal invalidates the game via replay', async () => {
    const SALT = '87654321'.repeat(4);
    const armies = { W: 'Crown' as Army, B: 'Crown' as Army };
    let payload = await createGame('Alice', 'W', 'Crown', SALT, nodeHasher);
    payload = respondToCommit(payload, 'Bob', 'Crown');
    payload = await revealArmy(payload, 'Crown', SALT, nodeHasher);

    // Play some Crown moves (Black plays e5 which is legal for Crown)
    const turns = sanSequenceToTurns(armies, ['e4', 'e5', 'Nf3']);
    for (const t of turns) payload = appendTurn(payload, t);

    // After Nf3, Black is to move. Mutate armies.B to Twins which has no Q-slot piece,
    // making re-parsing of 'e5' (a pawn push) still valid — but the initial position
    // layout differs. The Twins initialState differs, so replay from the beginning
    // with different armies will hit a parse error on moves that only make sense
    // for Crown (e.g., standard piece locations differ).
    // Use Veil instead: Veil Wraith (Q) starts at d8, same as Crown queen.
    // Use Wild: Behemoth is R-slot, but Apex (Q-slot) starts at d8.
    // Let's use Phantom — Shade (Q-slot) at d8, different piece behavior.
    // The move 'e5' is a pawn move, valid for both. But 'Nf3' for White requires
    // a Knight on g1, which Crown has. After mutating B to Phantom, the replay
    // starts from Phantom's initial position (which also has Knights).
    // Actually the positions are the same! The difference is behavior not layout.
    // So pawn/knight moves are still valid in Phantom.
    // Let's force a Queen move from Black to make it fail.
    // Instead: play Qd6 (Crown queen can do that) and then tamper armies to Twins
    // (which has no Q-slot piece, so the move is invalid in Twins context).

    // Start fresh: play a Queen move for Black
    let p2 = await createGame('A', 'W', 'Crown', SALT, nodeHasher);
    p2 = respondToCommit(p2, 'B', 'Crown');
    p2 = await revealArmy(p2, 'Crown', SALT, nodeHasher);

    const turns2 = sanSequenceToTurns(armies, ['e4', 'd6', 'Nf3', 'Qd7']);
    for (const t of turns2) p2 = appendTurn(p2, t);

    // Tamper: mutate B army to Twins (no Q-slot piece)
    const tampered: PBMPayload = {
      ...p2,
      armies: { ...p2.armies, B: 'Twins' },
    };

    const vr = await validatePayload(tampered, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) {
      // Either replay fails (illegal move) or it could be schema valid but replay error
      expect(['replay', 'schema']).toContain(vr.error.type);
    }
  });
});

describe('PBM: creator plays Black', () => {
  it('Black committer flow works correctly', async () => {
    const SALT = 'aabbccdd'.repeat(4);

    // Alice creates as Black
    let payload = await createGame('Alice', 'B', 'Phantom', SALT, nodeHasher);
    expect(payload.phase).toBe('commit');
    expect(payload.commit.by).toBe('B');
    expect(payload.black.label).toBe('Alice');
    expect(payload.white.label).toBe('');

    // Bob responds as White
    payload = respondToCommit(payload, 'Bob', 'Crown');
    expect(payload.phase).toBe('reveal');
    expect(payload.white.label).toBe('Bob');
    expect(payload.armies.W).toBe('Crown');
    expect(payload.armies.B).toBeUndefined();

    // Alice reveals
    payload = await revealArmy(payload, 'Phantom', SALT, nodeHasher);
    expect(payload.phase).toBe('play');
    expect(payload.armies.B).toBe('Phantom');
    expect(payload.armies.W).toBe('Crown');

    const vr = await validatePayload(payload, nodeHasher);
    expect(vr.ok).toBe(true);
  });
});

describe('PBM: schema validation', () => {
  it('null input gives schema error', async () => {
    const vr = await validatePayload(null, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('schema');
  });

  it('array input gives schema error', async () => {
    const vr = await validatePayload([], nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('schema');
  });

  it('missing required fields gives schema error', async () => {
    const vr = await validatePayload({ v: 1 }, nodeHasher);
    expect(vr.ok).toBe(false);
    if (!vr.ok) expect(vr.error.type).toBe('schema');
  });
});
