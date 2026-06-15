import { describe, it, expect } from 'vitest';
import { initialState, legalTurns, applyTurnUnchecked } from '../../src/engine/index';
import type { GameState } from '../../src/engine/index';

// Import side-effecting registrations
import '../../src/engine/threat';
import '../../src/engine/movegen';

function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  const turns = legalTurns(state);
  if (depth === 1) return turns.length;
  let count = 0;
  for (const turn of turns) {
    count += perft(applyTurnUnchecked(state, turn), depth - 1);
  }
  return count;
}

describe('perft — Crown vs Crown (FIDE starting position)', () => {
  const start = initialState('Crown', 'Crown');

  it('depth 1 = 20', () => {
    expect(perft(start, 1)).toBe(20);
  });

  it('depth 2 = 400', () => {
    expect(perft(start, 2)).toBe(400);
  });

  it('depth 3 = 8902', () => {
    expect(perft(start, 3)).toBe(8902);
  });
});
