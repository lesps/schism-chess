// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GameScreen } from '../../src/ui/screens/GameScreen';

afterEach(cleanup);

function renderGame(armyW: 'Crown' | 'Phantom' = 'Crown', armyB: 'Crown' | 'Phantom' = 'Crown') {
  return render(
    <GameScreen
      armyW={armyW}
      armyB={armyB}
      onHome={() => {}}
      onNewGame={() => {}}
      onRules={() => {}}
    />,
  );
}

// Square indices: rank * 8 + file. a1=0, d1=3, e7=52, a8=56.

describe('tap-to-inspect', () => {
  it('shows the info bar for an own piece with no legal moves', () => {
    const { container } = renderGame();
    // White rook on a1 (sq 0) has no legal moves at the start
    fireEvent.click(container.querySelector('[data-sq="0"]') as HTMLElement);
    const bar = container.querySelector('[data-testid="piece-info"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('Rook');
    expect(bar?.textContent).toMatch(/no legal moves/i);
  });

  it('shows the info bar for an opponent piece with a waiting note', () => {
    const { container } = renderGame();
    // Black pawn on e7 (sq 52) — White to move
    fireEvent.click(container.querySelector('[data-sq="52"]') as HTMLElement);
    const bar = container.querySelector('[data-testid="piece-info"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('Pawn');
    expect(bar?.textContent).toMatch(/isn't this piece's turn/i);
  });

  it('tapping the selected piece again deselects it', () => {
    const { container } = renderGame();
    fireEvent.click(container.querySelector('[data-sq="0"]') as HTMLElement);
    expect(container.querySelector('[data-testid="piece-info"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-sq="0"]') as HTMLElement);
    expect(container.querySelector('[data-testid="piece-info"]')).toBeNull();
  });

  it('does not show destination dots for a piece with no moves', () => {
    const { container } = renderGame();
    fireEvent.click(container.querySelector('[data-sq="0"]') as HTMLElement);
    expect(container.querySelectorAll('.hl-move, .hl-capture').length).toBe(0);
  });
});

describe('Shade Ghostwalk in the UI', () => {
  it('selected Shade shows move dots beyond its own pawn wall', () => {
    const { container } = renderGame('Phantom', 'Crown');
    // White Shade on d1 (sq 3); with Ghostwalk, d4 (sq 27) is reachable
    fireEvent.click(container.querySelector('[data-sq="3"]') as HTMLElement);
    const d4 = container.querySelector('[data-sq="27"]');
    expect(d4?.className).toMatch(/hl-move/);
    // d2 (own Thrall, sq 11) is not a destination
    const d2 = container.querySelector('[data-sq="11"]');
    expect(d2?.className).not.toMatch(/hl-move|hl-capture/);
  });
});

describe('army info sheet', () => {
  it('opens from the header button, lists both armies, and closes', () => {
    const { container } = renderGame('Phantom', 'Crown');
    expect(container.querySelector('[data-testid="army-info-sheet"]')).toBeNull();

    fireEvent.click(container.querySelector('[data-testid="army-info-btn"]') as HTMLElement);
    const sheet = container.querySelector('[data-testid="army-info-sheet"]');
    expect(sheet).toBeTruthy();
    expect(sheet?.textContent).toContain('The Phantom');
    expect(sheet?.textContent).toContain('The Crown');
    // Identity blurbs are present
    expect(sheet?.textContent).toMatch(/Ghostwalks through pieces|relentless hunter/i);
    expect(sheet?.textContent).toMatch(/benchmark army/i);
    // Win-condition reminder
    expect(sheet?.textContent).toMatch(/midline/i);

    fireEvent.click(container.querySelector('[data-testid="army-info-close"]') as HTMLElement);
    expect(container.querySelector('[data-testid="army-info-sheet"]')).toBeNull();
  });
});
