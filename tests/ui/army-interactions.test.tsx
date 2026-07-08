// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Board } from '../../src/ui/components/Board';
import { ShatterPreview } from '../../src/ui/components/ShatterPreview';
import { RampagePreview } from '../../src/ui/components/RampagePreview';
import { initialState, legalTurns, parseSfen, algebraicToSquare } from '../../src/engine';
import { bannerZone, concordPool } from '../../src/engine/accord';
import type { GameState, RampageMove, Turn } from '../../src/engine/types';
import {
  buildHighlightMap,
  buildRallyHighlightMap,
  getPrimaryFrom,
  getPrimaryDest,
  isThrallHomingMove,
  primaryEq,
} from '../../src/ui/shared';

afterEach(cleanup);

// ─── Twins: staging (primary → rally filtering) ────────────────────────────

describe('Twins staging (primary → rally)', () => {
  // Position: White Twins Warlords at d4 (sq27) and f4 (sq29), Black Crown King at h8 (sq63).
  // After d4→d5, f4 Warlord can rally.
  const TWINS_SFEN = '7k/8/8/8/3K1K2/8/8/8/w/Twins,Crown/-/-/0,0/-/0/1';

  it('filters all legal turns by chosen primary to get staging turns', () => {
    const state = parseSfen(TWINS_SFEN);
    const legal = legalTurns(state);

    // Move d4 Warlord to d5 (sq35): primary = {type:'standard', from:27, to:35}
    const d5 = algebraicToSquare('d5');
    const d4 = algebraicToSquare('d4');
    const candidatePrimary = legal.find(t => getPrimaryFrom(t) === d4 && getPrimaryDest(t) === d5)?.primary;
    expect(candidatePrimary).toBeDefined();

    const staging = legal.filter(t => primaryEq(t.primary, candidatePrimary!));
    expect(staging.length).toBeGreaterThanOrEqual(1);

    // Some staging turns should have rallies
    const withRally = staging.filter(t => t.rally !== undefined);
    expect(withRally.length).toBeGreaterThan(0);

    // Every staging turn has the same primary
    for (const t of staging) {
      expect(primaryEq(t.primary, candidatePrimary!)).toBe(true);
    }
  });

  it('finds the skip-rally turn (rally === undefined) in staging turns', () => {
    const state = parseSfen(TWINS_SFEN);
    const legal = legalTurns(state);

    const d5 = algebraicToSquare('d5');
    const d4 = algebraicToSquare('d4');
    const candidatePrimary = legal.find(t => getPrimaryFrom(t) === d4 && getPrimaryDest(t) === d5)?.primary;
    const staging = legal.filter(t => primaryEq(t.primary, candidatePrimary!));

    const skipTurn = staging.find(t => t.rally === undefined);
    expect(skipTurn).toBeDefined();
  });

  it('rally highlight map covers rally destinations', () => {
    const state = parseSfen(TWINS_SFEN);
    const legal = legalTurns(state);

    const d5 = algebraicToSquare('d5');
    const d4 = algebraicToSquare('d4');
    const candidatePrimary = legal.find(t => getPrimaryFrom(t) === d4 && getPrimaryDest(t) === d5)?.primary;
    const staging = legal.filter(t => primaryEq(t.primary, candidatePrimary!));

    const rallyMap = buildRallyHighlightMap(staging);
    expect(rallyMap.size).toBeGreaterThan(0);
    for (const [, hl] of rallyMap) {
      expect(hl).toBe('legal-rally');
    }
  });

  it('Board renders rally destinations when rallyTurns provided', () => {
    const state = parseSfen(TWINS_SFEN);
    const legal = legalTurns(state);
    const d5 = algebraicToSquare('d5');
    const d4 = algebraicToSquare('d4');
    const candidatePrimary = legal.find(t => getPrimaryFrom(t) === d4 && getPrimaryDest(t) === d5)?.primary;
    const staging = legal.filter(t => primaryEq(t.primary, candidatePrimary!));

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={null}
        legalMovesForSelected={[]}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
        rallyTurns={staging}
      />,
    );

    // At least one square should have hl-rally class
    const rallySquares = container.querySelectorAll('.hl-rally');
    expect(rallySquares.length).toBeGreaterThan(0);
  });
});

// ─── Twins: Shatter preview ────────────────────────────────────────────────

