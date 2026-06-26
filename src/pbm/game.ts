import { applyTurnUnchecked, gameStatus } from '../engine/index';
import { turnToSan, replayGame } from '../engine/notation';
import type { Army, Color, Turn } from '../engine/index';
import type { GameRecord } from '../engine/notation';
import type { Hasher, PBMPayload, Phase } from './types';
import { statusToPayloadResult } from './validate';

// ─── Internal helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function flatToMovePairs(flat: readonly string[]): GameRecord['moves'] {
  const pairs: Array<{ white: string; black?: string }> = [];
  for (let i = 0; i < flat.length; i += 2) {
    pairs.push({ white: flat[i], black: flat[i + 1] });
  }
  return pairs;
}

function assertPhase(payload: PBMPayload, expected: Phase): void {
  if (payload.phase !== expected) {
    throw new Error(`Expected phase '${expected}' but payload is in phase '${payload.phase}'`);
  }
}

// ─── Game-flow functions ─────────────────────────────────────────────────────

/**
 * Create a new game as `color` with `army`. Returns a commit-phase payload.
 * The creator commits to their army via SHA-256(army:salt); the salt must be
 * stored locally until revealArmy() is called.
 */
export async function createGame(
  creatorLabel: string,
  color: Color,
  army: Army,
  salt: string,
  hasher: Hasher,
): Promise<PBMPayload> {
  const hash = await hasher.sha256(`${army}:${salt}`);
  return {
    v: 1,
    gameId: generateId(),
    phase: 'commit',
    white: { label: color === 'W' ? creatorLabel : '' },
    black: { label: color === 'B' ? creatorLabel : '' },
    commit: { by: color, hash },
    armies: {},
    reveal: undefined,
    moves: [],
    result: null,
  };
}

/**
 * The respondent chooses their army and label. Returns a reveal-phase payload.
 * The respondent is the player who did NOT commit (opposite of commit.by).
 */
export function respondToCommit(
  payload: PBMPayload,
  respondentLabel: string,
  army: Army,
): PBMPayload {
  assertPhase(payload, 'commit');
  const respondent: Color = payload.commit.by === 'W' ? 'B' : 'W';
  return {
    ...payload,
    phase: 'reveal',
    white: respondent === 'W' ? { label: respondentLabel } : payload.white,
    black: respondent === 'B' ? { label: respondentLabel } : payload.black,
    armies: { ...payload.armies, [respondent]: army },
  };
}

/**
 * The committer reveals their army and salt, transitioning to play phase.
 * Throws if the hash does not match.
 */
export async function revealArmy(
  payload: PBMPayload,
  army: Army,
  salt: string,
  hasher: Hasher,
): Promise<PBMPayload> {
  assertPhase(payload, 'reveal');
  const expected = await hasher.sha256(`${army}:${salt}`);
  if (expected !== payload.commit.hash) {
    throw new Error('Hash mismatch: revealed army and salt do not match the commitment');
  }
  return {
    ...payload,
    phase: 'play',
    armies: { ...payload.armies, [payload.commit.by]: army },
    reveal: { army, salt },
  };
}

/**
 * Append one turn to a play-phase payload. Replays existing moves to obtain
 * the current state, converts the turn to SAN, and appends it. Transitions
 * to 'finished' and sets result when the game is over.
 * Throws if the payload is not in play phase or if replay fails.
 */
export function appendTurn(payload: PBMPayload, turn: Turn): PBMPayload {
  assertPhase(payload, 'play');

  const wArmy = payload.armies.W;
  const bArmy = payload.armies.B;
  if (!wArmy || !bArmy) throw new Error('Both armies must be set before appending turns');

  // Replay existing moves to get current state
  const record: GameRecord = {
    armies: { W: wArmy, B: bArmy },
    moves: flatToMovePairs(payload.moves),
  };
  const replayResult = replayGame(record);
  if ('moveNumber' in replayResult) {
    throw new Error(`Replay failed at move ${replayResult.moveNumber}: ${replayResult.reason}`);
  }

  const currentState = replayResult.finalState;

  // Convert turn to SAN and append
  const san = turnToSan(currentState, turn);
  const newMoves = [...payload.moves, san];

  // Apply turn to get next state
  const nextState = applyTurnUnchecked(currentState, turn);
  const status = gameStatus(nextState);
  const payloadResult = statusToPayloadResult(status);

  return {
    ...payload,
    moves: newMoves,
    result: payloadResult,
    phase: payloadResult !== null ? 'finished' : 'play',
  };
}
