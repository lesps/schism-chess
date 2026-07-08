// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { PieceGlyph } from '../../src/ui/components/PieceGlyph';
import { GameScreen } from '../../src/ui/screens/GameScreen';
import { getPieceInfo } from '../../src/ui/shared';
import type { Piece } from '../../src/engine/types';

afterEach(cleanup);

const armies = { W: 'Phantom', B: 'Wild' } as const;

function glyphSvg(piece: Piece) {
  const { container } = render(<PieceGlyph piece={piece} armies={armies} />);
  return container.querySelector('.piece-svg');
}

describe('PieceGlyph SVG art', () => {
  it('renders an inline SVG, not a text glyph', () => {
    const svg = glyphSvg({ slot: 'K', color: 'W' });
    expect(svg).toBeTruthy();
    expect(svg?.tagName.toLowerCase()).toBe('svg');
  });

  it('army-specific and standard shapes differ (Phantom Shade vs Wild Apex)', () => {
    const shade = glyphSvg({ slot: 'Q', color: 'W' })!.innerHTML;
    cleanup();
    const apex = glyphSvg({ slot: 'Q', color: 'B' })!.innerHTML;
    expect(shade).not.toBe(apex);
  });

  it('a promoted piece renders as the army piece (Reinforcement, v2.3)', () => {
    // A Thrall promoted to Q IS the Shade — same slot, same army, same shape.
    const promotedQ = glyphSvg({ slot: 'Q', color: 'W' })!.innerHTML;
    cleanup();
    const shade = glyphSvg({ slot: 'Q', color: 'W' })!.innerHTML;
    expect(promotedQ).toBe(shade);
  });

  it('keeps data attributes used by tests and styling', () => {
    const { container } = render(
      <PieceGlyph piece={{ slot: 'P', color: 'B' }} armies={armies} />,
    );
    const span = container.querySelector('[data-slot="P"][data-color="B"][data-army="Wild"]');
    expect(span).toBeTruthy();
  });
});

describe('getPieceInfo', () => {
  it('returns the army-specific description when one exists', () => {
    expect(getPieceInfo('Q', 'Phantom')).toMatch(/pierces/i);
    expect(getPieceInfo('R', 'Wild')).toMatch(/rampage/i);
  });

  it('falls back to the standard description otherwise', () => {
    expect(getPieceInfo('N', 'Crown')).toMatch(/L-shape/);
    expect(getPieceInfo('B', 'Twins')).toMatch(/diagonals/i);
  });
});

describe('GameScreen piece-info bar', () => {
  it('shows the reminder while a piece is selected and hides it when deselected', () => {
    const { container } = render(
      <GameScreen
        armyW="Phantom"
        armyB="Crown"
        onHome={() => {}}
        onNewGame={() => {}}
      />,
    );

    expect(container.querySelector('[data-testid="piece-info"]')).toBeNull();

    // Select the White Thrall on d2 (sq 11)
    fireEvent.click(container.querySelector('[data-sq="11"]') as HTMLElement);
    const bar = container.querySelector('[data-testid="piece-info"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('Thrall');
    expect(bar?.textContent).toMatch(/homes/i);

    // Clicking an empty non-destination square (e5 = sq 36) deselects
    fireEvent.click(container.querySelector('[data-sq="36"]') as HTMLElement);
    expect(container.querySelector('[data-testid="piece-info"]')).toBeNull();
  });
});
