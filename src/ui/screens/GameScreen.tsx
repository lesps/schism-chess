import { useCallback, useMemo, useState } from 'react';
import type { Army, Color, RampageMove, Square, Turn } from '../../engine/types';
import { bannerZone } from '../../engine/accord';
import { Board, getDestinationsForOrigin } from '../components/Board';
import type { OverlayKind } from '../components/Board';
import { CapturedPieceTray } from '../components/CapturedPieceTray';
import { EssenceMeter } from '../components/EssenceMeter';
import { GameEndModal } from '../components/GameEndModal';
import { HintBar } from '../components/HintBar';
import { MoveListPanel } from '../components/MoveListPanel';
import { RampagePreview } from '../components/RampagePreview';
import { SanInput } from '../components/SanInput';
import { ShatterPreview } from '../components/ShatterPreview';
import { TurnChooser } from '../components/TurnChooser';
import { useGameLogic, turnsForMove } from '../hooks/useGameLogic';
import {
  ARMY_ACCENTS,
  ARMY_NAMES,
  armorZone,
  getPrimaryFrom,
  hasCrossedMidline,
  primaryEq,
  squareNeighbors,
} from '../shared';
import { HINTS } from '../strings';

interface Props {
  armyW: Army;
  armyB: Army;
  initialSfen?: string;
  /** If set, only this color can make moves (PBM mode). */
  myColor?: Color;
  /** Called after each turn is applied. */
  onTurnSubmitted?: (turn: Turn) => void;
  /** Called when "Review" is clicked in the end modal. */
  onReview?: () => void;
  onHome: () => void;
  onNewGame: () => void;
  onRules?: (anchor: string) => void;
}

