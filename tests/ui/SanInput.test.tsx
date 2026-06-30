// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';

afterEach(cleanup);
import { SanInput } from '../../src/ui/components/SanInput';
import { initialState } from '../../src/engine';

describe('SanInput', () => {
  function makeState() {
    // Standard starting position (Crown vs Crown)
    return initialState('Crown', 'Crown');
  }

  it('renders input with correct placeholder', () => {
    const state = makeState();
    render(<SanInput gameState={state} onSubmit={() => {}} />);
    const input = screen.getByTestId('san-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Type a move (e.g. Nf3)');
  });

  it('plays a valid SAN move on Enter', async () => {
    const state = makeState();
    const onSubmit = vi.fn();
    render(<SanInput gameState={state} onSubmit={onSubmit} />);
    const input = screen.getByTestId('san-input');
    await userEvent.type(input, 'e4');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Input should be cleared after submit
    expect(input).toHaveValue('');
  });

  it('shows an error for invalid SAN', async () => {
    const state = makeState();
    const onSubmit = vi.fn();
    render(<SanInput gameState={state} onSubmit={onSubmit} />);
    const input = screen.getByTestId('san-input');
    await userEvent.type(input, 'Nf9');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    // Error message appears
    const errorEl = screen.getByTestId('san-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent?.length).toBeGreaterThan(0);
  });

  it('clears error when user starts typing again', async () => {
    const state = makeState();
    render(<SanInput gameState={state} onSubmit={() => {}} />);
    const input = screen.getByTestId('san-input');
    await userEvent.type(input, 'Nf9');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('san-error')).toBeInTheDocument();
    // Start typing a new move
    await userEvent.type(input, 'e');
    expect(screen.queryByTestId('san-error')).not.toBeInTheDocument();
  });

  it('clears on Escape', async () => {
    const state = makeState();
    render(<SanInput gameState={state} onSubmit={() => {}} />);
    const input = screen.getByTestId('san-input');
    await userEvent.type(input, 'e4');
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('is disabled when disabled prop is set', () => {
    const state = makeState();
    render(<SanInput gameState={state} onSubmit={() => {}} disabled />);
    expect(screen.getByTestId('san-input')).toBeDisabled();
  });

  it('does not call onSubmit for empty input on Enter', async () => {
    const state = makeState();
    const onSubmit = vi.fn();
    render(<SanInput gameState={state} onSubmit={onSubmit} />);
    const input = screen.getByTestId('san-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('has aria-label for accessibility', () => {
    const state = makeState();
    render(<SanInput gameState={state} onSubmit={() => {}} />);
    expect(screen.getByLabelText(/SAN move input/i)).toBeInTheDocument();
  });
});
