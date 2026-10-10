// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GameScreen } from '../../src/ui/screens/GameScreen';
import { rebuildGame, capturedFromHistory } from '../../src/ui/gameRecord';
import { gameStatus, sanToTurn, applyTurn, isParseError } from '../../src/engine/index';
import { computeTurnAnimation, captureSquares } from '../../src/ui/shared';
import { parseSfen, legalTurns } from '../../src/engine/index';

afterEach(cleanup);

const click = (c: HTMLElement, sq: number) =>
  fireEvent.click(c.querySelector(`[data-sq="${sq}"]`) as HTMLElement);

// ── rebuildGame: resume from the move list, not a SFEN snapshot ──────────────

describe('rebuildGame', () => {
  it('restores history, captures and the repetition record', () => {
    const moves = ['e4', 'd5', 'exd5', 'Nf6', 'Nf3', 'Ng8', 'Ng1', 'Nf6', 'Nf3', 'Ng8', 'Ng1'];
    const { state, history, error } = rebuildGame('Crown', 'Crown', moves);
    expect(error).toBeUndefined();
    expect(history.map(h => h.san)).toEqual(moves);
    expect(capturedFromHistory(history).B).toEqual([{ slot: 'P', color: 'B' }]);
    // positionKeys survive (SFEN-X can't carry them): one more knight hop is a threefold draw
    expect(state.positionKeys).toHaveLength(moves.length);
    const t = sanToTurn(state, 'Nf6');
    if (isParseError(t)) throw new Error(t.error);
    expect(gameStatus(applyTurn(state, t))).toEqual({ type: 'draw', by: 'threefold' });
  });

  it('stops at the first bad SAN and reports it', () => {
    const { history, error } = rebuildGame('Crown', 'Crown', ['e4', 'Qx9']);
    expect(history).toHaveLength(1);
    expect(error).toBeTruthy();
  });
});

// ── Animation / capture helpers ───────────────────────────────────────────────

describe('computeTurnAnimation', () => {
  it('slides the king and the rook when castling', () => {
    const s = parseSfen('4k3/8/8/8/8/8/8/4K2R/w/Crown,Crown/K/-/0,0/-/0/1');
    const castle = legalTurns(s).find(t => t.primary.type === 'standard' && t.primary.from === 4 && t.primary.to === 6)!;
    const anim = computeTurnAnimation(s, castle);
    expect(anim.slides.get(6)).toBe(4);
    expect(anim.slides.get(5)).toBe(7);
  });

  it('follows a Warlord that moves and then rallies', () => {
    const s = parseSfen('7k/8/8/8/8/8/8/3KK3/w/Twins,Crown/-/-/0,0/-/0/1');
    const t = { primary: { type: 'standard' as const, from: 3, to: 11 }, rally: { from: 11, to: 19 } };
    const anim = computeTurnAnimation(s, t);
    expect(anim.slides.get(19)).toBe(3);
    expect(anim.slides.has(11)).toBe(false);
  });

  it('a Thrall homing onto the e.p. square captures nothing', () => {
    const s = parseSfen('3k4/8/8/3pP3/8/8/8/K7/w/Phantom,Crown/-/d6/0,0/-/0/1');
    const homing = legalTurns(s).find(t => t.primary.type === 'standard' && t.primary.from === 36 && t.primary.to === 43)!;
    expect(captureSquares(s, homing)).toEqual([]);
  });
});

// ── GameScreen ────────────────────────────────────────────────────────────────