describe('ShatterPreview', () => {
  // White Twins Warlord at b1 (sq1), with pawns at a2(sq8), b2(sq9), c2(sq10).
  // Shatter from b1 would destroy neighbors that are occupied.
  const SHATTER_SFEN = '7k/8/8/8/8/8/PPP5/1K4K1/w/Twins,Crown/-/-/0,0/-/0/1';

  it('lists all occupied neighbor squares as doomed', () => {
    const state = parseSfen(SHATTER_SFEN);
    const warlordSq = algebraicToSquare('b1'); // sq1

    const { getByTestId } = render(
      <ShatterPreview
        warlordSquare={warlordSq}
        gameState={state}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // a2 (sq8), b2 (sq9), c2 (sq10) are White pawns adjacent to b1
    // a1 (sq0), c1 (sq2) are empty and should NOT appear
    const list = getByTestId('shatter-doomed-list');
    const items = list.querySelectorAll('[data-testid^="shatter-victim-"]');
    expect(items.length).toBe(3); // a2, b2, c2
  });

  it('marks friendly pieces with warning styling', () => {
    const state = parseSfen(SHATTER_SFEN);
    const warlordSq = algebraicToSquare('b1');

    const { container } = render(
      <ShatterPreview
        warlordSquare={warlordSq}
        gameState={state}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // All doomed are White pawns (same color as mover = friendly)
    const friendlyItems = container.querySelectorAll('.preview-capture-item.friendly-warning');
    expect(friendlyItems.length).toBe(3);
  });

  it('confirm button calls onConfirm', () => {
    const state = parseSfen(SHATTER_SFEN);
    let confirmed = false;

    const { getByTestId } = render(
      <ShatterPreview
        warlordSquare={algebraicToSquare('b1')}
        gameState={state}
        onConfirm={() => { confirmed = true; }}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(getByTestId('shatter-confirm'));
    expect(confirmed).toBe(true);
  });

  it('cancel closes the preview', () => {
    const state = parseSfen(SHATTER_SFEN);
    let cancelled = false;

    const { getByTestId } = render(
      <ShatterPreview
        warlordSquare={algebraicToSquare('b1')}
        gameState={state}
        onConfirm={() => {}}
        onCancel={() => { cancelled = true; }}
      />,
    );

    // Click the overlay background (which wraps the sheet)
    fireEvent.click(getByTestId('shatter-preview'));
    expect(cancelled).toBe(true);
  });
});

// ─── Wild: Rampage preview ────────────────────────────────────────────────

describe('RampagePreview', () => {
  // White Wild Behemoth at d4 (sq27), Black rooks at f4 (sq29) and g4 (sq30).
  const RAMPAGE_SFEN = '7k/8/8/8/3R1rr1/8/8/K7/w/Wild,Crown/-/-/0,0/-/0/1';

  function findRampageTurn(state: GameState): (Turn & { primary: RampageMove }) | undefined {
    const legal = legalTurns(state);
    return legal.find(t => t.primary.type === 'rampage') as (Turn & { primary: RampageMove }) | undefined;
  }

  it('renders capture list matching turn.primary.captures', () => {
    const state = parseSfen(RAMPAGE_SFEN);
    const rampageTurn = findRampageTurn(state);
    expect(rampageTurn).toBeDefined();

    const { getByTestId } = render(
      <RampagePreview
        turn={rampageTurn!}
        gameState={state}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const list = getByTestId('rampage-capture-list');
    const items = list.querySelectorAll('[data-testid^="rampage-victim-"]');
    expect(items.length).toBe(rampageTurn!.primary.captures.length);
  });

  it('victim squares match turn.primary.captures exactly', () => {
    const state = parseSfen(RAMPAGE_SFEN);
    const rampageTurn = findRampageTurn(state);
    expect(rampageTurn).toBeDefined();

    const { getByTestId } = render(
      <RampagePreview
        turn={rampageTurn!}
        gameState={state}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    for (const sq of rampageTurn!.primary.captures) {
      expect(getByTestId(`rampage-victim-${sq}`)).toBeTruthy();
    }
  });

  it('confirm calls onConfirm', () => {
    const state = parseSfen(RAMPAGE_SFEN);
    const rampageTurn = findRampageTurn(state)!;
    let confirmed = false;

    const { getByTestId } = render(
      <RampagePreview
        turn={rampageTurn}
        gameState={state}
        onConfirm={() => { confirmed = true; }}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(getByTestId('rampage-confirm'));
    expect(confirmed).toBe(true);
  });
});

// ─── Veil: slide vs teleport highlight class ──────────────────────────────

describe('Veil: slide vs teleport highlight', () => {
  // White Veil Wraith at c4 (sq26), Black Crown King at h8, White King at a1,
  // Black rook at c7 (sq50). Essence W=2.
  // Black pawn g5 sits off the Wraith's queen lines from c4, so capturing it
  // requires a teleport. (Royals and Q-slot pieces are teleport-immune in v2.3.)
  const VEIL_SFEN = '7k/2r5/8/6p1/2Q5/8/8/K7/w/Veil,Crown/-/-/2,0/-/0/1';

  it('Wraith slide destinations get hl-move class, not hl-teleport-move', () => {
    const state = parseSfen(VEIL_SFEN);
    const legal = legalTurns(state);
    const wrathSq = algebraicToSquare('c4'); // sq26
    const wrathMoves = legal.filter(t => getPrimaryFrom(t) === wrathSq);

    const slideMoves = wrathMoves.filter(t => t.primary.type === 'standard');
    expect(slideMoves.length).toBeGreaterThan(0);

    const hlMap = buildHighlightMap(slideMoves, state.board, 'W', 'Veil');
    for (const [, hl] of hlMap) {
      // Slide = standard move to empty squares
      expect(['legal-move', 'legal-capture']).toContain(hl);
    }
  });

  it('Wraith teleport to empty square gets hl-teleport-move class', () => {
    const state = parseSfen(VEIL_SFEN);
    const legal = legalTurns(state);
    const wrathSq = algebraicToSquare('c4');
    const wrathMoves = legal.filter(t => getPrimaryFrom(t) === wrathSq);

    const teleportMoves = wrathMoves.filter(t => t.primary.type === 'teleport' && !(t.primary as { isCapture: boolean }).isCapture);
    expect(teleportMoves.length).toBeGreaterThan(0);

    const hlMap = buildHighlightMap(teleportMoves, state.board, 'W', 'Veil');
    for (const [, hl] of hlMap) {
      expect(hl).toBe('legal-teleport-move');
    }
  });

  it('Wraith teleport capture gets hl-teleport-capture class', () => {
    const state = parseSfen(VEIL_SFEN);
    const legal = legalTurns(state);
    const wrathSq = algebraicToSquare('c4');
    const wrathMoves = legal.filter(t => getPrimaryFrom(t) === wrathSq);

    const teleportCaptures = wrathMoves.filter(
      t => t.primary.type === 'teleport' && (t.primary as { isCapture: boolean }).isCapture,
    );
    expect(teleportCaptures.length).toBeGreaterThan(0);

    const hlMap = buildHighlightMap(teleportCaptures, state.board, 'W', 'Veil');
    for (const [, hl] of hlMap) {
      expect(hl).toBe('legal-teleport-capture');
    }
  });

  it('Board shows hl-teleport-move class on teleport non-capture destinations', () => {
    const state = parseSfen(VEIL_SFEN);
    const legal = legalTurns(state);
    const wrathSq = algebraicToSquare('c4');
    const wrathMoves = legal.filter(t => getPrimaryFrom(t) === wrathSq);

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={wrathSq}
        legalMovesForSelected={wrathMoves}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
      />,
    );

    // There should be teleport-move squares
    const teleportSquares = container.querySelectorAll('.hl-teleport-move');
    expect(teleportSquares.length).toBeGreaterThan(0);
  });
});

// ─── Phantom: Thrall homing move detection ───────────────────────────────

describe('Phantom: Thrall homing move', () => {
  // White Phantom: Thrall at d4 (sq27), King at a1, Black Crown King at h8.
  // Thrall at d4: standard forward push = d5 (sq35). Homing = any other direction to empty sq.
  const PHANTOM_SFEN = '7k/8/8/8/3P4/8/8/K7/w/Phantom,Crown/-/-/0,0/-/0/1';

  it('forward push is not homing', () => {
    const state = parseSfen(PHANTOM_SFEN);
    const legal = legalTurns(state);
    const thrallSq = algebraicToSquare('d4');
    const d5 = algebraicToSquare('d5');

    const forwardPush = legal.find(
      t => getPrimaryFrom(t) === thrallSq && getPrimaryDest(t) === d5,
    );
    expect(forwardPush).toBeDefined();
    expect(isThrallHomingMove(forwardPush!, state.board, 'W')).toBe(false);
  });

  it('non-forward moves to empty squares are homing', () => {
    const state = parseSfen(PHANTOM_SFEN);
    const legal = legalTurns(state);
    const thrallSq = algebraicToSquare('d4');
    const d5 = algebraicToSquare('d5');

    // Homing moves: any direction other than forward to empty square
    const homingMoves = legal.filter(
      t =>
        getPrimaryFrom(t) === thrallSq &&
        getPrimaryDest(t) !== d5 &&
        state.board[getPrimaryDest(t)] === null &&
        t.primary.type === 'standard',
    );
    expect(homingMoves.length).toBeGreaterThan(0);
    for (const m of homingMoves) {
      expect(isThrallHomingMove(m, state.board, 'W')).toBe(true);
    }
  });

  it('Board shows hl-homing class on Phantom Thrall homing destinations', () => {
    const state = parseSfen(PHANTOM_SFEN);
    const legal = legalTurns(state);
    const thrallSq = algebraicToSquare('d4');
    const thrallMoves = legal.filter(t => getPrimaryFrom(t) === thrallSq);

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={thrallSq}
        legalMovesForSelected={thrallMoves}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
      />,
    );

    const homingSquares = container.querySelectorAll('.hl-homing');
    expect(homingSquares.length).toBeGreaterThan(0);
  });
});

// ─── Wild: Exhausted Stalker badge ───────────────────────────────────────

describe('Wild: Exhausted Stalker badge', () => {
  // White Wild: King at a1, exhausted Stalker at d4.
  const EXHAUSTED_SFEN = '7k/8/5r2/8/3B4/8/8/K7/w/Wild,Crown/-/-/0,0/d4/0/1';

  it('Board shows data-exhausted on the exhausted piece', () => {
    const state = parseSfen(EXHAUSTED_SFEN);
    const stalkerSq = algebraicToSquare('d4');
    const exhaustedSquares = new Set<number>(state.exhausted);

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={null}
        legalMovesForSelected={[]}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
        exhaustedSquares={exhaustedSquares}
      />,
    );

    const stalkerCell = container.querySelector(`[data-sq="${stalkerSq}"]`);
    expect(stalkerCell?.querySelector('[data-exhausted="true"]')).toBeTruthy();
  });

  it('Exhausted Stalker has no capture moves in legal turns', () => {
    const state = parseSfen(EXHAUSTED_SFEN);
    const legal = legalTurns(state);
    const stalkerSq = algebraicToSquare('d4');

    // f6 = sq45 has the Black rook (potential capture)
    const captureAttempts = legal.filter(
      t =>
        getPrimaryFrom(t) === stalkerSq &&
        (t.primary.type === 'strike' || t.primary.type === 'standard') &&
        state.board[getPrimaryDest(t)] !== null,
    );
    expect(captureAttempts).toHaveLength(0);
  });

  it('Exhausted Stalker can still move (non-capture)', () => {
    const state = parseSfen(EXHAUSTED_SFEN);
    const legal = legalTurns(state);
    const stalkerSq = algebraicToSquare('d4');

    const nonCaptureMoves = legal.filter(
      t =>
        getPrimaryFrom(t) === stalkerSq &&
        state.board[getPrimaryDest(t)] === null,
    );
    expect(nonCaptureMoves.length).toBeGreaterThan(0);
  });
});

// ─── Accord: Banner zone and empowered badge ─────────────────────────────

describe('Accord: Concord badge', () => {
  // White Accord: King a1, Herald d4, Rook d5 + Knight e5 (both in the Banner —
  // two distinct slots, so the Concord pool grants something). Black Crown King h8.
  const ACCORD_SFEN = '7k/8/8/3RN3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1';

  it('Board shows data-empowered on N/B/R pieces sharing the Banner', () => {
    const state = parseSfen(ACCORD_SFEN);
    const knightSq = algebraicToSquare('e5');

    // Compute the Concord set (mimics what GameScreen does)
    const empoweredSquares = new Set<number>();
    const pool = concordPool(state.board, 'W');
    if (pool.size >= 2) {
      for (const sq of bannerZone(state.board, 'W')) {
        const piece = state.board[sq];
        if (!piece || piece.color !== 'W') continue;
        if (piece.slot === 'N' || piece.slot === 'B' || piece.slot === 'R') empoweredSquares.add(sq);
      }
    }

    expect(empoweredSquares.has(knightSq)).toBe(true);

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={null}
        legalMovesForSelected={[]}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
        empoweredSquares={empoweredSquares}
      />,
    );

    const knightCell = container.querySelector(`[data-sq="${knightSq}"]`);
    expect(knightCell?.querySelector('[data-empowered="true"]')).toBeTruthy();
  });

  it('a Knight in Concord with a Rook has more moves than a standard Knight', () => {
    const state = parseSfen(ACCORD_SFEN);
    const legal = legalTurns(state);
    const knightSq = algebraicToSquare('e5');

    const knightMoves = legal.filter(t => getPrimaryFrom(t) === knightSq);
    // Native knight at e5 has 8 jumps; the pooled rook slides push it well past that.
    expect(knightMoves.length).toBeGreaterThan(8);
  });
});

// ─── Crown: existing Board behavior preserved ────────────────────────────

describe('Existing Board behavior preserved after S12 changes', () => {
  it('standard legal moves still get hl-move class', () => {
    const state = initialState('Crown', 'Crown');
    const legal = legalTurns(state);
    const e2Moves = legal.filter(t => getPrimaryFrom(t) === 12);

    const { container } = render(
      <Board
        gameState={state}
        flipped={false}
        selectedSquare={12}
        legalMovesForSelected={e2Moves}
        lastMovePrimary={null}
        checkedSquares={[]}
        onSquareClick={() => {}}
      />,
    );

    expect(container.querySelector('[data-sq="20"]')).toHaveClass('hl-move');
    expect(container.querySelector('[data-sq="28"]')).toHaveClass('hl-move');
  });
});
