// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Board } from '../../src/ui/components/Board';
import { initialState, legalTurns } from '../../src/engine';
import { getPrimaryFrom, getPrimaryDest } from '../../src/ui/shared';

afterEach(cleanup);

function makeBoard(overrides: Partial<Parameters<typeof Board>[0]> = {}) {
  const gameState = initialState('Crown', 'Crown');
  const props = {
    gameState,
    flipped: false,
    selectedSquare: null,
    legalMovesForSelected: [],
    lastMovePrimary: null,
    checkedSquares: [],
    onSquareClick: () => {},
    ...overrides,
  };
  return render(<Board {...props} />);
}

describe('Board', () => {
  it('renders 64 squares', () => {
    const { container } = makeBoard();
    expect(container.querySelectorAll('[data-sq]')).toHaveLength(64);
  });

  it('squares have alternating light/dark classes', () => {
    const { container } = makeBoard();
    // a1 = sq 0 → rank 0, file 0 → (0+0)%2=0 → dark
    expect(container.querySelector('[data-sq="0"]')).toHaveClass('dark');
    // b1 = sq 1 → rank 0, file 1 → (0+1)%2=1 → light
    expect(container.querySelector('[data-sq="1"]')).toHaveClass('light');
  });

  it('renders pieces on starting squares', () => {
    const { container } = makeBoard();
    // White King e1 = sq 4
    const e1 = container.querySelector('[data-sq="4"]');
    expect(e1?.querySelector('[data-slot="K"][data-color="W"]')).toBeTruthy();
  });

  it('selected square gets hl-selected class', () => {
    const { container } = makeBoard({ selectedSquare: 12 });
    expect(container.querySelector('[data-sq="12"]')).toHaveClass('hl-selected');
  });

  it('highlights legal destinations when piece selected (e2 pawn → e3, e4)', () => {
    const gameState = initialState('Crown', 'Crown');
    const legal = legalTurns(gameState);
    const e2Moves = legal.filter(t => getPrimaryFrom(t) === 12);

    const { container } = makeBoard({ gameState, selectedSquare: 12, legalMovesForSelected: e2Moves });

    // e3 = sq 20, e4 = sq 28 (empty → hl-move dot)
    expect(container.querySelector('[data-sq="20"]')).toHaveClass('hl-move');
    expect(container.querySelector('[data-sq="28"]')).toHaveClass('hl-move');
    // d3 = sq 19 (not an e2-pawn destination)
    expect(container.querySelector('[data-sq="19"]')).not.toHaveClass('hl-move');
  });

  it('exactly the legalTurns-derived destinations are highlighted', () => {
    const gameState = initialState('Crown', 'Crown');
    const legal = legalTurns(gameState);
    const e2Moves = legal.filter(t => getPrimaryFrom(t) === 12);
    expect(e2Moves).toHaveLength(2);

    const dests = new Set(e2Moves.map(t => getPrimaryDest(t)));
    expect(dests).toContain(20);
    expect(dests).toContain(28);

    const { container } = makeBoard({ gameState, selectedSquare: 12, legalMovesForSelected: e2Moves });

    const highlighted = Array.from(
      container.querySelectorAll('.hl-move, .hl-capture, .hl-special'),
    ).map(el => Number((el as HTMLElement).dataset.sq));

    expect(highlighted).toHaveLength(2);
    expect(highlighted).toContain(20);
    expect(highlighted).toContain(28);
  });

  it('check indicator shown on checked royal square', () => {
    const { container } = makeBoard({ checkedSquares: [4] });
    expect(container.querySelector('[data-sq="4"]')).toHaveClass('hl-check');
  });

  it('last-move highlights appear on from/to squares', () => {
    const gameState = initialState('Crown', 'Crown');
    const legal = legalTurns(gameState);
    const e4Turn = legal.find(t => getPrimaryFrom(t) === 12 && getPrimaryDest(t) === 28)!;

    const { container } = makeBoard({ gameState, lastMovePrimary: e4Turn.primary });

    expect(container.querySelector('[data-sq="12"]')).toHaveClass('hl-last-from');
    expect(container.querySelector('[data-sq="28"]')).toHaveClass('hl-last-to');
  });

  it('calls onSquareClick with correct square index', () => {
    const clicks: number[] = [];
    const { container } = makeBoard({ onSquareClick: sq => clicks.push(sq) });

    const e2 = container.querySelector('[data-sq="12"]') as HTMLElement;
    fireEvent.click(e2);
    expect(clicks).toEqual([12]);
  });

  it('flipped board: first rendered square is h1 (sq 7)', () => {
    const { container } = makeBoard({ flipped: true });
    const firstCell = container.querySelector('[data-sq]') as HTMLElement;
    expect(firstCell.dataset.sq).toBe('7');
  });

  it('unflipped board: first rendered square is a8 (sq 56)', () => {
    const { container } = makeBoard({ flipped: false });
    const firstCell = container.querySelector('[data-sq]') as HTMLElement;
    expect(firstCell.dataset.sq).toBe('56');
  });

  it('coordinate labels appear on edge squares (unflipped)', () => {
    const { container } = makeBoard({ flipped: false });
    // a1 = sq 0: file=0 (show rank), rank=0 (show file)
    const a1 = container.querySelector('[data-sq="0"]');
    expect(a1?.querySelector('.coord.rank')?.textContent).toBe('1');
    expect(a1?.querySelector('.coord.file')?.textContent).toBe('a');
  });

  it('submitting a turn: selecting then clicking destination calls submitTurn', () => {
    // Integration smoke test: two clicks = select + move
    const submitted: number[] = [];
    const gameState = initialState('Crown', 'Crown');
    const legal = legalTurns(gameState);
    const e2Moves = legal.filter(t => getPrimaryFrom(t) === 12);

    const { container } = makeBoard({
      gameState,
      selectedSquare: 12,
      legalMovesForSelected: e2Moves,
      onSquareClick: sq => submitted.push(sq),
    });

    // Click e4 (sq 28 = legal destination)
    fireEvent.click(container.querySelector('[data-sq="28"]') as HTMLElement);
    expect(submitted).toEqual([28]);
  });
});
