// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transport, persistGame, isOlderPhase, createLocalPayload } from '../../src/app/transport';

beforeEach(() => localStorage.clear());

describe('persistGame', () => {
  it('stamps updatedAt and keeps existing meta fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const p = createLocalPayload('g1', 'Crown', 'Veil');
    persistGame('g1', p, { myColor: 'W', isLocal: true });
    expect(transport.loadGame('g1')).toEqual(p);
    expect(transport.loadMeta('g1')).toEqual({ myColor: 'W', isLocal: true, updatedAt: 1234 });
    persistGame('g1', { ...p, moves: ['e4'] });
    expect(transport.loadMeta('g1')).toMatchObject({ myColor: 'W', isLocal: true });
    vi.restoreAllMocks();
  });

  it('can clear the commit salt after the reveal', () => {
    const p = createLocalPayload('g2', 'Crown', 'Crown');
    persistGame('g2', p, { myColor: 'B', commit: { army: 'Crown', salt: 'ab'.repeat(16) } });
    persistGame('g2', p, { myColor: 'B', commit: undefined });
    expect(transport.loadMeta('g2')?.commit).toBeUndefined();
  });

  it('saves a spectator copy without inventing meta', () => {
    persistGame('g3', createLocalPayload('g3', 'Crown', 'Crown'));
    expect(transport.loadGame('g3')).not.toBeNull();
    expect(transport.loadMeta('g3')).toBeNull();
  });
});

describe('isOlderPhase', () => {
  it('orders commit < reveal < play < finished', () => {
    const base = createLocalPayload('g', 'Crown', 'Crown');
    expect(isOlderPhase({ ...base, phase: 'reveal' }, { ...base, phase: 'commit' })).toBe(true);
    expect(isOlderPhase({ ...base, phase: 'play' }, { ...base, phase: 'play' })).toBe(false);
    expect(isOlderPhase({ ...base, phase: 'play' }, { ...base, phase: 'finished' })).toBe(false);
  });
});
