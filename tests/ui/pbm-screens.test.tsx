// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { ImportErrorDisplay } from '../../src/ui/screens/ImportScreen';
import { ConflictScreen } from '../../src/ui/screens/ConflictScreen';
import { SaltMissingScreen } from '../../src/ui/screens/SaltMissingScreen';
import type { ValidationError } from '../../src/pbm/types';
import type { PBMPayload } from '../../src/pbm/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<PBMPayload> = {}): PBMPayload {
  return {
    v: 1,
    gameId: 'test-game-id',
    phase: 'play',
    white: { label: 'Alice' },
    black: { label: 'Bob' },
    commit: { by: 'W', hash: '0'.repeat(64) },
    armies: { W: 'Crown', B: 'Crown' },
    reveal: undefined,
    moves: [],
    result: null,
    ...overrides,
  };
}

// ─── ImportErrorDisplay ───────────────────────────────────────────────────────

describe('ImportErrorDisplay', () => {
  it('renders newer-client error', () => {
    const err: ValidationError = {
      type: 'newer-client',
      message: 'Payload version 2 requires a newer client',
    };
    render(<ImportErrorDisplay error={err} />);
    expect(screen.getByTestId('import-error')).toBeTruthy();
    expect(screen.getByText(/newer version/i)).toBeTruthy();
  });

  it('renders schema error', () => {
    const err: ValidationError = {
      type: 'schema',
      message: 'Missing gameId',
    };
    render(<ImportErrorDisplay error={err} />);
    expect(screen.getByText(/Missing gameId/)).toBeTruthy();
  });

  it('renders hash-mismatch error', () => {
    const err: ValidationError = {
      type: 'hash-mismatch',
      message: 'hash does not match',
    };
    render(<ImportErrorDisplay error={err} />);
    expect(screen.getByText(/Tamper detected/i)).toBeTruthy();
  });

  it('renders replay error with move number and san', () => {
    const err: ValidationError = {
      type: 'replay',
      moveNumber: 3,
      side: 'B',
      san: 'Qh4#',
      reason: 'illegal move',
    };
    render(<ImportErrorDisplay error={err} />);
    const el = screen.getByTestId('import-error');
    expect(el.textContent).toContain('move 3');
    expect(el.textContent).toContain('Black');
    expect(el.textContent).toContain('Qh4#');
  });

  it('renders result-mismatch error', () => {
    const err: ValidationError = {
      type: 'result-mismatch',
      message: "payload says '1-0' but game is ongoing",
    };
    render(<ImportErrorDisplay error={err} />);
    expect(screen.getByText(/Result mismatch/i)).toBeTruthy();
  });

  it('renders raw string errors', () => {
    render(<ImportErrorDisplay error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});

// ─── SaltMissingScreen ────────────────────────────────────────────────────────

describe('SaltMissingScreen', () => {
  it('shows the salt-missing warning', () => {
    const onForfeit = vi.fn();
    const onBack = vi.fn();
    render(
      <SaltMissingScreen opponentLabel="Bob" onForfeit={onForfeit} onBack={onBack} />,
    );
    expect(screen.getByTestId('salt-missing')).toBeTruthy();
    expect(screen.getByText(/commitment lost/i)).toBeTruthy();
    expect(screen.getByText(/Bob/)).toBeTruthy();
  });

  it('calls onForfeit when forfeit button clicked', () => {
    const onForfeit = vi.fn();
    const onBack = vi.fn();
    render(
      <SaltMissingScreen opponentLabel="Bob" onForfeit={onForfeit} onBack={onBack} />,
    );
    fireEvent.click(screen.getByTestId('salt-forfeit'));
    expect(onForfeit).toHaveBeenCalledOnce();
  });

  it('calls onBack when back button clicked', () => {
    const onForfeit = vi.fn();
    const onBack = vi.fn();
    render(
      <SaltMissingScreen opponentLabel="Bob" onForfeit={onForfeit} onBack={onBack} />,
    );
    fireEvent.click(screen.getByTestId('salt-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ─── ConflictScreen ──────────────────────────────────────────────────────────

describe('ConflictScreen', () => {
  it('renders both versions and highlights the conflict', () => {
    const stored = makePayload({ moves: ['e4', 'e5', 'Nf3'] });
    const incoming = makePayload({ moves: ['e4', 'e5'] });
    const onKeepStored = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ConflictScreen
        stored={stored}
        incoming={incoming}
        onKeepStored={onKeepStored}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByText(/History conflict/i)).toBeTruthy();
    // Shows move counts
    expect(screen.getAllByText(/3 moves/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 moves/).length).toBeGreaterThan(0);
    // Last moves shown
    expect(screen.getByText('Nf3')).toBeTruthy();
    expect(screen.getByText('e5')).toBeTruthy();
  });

  it('calls onKeepStored when keep button clicked', () => {
    const stored = makePayload({ moves: ['e4'] });
    const incoming = makePayload({ moves: [] });
    const onKeepStored = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ConflictScreen
        stored={stored}
        incoming={incoming}
        onKeepStored={onKeepStored}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByTestId('conflict-keep'));
    expect(onKeepStored).toHaveBeenCalledOnce();
  });

  it('calls onDiscard when discard button clicked', () => {
    const stored = makePayload({ moves: ['e4'] });
    const incoming = makePayload({ moves: [] });
    const onKeepStored = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ConflictScreen
        stored={stored}
        incoming={incoming}
        onKeepStored={onKeepStored}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByTestId('conflict-discard'));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
