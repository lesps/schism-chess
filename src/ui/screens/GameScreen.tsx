import { useCallback, useMemo, useState } from 'react';
import type { Army, Color, RampageMove, Square, Turn } from '../../engine/types';
import { applyTurnUnchecked } from '../../engine';
import { bannerZone } from '../../engine/accord';
import { ArmyInfoSheet } from '../components/ArmyInfoSheet';
import { Board } from '../components/Board';
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
  PIECE_COLORS,
  armorZone,
  getPieceInfo,
  getSlotName,
  hasCrossedMidline,
  primaryEq,
  squareNeighbors,
} from '../shared';
import { PieceIcon } from '../pieceArt';
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

  // ── Army info sheet ──
  const [armyInfoOpen, setArmyInfoOpen] = useState(false);

  // ── Board orientation ──
  const [autoFlip, setAutoFlip] = useState(true);
  const [locked, setLocked] = useState(false);
  const [manualFlipped, setManualFlipped] = useState(false);

  const flipped = autoFlip && !locked
    ? gameState.sideToMove === 'B'
    : manualFlipped;

  const lastEntry = history[history.length - 1] ?? null;
  const lastMovePrimary = lastEntry?.turn.primary ?? null;

  // ── Twins staging preview ──
  // During the rally phase, show the board as it stands AFTER the chosen
  // primary action, so rally dots relate to what the player actually sees.
  const stagedPrimary = twinsStagingTurns?.[0]?.primary ?? null;
  const displayState = useMemo(() => {
    if (stagedPrimary === null) return gameState;
    return applyTurnUnchecked(gameState, { primary: stagedPrimary });
  }, [stagedPrimary, gameState]);
  const isStaging = twinsStagingTurns !== null;

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
      for (const sq of bannerZone(displayState.board, color)) map.set(sq, 'banner');
    }
    return map;
  }, [displayState.board, armies]);

  // Twins staging: tint the squares of Warlords that can still rally,
  // so the player knows which piece the pink destination dots belong to.
  const rallyFromSquares = useMemo((): Map<Square, OverlayKind> => {
    const map = new Map<Square, OverlayKind>();
    if (twinsStagingTurns === null) return map;
    for (const t of twinsStagingTurns) {
      if (t.rally) map.set(t.rally.from, 'rally-from');
    }
    return map;
  }, [twinsStagingTurns]);

  // Wild: Armor zone around any selected Behemoth (either color — inspecting
  // the enemy's Behemoth shows where you must attack it from)
  const armorSquares = useMemo((): Map<Square, OverlayKind> => {
    if (selectedSquare === null) return new Map();
    const piece = gameState.board[selectedSquare];
    if (!piece || piece.slot !== 'R' || piece.promoted) return new Map();
    if (armies[piece.color] !== 'Wild') return new Map();
    const map = new Map<Square, OverlayKind>();
    for (const sq of armorZone(selectedSquare)) map.set(sq, 'armor');
    return map;
  }, [selectedSquare, gameState.board, armies]);

  // Shatter: Blast zone around shatterPreviewSq (shown in overlay, also colored on board)
  const blastSquares = useMemo((): Map<Square, OverlayKind> => {
    if (shatterPreviewSq === null) return new Map();
    const map = new Map<Square, OverlayKind>();
    for (const sq of squareNeighbors(shatterPreviewSq)) map.set(sq, 'blast');
    return map;
  }, [shatterPreviewSq]);

  // Combined overlay map (blast > armor > rally-from > banner)
  const overlaySquares = useMemo((): Map<Square, OverlayKind> => {
    const map = new Map<Square, OverlayKind>(bannerSquares);
    for (const [sq, kind] of rallyFromSquares) map.set(sq, kind);
    for (const [sq, kind] of armorSquares) map.set(sq, kind);
    for (const [sq, kind] of blastSquares) map.set(sq, kind);
    return map;
  }, [bannerSquares, rallyFromSquares, armorSquares, blastSquares]);

  // Accord: Empowered piece squares (friendly non-pawn/herald in banner zone)
  const empoweredSquares = useMemo((): Set<Square> => {
    const result = new Set<Square>();
    for (const color of ['W', 'B'] as const) {
      if (armies[color] !== 'Accord') continue;
      const zone = bannerZone(displayState.board, color);
      for (const sq of zone) {
        const piece = displayState.board[sq];
        if (!piece || piece.color !== color) continue;
        // Pawns are never empowered; Herald (Q-slot, non-promoted) is the anchor, not empowered itself
        if (piece.slot === 'P') continue;
        if (piece.slot === 'Q' && !piece.promoted) continue;
        result.add(sq);
      }
    }
    return result;
  }, [displayState.board, armies]);

  // Wild: Exhausted squares (from gameState.exhausted)
  const exhaustedSquares = useMemo(
    () => new Set<Square>(gameState.exhausted),
    [gameState.exhausted],
  );

  // Invasion progress: royals past midline
  const invasionSquares = useMemo((): Set<Square> => {
    const result = new Set<Square>();
    for (let sq = 0; sq < 64; sq++) {
      const piece = displayState.board[sq];
      if (!piece || piece.slot !== 'K') continue;
      if (hasCrossedMidline(sq, piece.color)) result.add(sq);
    }
    return result;
  }, [displayState.board]);

  // ── Hint message ──
  const hint = useMemo((): string | null => {
    if (twinsStagingTurns !== null) return null; // rally bar carries the instruction
    if (checkedSquares.length > 0) {
      if (movingArmy === 'Twins' && checkedSquares.length === 1) return HINTS.TWINS_WARLORD_IN_CHECK;
      if (movingArmy === 'Twins' && checkedSquares.length >= 2) return HINTS.TWINS_BOTH_IN_CHECK;
      if (opponentArmy === 'Phantom') return HINTS.PIERCING_CHECK;
    }
    if (selectedSquare !== null && exhaustedSquares.has(selectedSquare)) {
      const piece = gameState.board[selectedSquare];
      if (piece?.slot === 'B' && armies[piece.color] === 'Wild') return HINTS.STALKER_EXHAUSTED;
    }
    if (
      history.length === 0 &&
      selectedSquare === null &&
      (myColor === undefined || sideToMove === myColor)
    ) return HINTS.FIRST_MOVE;
    return null;
  }, [twinsStagingTurns, checkedSquares, movingArmy, opponentArmy, selectedSquare, exhaustedSquares, gameState.board, history.length, myColor, sideToMove, armies]);

  // ── Selected-piece reminder ──
  const selectedPiece = selectedSquare !== null ? gameState.board[selectedSquare] : null;

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
  // Whether the local player may act (always true in hotseat; PBM gates on color).
  const canAct = myColor === undefined || gameState.sideToMove === myColor;

  function handleSquareClick(sq: Square) {
    if (status.type !== 'ongoing') return;

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
      // Move submission is only available to the acting player; inspection
      // (selecting pieces to read their info) is always available.
      const destTurns = canAct ? turnsForMove(allLegal, selectedSquare, sq) : [];

      if (destTurns.length > 0) {
        const first = destTurns[0];

        // Tapping the selected Warlord again = Shatter (dest === from only
        // exists for Shatter). Always route through the confirmation preview —
        // never silently destroy everything around the Warlord.
        if (first.primary.type === 'shatter') {
          setShatterPreviewSq(selectedSquare);
          return;
        }

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

      // Not a valid destination — toggle off, or inspect another piece.
      // Any piece (either color, with or without legal moves) can be selected
      // so its info bar is shown; only pieces with moves get destination dots.
      if (sq === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      const piece = gameState.board[sq];
      setSelectedSquare(piece ? sq : null);
      return;
    }

    // No piece selected — tap any piece to select/inspect it
    const piece = gameState.board[sq];
    if (piece) setSelectedSquare(sq);
  }

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
        <button
          className="flip-btn"
          onClick={() => setArmyInfoOpen(true)}
          aria-label="About these armies"
          title="About these armies"
          data-testid="army-info-btn"
        >
          ⓘ
        </button>
        {onRules && (
          <button
            className="flip-btn"
            onClick={() => onRules('')}
            aria-label="Open rules"
            title="Rules"
            data-testid="game-rules-btn"
          >
            ?
          </button>
        )}
      </header>

      {/* Hint bar */}
      <HintBar message={hint} />

      {/* Selected-piece reminder (shown for any tapped piece, even without moves) */}
      {selectedPiece && twinsStagingTurns === null && (() => {
        const pArmy = armies[selectedPiece.color];
        const promoted = selectedPiece.promoted ?? false;
        const note = selectedPiece.color !== sideToMove
          ? HINTS.INSPECT_WAITING
          : (legalMovesForSelected.length === 0 ? HINTS.NO_LEGAL_MOVES : null);
        return (
          <div className="piece-info-bar" data-testid="piece-info">
            <span
              className="piece-info-icon"
              style={{ color: PIECE_COLORS[pArmy][selectedPiece.color] }}
              aria-hidden
            >
              <PieceIcon slot={selectedPiece.slot} color={selectedPiece.color} army={pArmy} promoted={promoted} />
            </span>
            <span className="piece-info-text">
              <strong className="piece-info-name" style={{ color: ARMY_ACCENTS[pArmy] }}>
                {getSlotName(selectedPiece.slot, pArmy, promoted)}
                {promoted ? ' (promoted)' : ''}
                {note && <span className="piece-info-note"> · {note}</span>}
              </strong>
              <span className="piece-info-desc">
                {getPieceInfo(selectedPiece.slot, pArmy, promoted)}
              </span>
            </span>
          </div>
        );
      })()}

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

      {/* Board — during Twins staging, shows the position after the chosen
          primary action so the rally dots match what the player sees. */}
      <div className="board-wrapper">
        <Board
          gameState={displayState}
          flipped={flipped}
          selectedSquare={isStaging ? null : selectedSquare}
          legalMovesForSelected={isStaging ? [] : legalMovesForSelected}
          lastMovePrimary={isStaging ? stagedPrimary : lastMovePrimary}
          checkedSquares={isStaging ? [] : checkedSquares}
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

      {/* Army info sheet */}
      {armyInfoOpen && (
        <ArmyInfoSheet
          armies={armies}
          onRules={onRules ? anchor => { setArmyInfoOpen(false); onRules(anchor); } : undefined}
          onClose={() => setArmyInfoOpen(false)}
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