export function GameScreen({ armyW, armyB, initialSfen, myColor, onTurnSubmitted, onReview, onHome, onNewGame, onRules }: Props) {
  const logic = useGameLogic(armyW, armyB, initialSfen);
  const {
    gameState,
    history,
    status,
    captured,
    selectedSquare,
    legalMovesForSelected,
    allLegal,
    checkedSquares,
    setSelectedSquare,
    submitTurn: rawSubmitTurn,
  } = logic;

  const submitTurn = useCallback((turn: Turn) => {
    rawSubmitTurn(turn);
    onTurnSubmitted?.(turn);
  }, [rawSubmitTurn, onTurnSubmitted]);

  // ── Standard chooser (fallback for multi-turn disambiguation) ──
  const [chooserTurns, setChooserTurns] = useState<Turn[] | null>(null);

  // ── Twins two-phase input ──
  // When non-null, we are in the rally-selection phase; primary has been chosen.
  const [twinsStagingTurns, setTwinsStagingTurns] = useState<Turn[] | null>(null);

  // ── Shatter preview ──
  const [shatterPreviewSq, setShatterPreviewSq] = useState<Square | null>(null);

  // ── Rampage preview ──
  const [rampagePreviewTurn, setRampagePreviewTurn] = useState<(Turn & { primary: RampageMove }) | null>(null);

  // ── Board orientation ──
  const [autoFlip, setAutoFlip] = useState(true);
  const [locked, setLocked] = useState(false);
  const [manualFlipped, setManualFlipped] = useState(false);

  const flipped = autoFlip && !locked
    ? gameState.sideToMove === 'B'
    : manualFlipped;

  const lastEntry = history[history.length - 1] ?? null;
  const lastMovePrimary = lastEntry?.turn.primary ?? null;

  const { sideToMove, armies } = gameState;
  const movingArmy = armies[sideToMove];
  const opponentColor = sideToMove === 'W' ? 'B' : 'W';
  const opponentArmy = armies[opponentColor];
  const movingArmyColor = ARMY_ACCENTS[movingArmy];
  const sideLabel = sideToMove === 'W' ? 'White' : 'Black';

  // ── Derived board state ──

  // Accord: Banner zone squares (rendered for both armies)
  const bannerSquares = useMemo((): Map<Square, OverlayKind> => {
    const map = new Map<Square, OverlayKind>();
    for (const color of ['W', 'B'] as const) {
      if (armies[color] !== 'Accord') continue;
      for (const sq of bannerZone(gameState.board, color)) map.set(sq, 'banner');
    }
    return map;
  }, [gameState.board, armies]);

  // Wild: Armor zone around selected Behemoth
  const armorSquares = useMemo((): Map<Square, OverlayKind> => {
    if (movingArmy !== 'Wild' || selectedSquare === null) return new Map();
    const piece = gameState.board[selectedSquare];
    if (!piece || piece.slot !== 'R') return new Map();
    const map = new Map<Square, OverlayKind>();
    for (const sq of armorZone(selectedSquare)) map.set(sq, 'armor');
    return map;
  }, [movingArmy, selectedSquare, gameState.board]);

  // Shatter: Blast zone around shatterPreviewSq (shown in overlay, also colored on board)
  const blastSquares = useMemo((): Map<Square, OverlayKind> => {
    if (shatterPreviewSq === null) return new Map();
    const map = new Map<Square, OverlayKind>();
    for (const sq of squareNeighbors(shatterPreviewSq)) map.set(sq, 'blast');
    return map;
  }, [shatterPreviewSq]);

  // Combined overlay map (blast > armor > banner)
  const overlaySquares = useMemo((): Map<Square, OverlayKind> => {
    const map = new Map<Square, OverlayKind>(bannerSquares);
    for (const [sq, kind] of armorSquares) map.set(sq, kind);
    for (const [sq, kind] of blastSquares) map.set(sq, kind);
    return map;
  }, [bannerSquares, armorSquares, blastSquares]);

  // Accord: Empowered piece squares (friendly non-pawn/herald in banner zone)
  const empoweredSquares = useMemo((): Set<Square> => {
    const result = new Set<Square>();
    for (const color of ['W', 'B'] as const) {
      if (armies[color] !== 'Accord') continue;
      const zone = bannerZone(gameState.board, color);
      for (const sq of zone) {
        const piece = gameState.board[sq];
        if (!piece || piece.color !== color) continue;
        // Pawns are never empowered; Herald (Q-slot, non-promoted) is the anchor, not empowered itself
        if (piece.slot === 'P') continue;
        if (piece.slot === 'Q' && !piece.promoted) continue;
        result.add(sq);
      }
    }
    return result;
  }, [gameState.board, armies]);

  // Wild: Exhausted squares (from gameState.exhausted)
  const exhaustedSquares = useMemo(
    () => new Set<Square>(gameState.exhausted),
    [gameState.exhausted],
  );

  // Invasion progress: royals past midline
  const invasionSquares = useMemo((): Set<Square> => {
    const result = new Set<Square>();
    for (let sq = 0; sq < 64; sq++) {
      const piece = gameState.board[sq];
      if (!piece || piece.slot !== 'K') continue;
      if (hasCrossedMidline(sq, piece.color)) result.add(sq);
    }
    return result;
  }, [gameState.board]);

  // ── Hint message ──
  const hint = useMemo((): string | null => {
    if (twinsStagingTurns !== null) return HINTS.TWINS_RALLY_PHASE;
    if (checkedSquares.length > 0) {
      if (movingArmy === 'Twins' && checkedSquares.length === 1) return HINTS.TWINS_WARLORD_IN_CHECK;
      if (opponentArmy === 'Phantom') return HINTS.PIERCING_CHECK;
    }
    if (movingArmy === 'Wild' && selectedSquare !== null) {
      if (exhaustedSquares.has(selectedSquare)) {
        const piece = gameState.board[selectedSquare];
        if (piece?.slot === 'B') return HINTS.STALKER_EXHAUSTED;
      }
    }
    return null;
  }, [twinsStagingTurns, checkedSquares, movingArmy, opponentArmy, selectedSquare, exhaustedSquares, gameState.board]);

  // ── Shatter legality for selected Warlord ──
  const shatterLegalForSelected = useMemo((): boolean => {
    if (movingArmy !== 'Twins' || selectedSquare === null) return false;
    const piece = gameState.board[selectedSquare];
    if (!piece || piece.slot !== 'K') return false;
    return allLegal.some(
      t => t.primary.type === 'shatter' && t.primary.warlordSquare === selectedSquare,
    );
  }, [movingArmy, selectedSquare, allLegal, gameState.board]);

  // ── Click handler ──
  function handleSquareClick(sq: Square) {
    if (status.type !== 'ongoing') return;
    // PBM mode: block input when it's not our turn
    if (myColor !== undefined && gameState.sideToMove !== myColor) return;

    // ── Rally phase (Twins staging) ──
    if (twinsStagingTurns !== null) {
      const rallying = twinsStagingTurns.filter((t: Turn) => t.rally?.to === sq);
      if (rallying.length === 1) {
        submitTurn(rallying[0]);
        setTwinsStagingTurns(null);
      } else if (rallying.length > 1) {
        // Multiple rally from-squares reach the same dest — disambiguate
        setChooserTurns(rallying);
        setTwinsStagingTurns(null);
      }
      // Clicking elsewhere during rally phase is ignored (no deselect)
      return;
    }

    if (selectedSquare !== null) {
      const destTurns = turnsForMove(allLegal, selectedSquare, sq);

      if (destTurns.length > 0) {
        const first = destTurns[0];

        // Rampage: always single turn per from→to; show preview
        if (first.primary.type === 'rampage') {
          setRampagePreviewTurn(first as Turn & { primary: RampageMove });
          setSelectedSquare(null);
          return;
        }

        // Friendly standard capture (Wild Bronco/Behemoth capturing own piece)
        if (
          first.primary.type === 'standard' &&
          gameState.board[first.primary.to]?.color === sideToMove &&
          destTurns.length === 1
        ) {
          setChooserTurns(destTurns); // single-item chooser with warning description
          setSelectedSquare(null);
          return;
        }

        // Twins: enter staging if rallies are available
        if (movingArmy === 'Twins' && destTurns.some(t => t.rally !== undefined)) {
          const chosen = destTurns[0].primary;
          const staging = allLegal.filter(t => primaryEq(t.primary, chosen));
          if (staging.some(t => t.rally !== undefined)) {
            setTwinsStagingTurns(staging);
            setSelectedSquare(null);
            return;
          }
        }

        // Standard: single turn
        if (destTurns.length === 1) {
          submitTurn(destTurns[0]);
          return;
        }

        // Multiple turns to same dest → chooser
        setChooserTurns(destTurns);
        setSelectedSquare(null);
        return;
      }

      // Not a valid destination — try re-selecting
      const piece = gameState.board[sq];
      if (piece && piece.color === sideToMove) {
        const hasMoves = allLegal.some(t => getPrimaryFrom(t) === sq);
        if (hasMoves) {
          setSelectedSquare(sq);
          return;
        }
      }

      setSelectedSquare(null);
      return;
    }

    // No piece selected — try to select one
    const piece = gameState.board[sq];
    if (piece && piece.color === sideToMove) {
      const hasMoves = allLegal.some(t => getPrimaryFrom(t) === sq);
      if (hasMoves) setSelectedSquare(sq);
    }
  }

  const destinationsMap = selectedSquare !== null
    ? getDestinationsForOrigin(legalMovesForSelected, selectedSquare)
    : new Map<Square, Turn[]>();
  void destinationsMap;

  function handleFlipToggle() {
    if (autoFlip) {
      setAutoFlip(false);
      setLocked(true);
      setManualFlipped(sideToMove === 'B');
    } else {
      if (locked) {
        setLocked(false);
        setManualFlipped((prev: boolean) => !prev);
      } else {
        setAutoFlip(true);
      }
    }
  }

  const flipLabel = autoFlip ? '⟳' : (locked ? '🔒' : '↕');

  // Essence delta from last turn (for animation)
  const essenceDelta = gameState.lastTurnMeta?.essenceDelta;

  return (
    <div className="game-screen">
      {/* Header */}
      <header className="game-header">
        <button
          className="game-header-home"
          onClick={onHome}
          aria-label="Go to home"
        >
          ←
        </button>
        <div className="turn-indicator">
          <div
            className="turn-indicator-army"
            style={{ color: movingArmyColor }}
          >
            {ARMY_NAMES[movingArmy]}
          </div>
          <div className="turn-indicator-label">
            {sideLabel} to move
          </div>
        </div>
        <button
          className="flip-btn"
          onClick={handleFlipToggle}
          aria-label={autoFlip ? 'Auto-flip on — tap to lock' : 'Tap to flip board'}
          title={autoFlip ? 'Board auto-flips (tap to lock)' : 'Board locked (tap to flip)'}
        >
          {flipLabel}
        </button>
      </header>

      {/* Hint bar */}
      <HintBar message={hint} />

      {/* Shatter mode button (shown when Warlord selected and shatter is legal) */}
      {shatterLegalForSelected && shatterPreviewSq === null && twinsStagingTurns === null && (
        <div className="shatter-bar">
          <button
            className="btn shatter-btn"
            onClick={() => setShatterPreviewSq(selectedSquare!)}
            data-testid="shatter-mode-btn"
          >
            💥 {HINTS.SHATTER}
          </button>
          <span className="shatter-bar-desc">{HINTS.TWINS_SHATTER_DESC}</span>
        </div>
      )}

      {/* Rally bar (shown during Twins staging phase) */}
      {twinsStagingTurns !== null && (
        <div className="rally-bar" data-testid="rally-bar">
          <button
            className="btn btn-ghost"
            onClick={() => setTwinsStagingTurns(null)}
            data-testid="rally-back"
          >
            {HINTS.BACK}
          </button>
          <span className="rally-bar-hint">{HINTS.TWINS_RALLY_PHASE}</span>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const skipTurn = twinsStagingTurns.find((t: Turn) => t.rally === undefined);
              if (skipTurn) submitTurn(skipTurn);
              setTwinsStagingTurns(null);
            }}
            data-testid="rally-skip"
          >
            {HINTS.SKIP_RALLY}
          </button>
        </div>
      )}

      {/* Board */}
      <div className="board-wrapper">
        <Board
          gameState={gameState}
          flipped={flipped}
          selectedSquare={selectedSquare}
          legalMovesForSelected={twinsStagingTurns !== null ? [] : legalMovesForSelected}
          lastMovePrimary={lastMovePrimary}
          checkedSquares={checkedSquares}
          onSquareClick={handleSquareClick}
          overlaySquares={overlaySquares}
          rallyTurns={twinsStagingTurns ?? undefined}
          empoweredSquares={empoweredSquares}
          exhaustedSquares={exhaustedSquares}
          invasionSquares={invasionSquares}
        />
      </div>

      {/* Chrome */}
      <div className="game-chrome">
        <CapturedPieceTray captured={captured} armies={armies} />
        <EssenceMeter essence={gameState.essence} armies={armies} essenceDelta={essenceDelta} />
        <MoveListPanel history={history} />
        <SanInput
          gameState={gameState}
          disabled={
            status.type !== 'ongoing' ||
            (myColor !== undefined && gameState.sideToMove !== myColor)
          }
          onSubmit={submitTurn}
        />
      </div>

      {/* Shatter preview */}
      {shatterPreviewSq !== null && (
        <ShatterPreview
          warlordSquare={shatterPreviewSq}
          gameState={gameState}
          onConfirm={() => {
            const shatterTurns = allLegal.filter(
              t => t.primary.type === 'shatter' && t.primary.warlordSquare === shatterPreviewSq,
            );
            setShatterPreviewSq(null);
            setSelectedSquare(null);
            if (shatterTurns.some(t => t.rally !== undefined)) {
              // Enter rally phase after shatter
              setTwinsStagingTurns(shatterTurns);
            } else if (shatterTurns.length === 1) {
              submitTurn(shatterTurns[0]);
            } else if (shatterTurns.length > 1) {
              setChooserTurns(shatterTurns);
            }
          }}
          onCancel={() => setShatterPreviewSq(null)}
        />
      )}

      {/* Rampage preview */}
      {rampagePreviewTurn !== null && (
        <RampagePreview
          turn={rampagePreviewTurn}
          gameState={gameState}
          onConfirm={() => {
            submitTurn(rampagePreviewTurn);
            setRampagePreviewTurn(null);
          }}
          onCancel={() => setRampagePreviewTurn(null)}
        />
      )}

      {/* Chooser sheet */}
      {chooserTurns && (
        <TurnChooser
          turns={chooserTurns}
          gameState={gameState}
          onSelect={turn => {
            // If selected from chooser is a rampage, show preview first
            if (turn.primary.type === 'rampage') {
              setRampagePreviewTurn(turn as Turn & { primary: RampageMove });
              setChooserTurns(null);
              return;
            }
            submitTurn(turn);
            setChooserTurns(null);
          }}
          onCancel={() => setChooserTurns(null)}
        />
      )}

      {/* End modal */}
      {status.type !== 'ongoing' && (
        <GameEndModal
          status={status}
          armies={armies}
          onReview={onReview ?? (() => {})}
          onNewGame={onNewGame}
          onRules={onRules}
        />
      )}

      {/* PBM waiting banner */}
      {status.type === 'ongoing' && myColor !== undefined && gameState.sideToMove !== myColor && (
        <div className="pbm-waiting-banner" data-testid="waiting-banner">
          Waiting for opponent's move…
        </div>
      )}
    </div>
  );
}