describe('GameScreen resume and undo', () => {
  it('shows the move list and last move after resuming from moves', () => {
    const { container } = render(
      <GameScreen armyW="Crown" armyB="Crown" initialMoves={['e4', 'e5']} onHome={() => {}} onNewGame={() => {}} />,
    );
    const sans = [...container.querySelectorAll('.move-san')].map(e => e.textContent);
    expect(sans).toEqual(['e4', 'e5']);
    // e7 → e5 highlighted as the last move
    expect(container.querySelector('[data-sq="52"]')?.className).toMatch(/hl-last-from/);
    expect(container.querySelector('[data-sq="36"]')?.className).toMatch(/hl-last-to/);
    // No "first move" coaching once the game is under way
    expect(container.textContent).not.toMatch(/Tap or drag a piece/);
  });

  it('undo takes back the last move and tells the app', () => {
    const onUndo = vi.fn();
    const { container, getByTestId } = render(
      <GameScreen armyW="Crown" armyB="Crown" initialMoves={['e4']} onUndo={onUndo} onHome={() => {}} onNewGame={() => {}} />,
    );
    expect(container.textContent).toContain('Black to move');
    fireEvent.click(getByTestId('undo-btn'));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('White to move');
    expect(container.querySelectorAll('.move-san')).toHaveLength(0);
    expect(container.querySelector('[data-sq="12"] [data-slot="P"]')).toBeTruthy();
    expect((getByTestId('undo-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('PBM: the board faces your own color even on the opponent\'s turn', () => {
    const { container } = render(
      <GameScreen armyW="Crown" armyB="Crown" myColor="B" onHome={() => {}} onNewGame={() => {}} />,
    );
    // Flipped orientation renders h1 (sq 7) first
    expect(container.querySelector('.board-sq')?.getAttribute('data-sq')).toBe('7');
    expect(container.querySelector('[data-testid="waiting-banner"]')).toBeTruthy();
  });
});

describe('GameScreen check hints', () => {
  it('an ordinary check from a Phantom rook is not called piercing', () => {
    // Black to move; Phantom rook e1 checks e8; the Shade sits off-line on a3.
    const { container } = render(
      <GameScreen armyW="Phantom" armyB="Crown" initialSfen="4k3/8/8/8/8/Q7/8/K3R3/b/Phantom,Crown/-/-/0,0/-/0/1"
        onHome={() => {}} onNewGame={() => {}} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toMatch(/^Check!/);
    expect(status?.textContent).not.toMatch(/Piercing/);
    expect(container.querySelector('[data-testid="check-badge"]')).toBeTruthy();
  });
});

describe('Twins promotion with a Rally available', () => {
  it('asks which piece to promote to before the rally', () => {
    const { container, getByTestId } = render(
      <GameScreen armyW="Twins" armyB="Crown" initialSfen="7k/4P3/8/8/8/8/8/3KK3/w/Twins,Crown/-/-/0,0/-/0/1"
        onHome={() => {}} onNewGame={() => {}} />,
    );
    click(container, 52); // e7
    click(container, 60); // e8
    const options = container.querySelectorAll('[data-testid^="chooser-option-"]');
    expect([...options].map(o => o.textContent)).toEqual([
      expect.stringMatching(/Promote to Rook/),
      expect.stringMatching(/Promote to Bishop/),
      expect.stringMatching(/Promote to Knight/),
    ]);
    fireEvent.click(options[2]);
    // Promotion chosen → the rally phase follows
    expect(getByTestId('rally-bar')).toBeTruthy();
    fireEvent.click(getByTestId('rally-skip'));
    expect(container.querySelector('.move-san')?.textContent).toMatch(/^e8=N/);
  });
});

describe('Board keyboard play', () => {
  it('arrow keys move the focus and Enter selects and moves', () => {
    const { container } = render(
      <GameScreen armyW="Crown" armyB="Crown" onHome={() => {}} onNewGame={() => {}} />,
    );
    const board = container.querySelector('.board') as HTMLElement;
    const key = (k: string) => fireEvent.keyDown(board, { key: k });
    // Focus starts on a1 (the bottom-left square)
    expect(container.querySelector('[data-sq="0"]')?.getAttribute('tabindex')).toBe('0');
    key('ArrowUp');
    for (let i = 0; i < 4; i++) key('ArrowRight');
    key('Enter'); // select e2
    expect(container.querySelector('[data-sq="12"]')?.className).toMatch(/hl-selected/);
    key('ArrowUp'); key('ArrowUp');
    key('Enter'); // e4
    expect(container.textContent).toContain('Black to move');
    expect(container.querySelector('[data-sq="28"] [data-slot="P"]')).toBeTruthy();
  });
});
