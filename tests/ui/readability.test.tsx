// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GameScreen } from '../../src/ui/screens/GameScreen';

afterEach(cleanup);

const noop = () => {};
const sqEl = (c: HTMLElement, sq: number) => c.querySelector(`[data-sq="${sq}"]`) as HTMLElement;

describe('piece info panel', () => {
  it('a selected Wraith explains its Essence and the board markers', () => {
    const { container, getByTestId } = render(
      <GameScreen armyW="Veil" armyB="Crown" initialSfen="7k/4r3/8/8/2Q5/8/8/K7/w/Veil,Crown/-/-/2,0/-/0/1"
        onHome={noop} onNewGame={noop} />,
    );
    fireEvent.click(sqEl(container, 26)); // c4
    const panel = getByTestId('piece-info');
    expect(panel.textContent).toContain('Wraith');
    expect(getByTestId('piece-notes').textContent).toMatch(/Essence 2\/4/);
    const legend = getByTestId('move-legend').textContent ?? '';
    expect(legend).toMatch(/Move/);
    expect(legend).toMatch(/Teleport capture/);
  });

  it('an Accord knight names the moves it borrows in Concord', () => {
    const { container, getByTestId } = render(
      <GameScreen armyW="Accord" armyB="Crown" initialSfen="7k/8/8/3RN3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1"
        onHome={noop} onNewGame={noop} />,
    );
    fireEvent.click(sqEl(container, 36)); // e5 knight
    expect(getByTestId('piece-notes').textContent).toMatch(/also moves as a Rook/);
  });

  it('hovering a piece with the mouse shows what it does, without selecting it', () => {
    const { container, getByTestId, queryByTestId } = render(
      <GameScreen armyW="Wild" armyB="Crown" onHome={noop} onNewGame={noop} />,
    );
    fireEvent.pointerEnter(sqEl(container, 0)); // a1 Behemoth
    expect(getByTestId('piece-info').textContent).toContain('Behemoth');
    expect(getByTestId('piece-info').className).toMatch(/piece-info-hover/);
    expect(queryByTestId('move-legend')).toBeNull();
    expect(sqEl(container, 0).className).not.toMatch(/hl-selected/);
    fireEvent.pointerLeave(container.querySelector('.board') as HTMLElement);
    expect(queryByTestId('piece-info')).toBeNull();
  });
});

describe('army sheet roster', () => {
  it('lists every piece of both armies with what it does', () => {
    const { getByTestId } = render(
      <GameScreen armyW="Twins" armyB="Wild" onHome={noop} onNewGame={noop} />,
    );
    fireEvent.click(getByTestId('army-info-btn'));
    const white = getByTestId('army-roster-W').textContent ?? '';
    const black = getByTestId('army-roster-B').textContent ?? '';
    expect(white).toMatch(/Warlord.*Rally/);
    expect(white).not.toMatch(/Queen/);
    for (const name of ['Apex', 'Behemoth', 'Stalker', 'Bronco']) expect(black).toContain(name);
  });
});
