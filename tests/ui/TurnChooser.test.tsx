// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TurnChooser } from '../../src/ui/components/TurnChooser';
import { legalTurns, initialState, parseSfen, algebraicToSquare } from '../../src/engine';
import type { Turn } from '../../src/engine/types';
import { getPrimaryFrom } from '../../src/ui/shared';

afterEach(cleanup);

describe('TurnChooser', () => {
  it('renders one option button per turn', () => {
    const state = initialState('Crown', 'Crown');
    const legal = legalTurns(state);
    const turns = legal.filter(t => getPrimaryFrom(t) === 12).slice(0, 2);

    const { container } = render(
      <TurnChooser
        turns={turns}
        gameState={state}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(container.querySelectorAll('[data-testid^="chooser-option-"]')).toHaveLength(turns.length);
  });

  it('calls onSelect with correct turn when option clicked', () => {
    const state = initialState('Crown', 'Crown');
    const legal = legalTurns(state);
    const turns = legal.filter(t => getPrimaryFrom(t) === 12).slice(0, 2);
    const selected: Turn[] = [];

    const { container } = render(
      <TurnChooser
        turns={turns}
        gameState={state}
        onSelect={t => selected.push(t)}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(container.querySelector('[data-testid="chooser-option-0"]') as HTMLElement);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(turns[0]);
  });

  it('calls onCancel when overlay clicked', () => {
    const state = initialState('Crown', 'Crown');
    const cancelled = vi.fn();

    const { container } = render(
      <TurnChooser
        turns={[legalTurns(state)[0]]}
        gameState={state}
        onSelect={() => {}}
        onCancel={cancelled}
      />,
    );

    fireEvent.click(container.querySelector('.chooser-overlay') as HTMLElement);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('promotion chooser: shows one option per available promotion slot', () => {
    // White pawn at e7, kings out of way — Crown vs Crown
    // SFEN: white pawn e7, white king a1, black king h8
    const sfen = '7k/4P3/8/8/8/8/8/K7/w/Crown,Crown/-/-/0,0/-/0/1';
    const state = parseSfen(sfen);
    const legal = legalTurns(state);

    const e7 = algebraicToSquare('e7');
    const e8 = algebraicToSquare('e8');
    const promoTurns = legal.filter(t => {
      const p = t.primary;
      return p.type === 'standard' && p.from === e7 && p.to === e8 && p.promotion !== undefined;
    });

    // Q, R, B, N available (Crown; no duplicate slots yet)
    expect(promoTurns.length).toBeGreaterThanOrEqual(4);

    const slots = new Set(promoTurns.map(t => {
      const p = t.primary;
      return p.type === 'standard' ? p.promotion : undefined;
    }));
    expect(slots.has('Q')).toBe(true);
    expect(slots.has('R')).toBe(true);
    expect(slots.has('B')).toBe(true);
    expect(slots.has('N')).toBe(true);

    const { container } = render(
      <TurnChooser
        turns={promoTurns}
        gameState={state}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );

    const options = container.querySelectorAll('[data-testid^="chooser-option-"]');
    expect(options.length).toBe(promoTurns.length);
    for (const opt of options) {
      expect(opt.textContent).toMatch(/promote/i);
    }
  });
});
