import type { Army, Color } from '../engine/types';
import type { PBMPayload } from '../pbm/types';

/**
 * Persistent game store interface — the seam for a future network addon.
 * A server transport drops in here; the UI is unchanged above this interface.
 *
 * See docs/PBM-PROTOCOL.md §8 for the server invariants.
 */
export interface Transport {
  loadGame(id: string): PBMPayload | null;
  saveGame(id: string, payload: PBMPayload): void;
  listGames(): Array<{ id: string; payload: PBMPayload }>;
  deleteGame(id: string): void;
}

/**
 * Per-game metadata stored locally.
 * - `myColor`: which side the local player controls.
 * - `commit`: committer's army + salt, kept until reveal, then cleared.
 * - `isLocal`: true for hotseat games (both colors on same device).
 */
export interface LocalGameMeta {
  myColor: Color;
  isLocal?: boolean;
  commit?: { army: Army; salt: string };
}

const GAME_PREFIX = 'schism-game-';
const META_PREFIX = 'schism-meta-';

export class LocalStorageTransport implements Transport {
  loadGame(id: string): PBMPayload | null {
    try {
      const raw = localStorage.getItem(GAME_PREFIX + id);
      if (!raw) return null;
      return JSON.parse(raw) as PBMPayload;
    } catch {
      return null;
    }
  }

  saveGame(id: string, payload: PBMPayload): void {
    localStorage.setItem(GAME_PREFIX + id, JSON.stringify(payload));
  }

  listGames(): Array<{ id: string; payload: PBMPayload }> {
    const results: Array<{ id: string; payload: PBMPayload }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(GAME_PREFIX)) continue;
      const id = key.slice(GAME_PREFIX.length);
      const payload = this.loadGame(id);
      if (payload) results.push({ id, payload });
    }
    return results;
  }

  deleteGame(id: string): void {
    localStorage.removeItem(GAME_PREFIX + id);
    localStorage.removeItem(META_PREFIX + id);
  }

  loadMeta(id: string): LocalGameMeta | null {
    try {
      const raw = localStorage.getItem(META_PREFIX + id);
      if (!raw) return null;
      return JSON.parse(raw) as LocalGameMeta;
    } catch {
      return null;
    }
  }

  saveMeta(id: string, meta: LocalGameMeta): void {
    localStorage.setItem(META_PREFIX + id, JSON.stringify(meta));
  }

  deleteMeta(id: string): void {
    localStorage.removeItem(META_PREFIX + id);
  }
}

export const transport = new LocalStorageTransport();

/** Returns true if incoming.moves is a strict extension of stored.moves. */
export function checkMonotonicGuard(stored: PBMPayload, incoming: PBMPayload): boolean {
  if (incoming.moves.length < stored.moves.length) return false;
  for (let i = 0; i < stored.moves.length; i++) {
    if (stored.moves[i] !== incoming.moves[i]) return false;
  }
  return true;
}

/** Create a degenerate play-phase payload for a local hotseat game. */
export function createLocalPayload(
  gameId: string,
  armyW: Army,
  armyB: Army,
  labelW = 'White',
  labelB = 'Black',
): PBMPayload {
  return {
    v: 1,
    gameId,
    phase: 'play',
    white: { label: labelW },
    black: { label: labelB },
    // Sentinel hash — never verified since reveal is absent
    commit: { by: 'W', hash: '0'.repeat(64) },
    armies: { W: armyW, B: armyB },
    reveal: undefined,
    moves: [],
    result: null,
  };
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export { generateId };
