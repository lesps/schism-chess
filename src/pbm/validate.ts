import { gameStatus } from '../engine/index';
import { replayGame } from '../engine/notation';
import type { Army, Color, GameState } from '../engine/index';
import type { GameRecord } from '../engine/notation';
import type { Hasher, PBMPayload, PayloadResult, ValidationResult } from './types';
import { checkSchema } from './codec';

// ─── Internal helpers ───────────────────────────────────────────────────────

// Convert a flat per-ply SAN array to GameRecord.moves pairs.
function flatToMovePairs(flat: readonly string[]): GameRecord['moves'] {
  const pairs: Array<{ white: string; black?: string }> = [];
  for (let i = 0; i < flat.length; i += 2) {
    pairs.push({ white: flat[i], black: flat[i + 1] });
  }
  return pairs;
}

// Map engine GameStatus to payload result string.
export function statusToPayloadResult(
  status: ReturnType<typeof gameStatus>,
): PayloadResult | null {
  if (status.type === 'ongoing') return null;
  if (status.type === 'draw') return '1/2-1/2';
  return status.winner === 'W' ? '1-0' : '0-1';
}

// ─── validatePayload ────────────────────────────────────────────────────────

export async function validatePayload(
  raw: unknown,
  hasher: Hasher,
): Promise<ValidationResult> {
  // 1. Version check (before full schema so we can give the right error type)
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)['v'];
    if (typeof v === 'number' && v !== 1) {
      return {
        ok: false,
        error: { type: 'newer-client', message: `Payload version ${v} requires a newer client (this client supports v1)` },
      };
    }
  }

  // 2. Schema check
  const schemaResult = checkSchema(raw);
  if ('error' in schemaResult) {
    return { ok: false, error: { type: 'schema', message: schemaResult.error } };
  }
  const payload: PBMPayload = schemaResult;

  // 3. Hash verification (only if reveal is present)
  if (payload.reveal) {
    const expected = await hasher.sha256(`${payload.reveal.army}:${payload.reveal.salt}`);
    if (expected !== payload.commit.hash) {
      return {
        ok: false,
        error: { type: 'hash-mismatch', message: 'Commitment hash does not match the revealed army and salt' },
      };
    }
    // Also verify reveal.army matches the committer's slot in armies
    if (payload.reveal.army !== payload.armies[payload.commit.by]) {
      return {
        ok: false,
        error: { type: 'hash-mismatch', message: `reveal.army (${payload.reveal.army}) does not match armies.${payload.commit.by}` },
      };
    }
  }

  // 4. Move replay (requires both armies)
  const wArmy = payload.armies.W;
  const bArmy = payload.armies.B;

  if (wArmy === undefined || bArmy === undefined) {
    // Can't replay yet — return partial success
    return {
      ok: true,
      phase: payload.phase,
      state: undefined,
      record: undefined,
      whoseTurn: 'W',
    };
  }

  const movePairs = flatToMovePairs(payload.moves);
  const record: GameRecord = { armies: { W: wArmy as Army, B: bArmy as Army }, moves: movePairs };

  const replayResult = replayGame(record);
  if ('moveNumber' in replayResult) {
    return {
      ok: false,
      error: {
        type: 'replay',
        moveNumber: replayResult.moveNumber,
        side: replayResult.side,
        san: replayResult.san,
        reason: replayResult.reason,
      },
    };
  }

  const finalState: GameState = replayResult.finalState;

  // 5. Result consistency
  const actualResult = statusToPayloadResult(gameStatus(finalState));
  if (payload.result !== actualResult) {
    return {
      ok: false,
      error: {
        type: 'result-mismatch',
        message: `Payload result '${payload.result}' does not match actual game outcome '${actualResult}'`,
      },
    };
  }

  return {
    ok: true,
    phase: payload.phase,
    state: finalState,
    record,
    whoseTurn: finalState.sideToMove as Color,
  };
}
