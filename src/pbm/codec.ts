import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { PBMPayload } from './types';

const VALID_ARMIES = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'] as const;
const VALID_PHASES = ['commit', 'reveal', 'play', 'finished'] as const;
const VALID_COLORS = ['W', 'B'] as const;
const VALID_RESULTS = ['1-0', '0-1', '1/2-1/2'] as const;

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isArmy(v: unknown): v is PBMPayload['armies'][keyof PBMPayload['armies']] {
  return isString(v) && (VALID_ARMIES as readonly string[]).includes(v);
}

// Validates and narrows a raw object to PBMPayload.
// Returns the payload or { error: string }.
export function checkSchema(raw: unknown): PBMPayload | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'Payload must be a non-null object' };
  }
  const p = raw as Record<string, unknown>;

  if (p['v'] !== 1) return { error: `Invalid or missing version field (expected 1, got ${JSON.stringify(p['v'])})` };

  if (!isString(p['gameId']) || p['gameId'].length === 0) return { error: 'Missing or invalid gameId' };

  if (!isString(p['phase']) || !(VALID_PHASES as readonly string[]).includes(p['phase'])) {
    return { error: `Invalid phase: ${JSON.stringify(p['phase'])}` };
  }

  if (typeof p['white'] !== 'object' || p['white'] === null || !isString((p['white'] as Record<string, unknown>)['label'])) {
    return { error: 'Missing or invalid white.label' };
  }

  if (typeof p['black'] !== 'object' || p['black'] === null || !isString((p['black'] as Record<string, unknown>)['label'])) {
    return { error: 'Missing or invalid black.label' };
  }

  if (typeof p['commit'] !== 'object' || p['commit'] === null) return { error: 'Missing commit' };
  const commit = p['commit'] as Record<string, unknown>;
  if (!(VALID_COLORS as readonly string[]).includes(commit['by'] as string)) return { error: 'Invalid commit.by' };
  if (!isString(commit['hash']) || !/^[0-9a-f]{64}$/.test(commit['hash'])) {
    return { error: 'commit.hash must be a 64-char hex string' };
  }

  if (typeof p['armies'] !== 'object' || p['armies'] === null) return { error: 'Missing armies' };
  const armies = p['armies'] as Record<string, unknown>;
  if (armies['W'] !== undefined && !isArmy(armies['W'])) return { error: `Invalid armies.W: ${JSON.stringify(armies['W'])}` };
  if (armies['B'] !== undefined && !isArmy(armies['B'])) return { error: `Invalid armies.B: ${JSON.stringify(armies['B'])}` };

  if (p['reveal'] !== undefined) {
    if (typeof p['reveal'] !== 'object' || p['reveal'] === null) return { error: 'Invalid reveal' };
    const rev = p['reveal'] as Record<string, unknown>;
    if (!isArmy(rev['army'])) return { error: `Invalid reveal.army: ${JSON.stringify(rev['army'])}` };
    if (!isString(rev['salt']) || !/^[0-9a-f]{32}$/.test(rev['salt'])) {
      return { error: 'reveal.salt must be a 32-char hex string' };
    }
  }

  if (!Array.isArray(p['moves']) || !p['moves'].every(isString)) {
    return { error: 'moves must be an array of strings' };
  }

  if (p['result'] !== null && !(VALID_RESULTS as readonly string[]).includes(p['result'] as string)) {
    return { error: `Invalid result: ${JSON.stringify(p['result'])}` };
  }

  return raw as PBMPayload;
}

export function encodePayload(payload: PBMPayload): string {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodePayload(s: string): PBMPayload | { error: string } {
  let raw: string | null;
  try {
    raw = decompressFromEncodedURIComponent(s);
    if (!raw) return { error: 'Decompression failed — string may be corrupted or truncated' };
  } catch {
    return { error: 'Decompression failed' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Decompressed content is not valid JSON' };
  }

  return checkSchema(parsed);
}
