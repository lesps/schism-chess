import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Army, Color, MarchMove, RampageMove, Square, Turn } from '../../engine/types';
import { applyTurnUnchecked, isPiercingCheck } from '../../engine';
import { bannerZone, concordPool } from '../../engine/accord';
import { ArmyInfoSheet } from '../components/ArmyInfoSheet';
import type { SheetToggle } from '../components/ArmyInfoSheet';
import { Board } from '../components/Board';
import type { BoardAnimation, OverlayKind } from '../components/Board';
import { CapturedPieceTray } from '../components/CapturedPieceTray';
import { EssenceMeter } from '../components/EssenceMeter';
import { GameEndModal, resultSummary } from '../components/GameEndModal';
import { HintBar } from '../components/HintBar';
import { MarchPreview } from '../components/MarchPreview';
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
  computeTurnAnimation,
  getPrimaryFrom,
  hasCrossedMidline,
  primaryEq,
  squareNeighbors,
} from '../shared';
import { PieceInfoPanel } from '../components/PieceInfoPanel';
import { moveLegend, pieceNotes } from '../pieceGuide';
import { HINTS } from '../strings';
import { loadPrefs, savePref } from '../prefs';
import type { Prefs } from '../prefs';
import { playSound } from '../sound';

/** Hotseat auto-rotate waits for the move animation before turning the board. */
const ROTATE_DELAY_MS = 450;

interface Props {
  armyW: Army;
  armyB: Army;
  /** Flat SAN list to resume from (rebuilds history, captures, repetition). */
  initialMoves?: readonly string[];
  /** DEV `?sfen=` loader: start from an arbitrary position. */
  initialSfen?: string;
  /** If set, only this color can make moves (PBM mode). */
  myColor?: Color;
  /** PBM: the opponent's display name, for the waiting banner. */
  opponentLabel?: string;
  /** False while an overlay (rules, share) covers the screen: global shortcuts pause. */
  active?: boolean;
  /** Called after each turn is applied. */
  onTurnSubmitted?: (turn: Turn) => void;
  /** Local games: called after a takeback so the saved game can drop its last move. */
  onUndo?: () => void;
  /** PBM: re-open the share sheet for the latest move. */
  onShare?: () => void;
  /** Called when "Review moves" is clicked in the end modal. */
  onReview?: () => void;
  /** Local games: start again with the same armies. */
  onRematch?: () => void;
  onHome: () => void;
  onNewGame: () => void;
  onRules?: (anchor: string) => void;
}

export function GameScreen({
  armyW, armyB, initialMoves, initialSfen, myColor, opponentLabel, active = true,
  onTurnSubmitted, onUndo, onShare, onReview, onRematch, onHome, onNewGame, onRules,
}: Props) {
  const logic = useGameLogic(armyW, armyB, { initialMoves, initialSfen });
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
    undo: rawUndo,
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

  // ── Previews ──
  const [shatterPreviewSq, setShatterPreviewSq] = useState<Square | null>(null);
  const [rampagePreviewTurn, setRampagePreviewTurn] = useState<(Turn & { primary: RampageMove }) | null>(null);
  const [marchPreviewTurn, setMarchPreviewTurn] = useState<(Turn & { primary: MarchMove }) | null>(null);

  // ── Sheets / modal ──
  const [armyInfoOpen, setArmyInfoOpen] = useState(false);
  const [endDismissed, setEndDismissed] = useState(false);

  // ── Preferences ──
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    savePref(key, value);
    setPrefs(p => ({ ...p, [key]: value }));
  }, []);

  const { sideToMove, armies } = gameState;
  const movingArmy = armies[sideToMove];
  const opponentColor = sideToMove === 'W' ? 'B' : 'W';
  const opponentArmy = armies[opponentColor];
  const sideLabel = sideToMove === 'W' ? 'White' : 'Black';
  const isPBM = myColor !== undefined;
  const canAct = !isPBM || sideToMove === myColor;
  const inCheck = checkedSquares.length > 0;

  // ── Board orientation ──
  // PBM: your own color at the bottom. Hotseat: optionally face the side to move,
  // rotating only after the move animation has played. The flip button inverts it.
  // Once the game ends nobody moves again, so stay facing whoever moved last.
  const facing: Color = status.type === 'ongoing' ? sideToMove : opponentColor;
  const baseFlip = isPBM ? myColor === 'B' : (prefs.autoRotate && facing === 'B');
  const [shownBaseFlip, setShownBaseFlip] = useState(baseFlip);
  useEffect(() => {
    if (shownBaseFlip === baseFlip) return;
    const t = setTimeout(() => setShownBaseFlip(baseFlip), isPBM ? 0 : ROTATE_DELAY_MS);
    return () => clearTimeout(t);
  }, [baseFlip, shownBaseFlip, isPBM]);
  const [userFlip, setUserFlip] = useState(false);
  const flipped = shownBaseFlip !== userFlip;

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

  // ── Sound / haptics on each new ply ──
  const plyRef = useRef(history.length);
  useEffect(() => {
    const prev = plyRef.current;
    plyRef.current = history.length;
    if (history.length <= prev || !prefs.sound || !lastEntry) return;
    const t = lastEntry.turn.primary.type;
    if (status.type !== 'ongoing') playSound('end');
    else if (inCheck) playSound('check');
    else if (t === 'shatter' || t === 'rampage' || t === 'march' || t === 'teleport' || t === 'strike') playSound('special');
    else if (lastEntry.captures.length > 0) playSound('capture');
    else playSound('move');
  }, [history.length, lastEntry, prefs.sound, status.type, inCheck]);

  // A new game state can't still be dismissed-over (e.g. after an undo)
  useEffect(() => {
    if (status.type === 'ongoing') setEndDismissed(false);
  }, [status.type]);

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
    if (!piece || piece.slot !== 'R') return new Map();
    if (armies[piece.color] !== 'Wild') return new Map();
    const map = new Map<Square, OverlayKind>();
    for (const sq of armorZone(selectedSquare)) map.set(sq, 'armor');
    return map;
  }, [selectedSquare, gameState.board, armies]);

  // Shatter: Blast zone around shatterPreviewSq
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

  // Accord: pieces in Concord (N/B/R in the Banner, when the pool actually grants
  // something — i.e. at least two distinct slots share the zone)
  const empoweredSquares = useMemo((): Set<Square> => {
    const result = new Set<Square>();
    for (const color of ['W', 'B'] as const) {
      if (armies[color] !== 'Accord') continue;
      const pool = concordPool(displayState.board, color);
      if (pool.size < 2) continue; // a lone piece gains nothing
      for (const sq of bannerZone(displayState.board, color)) {
        const piece = displayState.board[sq];
        if (!piece || piece.color !== color) continue;
        if (piece.slot === 'N' || piece.slot === 'B' || piece.slot === 'R') result.add(sq);
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

  // Slide/capture animation for the latest ply
  const animation = useMemo((): BoardAnimation | null => {
    if (!lastEntry) return null;
    return { key: history.length, ...computeTurnAnimation(lastEntry.stateBefore, lastEntry.turn) };
  }, [lastEntry, history.length]);

  // Occurrences of the current position (positionKeys always ends with it)
  const repetitions = useMemo(() => {
    const keys = gameState.positionKeys;
    const current = keys[keys.length - 1];
    return keys.filter(k => k === current).length;
  }, [gameState.positionKeys]);

  // ── Hint message ──
  const hint = useMemo((): string | null => {
    if (twinsStagingTurns !== null || status.type !== 'ongoing') return null;
    if (inCheck && canAct) {
      if (movingArmy === 'Twins' && checkedSquares.length === 1) return HINTS.TWINS_WARLORD_IN_CHECK;
      if (movingArmy === 'Twins' && checkedSquares.length >= 2) return HINTS.TWINS_BOTH_IN_CHECK;
      if (opponentArmy === 'Phantom' && isPiercingCheck(gameState)) return HINTS.PIERCING_CHECK;
      return HINTS.CHECK;
    }
    if (selectedSquare !== null && exhaustedSquares.has(selectedSquare)) {
      const piece = gameState.board[selectedSquare];
      if (piece?.slot === 'B' && armies[piece.color] === 'Wild') return HINTS.STALKER_EXHAUSTED;
    }
    if (repetitions === 2) return HINTS.REPETITION;
    if (history.length === 0 && selectedSquare === null && canAct) return HINTS.FIRST_MOVE;
    return null;
  }, [twinsStagingTurns, status.type, inCheck, canAct, movingArmy, checkedSquares, opponentArmy, gameState, selectedSquare, exhaustedSquares, armies, history.length, repetitions]);

  // ── Piece info: the selected piece, or (desktop) the piece under the mouse ──
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const infoSquare = selectedSquare ?? (hoverSquare !== null && gameState.board[hoverSquare] ? hoverSquare : null);
  const infoIsHover = selectedSquare === null && infoSquare !== null;
  const infoPiece = infoSquare !== null ? gameState.board[infoSquare] : null;
  const infoTurns = useMemo(
    () => (infoSquare === null || !canAct ? [] : allLegal.filter(t => getPrimaryFrom(t) === infoSquare)),
    [infoSquare, canAct, allLegal],
  );
  const infoNotes = useMemo(
    () => (infoSquare === null ? [] : pieceNotes(gameState, infoSquare, infoTurns)),
    [gameState, infoSquare, infoTurns],
  );
  const infoLegend = useMemo(() => moveLegend(gameState, infoTurns), [gameState, infoTurns]);

  // ── Shatter legality for selected Warlord ──
  const shatterLegalForSelected = useMemo((): boolean => {
    if (!canAct || movingArmy !== 'Twins' || selectedSquare === null) return false;
    const piece = gameState.board[selectedSquare];
    if (!piece || piece.slot !== 'K' || piece.color !== sideToMove) return false;
    return allLegal.some(
      t => t.primary.type === 'shatter' && t.primary.warlordSquare === selectedSquare,
    );
  }, [canAct, movingArmy, selectedSquare, allLegal, gameState.board, sideToMove]);

  // ── Turn commitment ──

  /** Route a fully chosen turn: previews for Rampage/March, rally staging for the Twins. */
  function commitTurn(turn: Turn) {
    setChooserTurns(null);
    setSelectedSquare(null);
    if (turn.primary.type === 'rampage') {
      setRampagePreviewTurn(turn as Turn & { primary: RampageMove });
      return;
    }
    if (turn.primary.type === 'march') {
      setMarchPreviewTurn(turn as Turn & { primary: MarchMove });
      return;
    }
    if (movingArmy === 'Twins' && turn.rally === undefined) {
      const staging = allLegal.filter(t => primaryEq(t.primary, turn.primary));
      if (staging.some(t => t.rally !== undefined)) {
        setTwinsStagingTurns(staging);
        return;
      }
    }
    submitTurn(turn);
  }

  /** Try to play the selected piece from `from` to `dest`; false if that isn't a move. */
  function tryMove(from: Square, dest: Square): boolean {
    const destTurns = canAct ? turnsForMove(allLegal, from, dest) : [];
    if (destTurns.length === 0) return false;
    const first = destTurns[0];

    // Tapping the selected Warlord again = Shatter (dest === from only exists for
    // Shatter). Always route through the confirmation preview.
    if (first.primary.type === 'shatter') {
      setShatterPreviewSq(from);
      return true;
    }

    // One option per distinct primary action (Twins rally variants collapse into one;
    // the rally is chosen afterwards on the board).
    const options: Turn[] = [];
    for (const t of destTurns) {
      const i = options.findIndex(o => primaryEq(o.primary, t.primary));
      if (i === -1) options.push(t);
      else if (options[i].rally !== undefined && t.rally === undefined) options[i] = t;
    }

    if (options.length === 1) {
      const only = options[0];
      // Friendly capture (Wild Bronco/Behemoth): single-item chooser carries the warning
      if (only.primary.type === 'standard' && gameState.board[only.primary.to]?.color === sideToMove) {
        setChooserTurns([only]);
        setSelectedSquare(null);
        return true;
      }
      commitTurn(only);
      return true;
    }

    // Several actions share this destination (promotion pieces, Herald step vs March)
    setChooserTurns(options);
    setSelectedSquare(null);
    return true;
  }

  function handleSquareClick(sq: Square) {
    if (status.type !== 'ongoing') {
      // Game over: tapping still inspects pieces
      setSelectedSquare(gameState.board[sq] && sq !== selectedSquare ? sq : null);
      return;
    }

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
      if (tryMove(selectedSquare, sq)) return;
      // Not a valid destination — toggle off, or inspect another piece.
      // Any piece (either color, with or without legal moves) can be selected
      // so its info bar is shown; only pieces with moves get destination dots.
      if (sq === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      setSelectedSquare(gameState.board[sq] ? sq : null);
      return;
    }

    // No piece selected — tap any piece to select/inspect it
    if (gameState.board[sq]) setSelectedSquare(sq);
  }

  function handleDragStart(sq: Square): boolean {
    if (status.type !== 'ongoing' || isStaging || !canAct) return false;
    const piece = gameState.board[sq];
    if (!piece || piece.color !== sideToMove) return false;
    if (!allLegal.some(t => getPrimaryFrom(t) === sq)) return false;
    setSelectedSquare(sq);
    return true;
  }

  function handleDrop(from: Square, to: Square) {
    if (!tryMove(from, to)) setSelectedSquare(from);
  }

  function cancelInteraction() {
    setChooserTurns(null);
    setShatterPreviewSq(null);
    setRampagePreviewTurn(null);
    setMarchPreviewTurn(null);
    setTwinsStagingTurns(null);
    setSelectedSquare(null);
  }

  const canUndo = onUndo !== undefined && history.length > 0;
  function handleUndo() {
    if (!canUndo) return;
    cancelInteraction();
    rawUndo();
    onUndo?.();
  }

  // ── Keyboard shortcuts (desktop): Esc cancels, F flips, Ctrl/⌘+Z undoes ──
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') cancelInteraction();
    else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) setUserFlip(v => !v);
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && canUndo) {
      e.preventDefault();
      handleUndo();
    }
  };
  const sheetOpen = armyInfoOpen || chooserTurns !== null || shatterPreviewSq !== null ||
    rampagePreviewTurn !== null || marchPreviewTurn !== null;
  useEffect(() => {
    if (!active || sheetOpen) return;
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, sheetOpen]);

  // Essence delta from last turn (for animation)
  const essenceDelta = gameState.lastTurnMeta?.essenceDelta;

  const toggles: SheetToggle[] = [
    { label: 'Sound & vibration', value: prefs.sound, onChange: v => setPref('sound', v), testId: 'pref-sound' },
  ];
  if (!isPBM) {
    toggles.unshift({
      label: 'Rotate board to face the player to move',
      value: prefs.autoRotate,
      onChange: v => setPref('autoRotate', v),
      testId: 'pref-autorotate',
    });
  }

  const gameOver = status.type !== 'ongoing';
  // Header: who moves — or, once it's over, who won
  const headerColor: Color | null = status.type === 'win' ? status.winner : status.type === 'draw' ? null : sideToMove;
  const headerTitle = headerColor ? ARMY_NAMES[armies[headerColor]] : 'Draw';
  const turnLabel = status.type === 'win'
    ? `${status.winner === 'W' ? 'White' : 'Black'} wins`
    : gameOver ? 'Game over' : `${sideLabel} to move`;

  return (
    <div className="game-screen">
      {/* Header */}
      <header className="game-header">
        <button
          className="icon-btn game-header-home"
          onClick={onHome}
          aria-label="Go to home"
          title="Home"
        >
          ←
        </button>
        <div className="turn-indicator" aria-live="polite">
          <span className={`turn-dot turn-dot-${headerColor ?? 'none'}`} aria-hidden />
          <div className="turn-indicator-text">
            <div
              className="turn-indicator-army"
              style={{ color: headerColor ? ARMY_ACCENTS[armies[headerColor]] : undefined }}
            >
              {headerTitle}
            </div>
            <div className="turn-indicator-label">
              <span className="turn-indicator-label-text">{turnLabel}</span>
              {inCheck && !gameOver && !isStaging && (
                <span className="check-badge" data-testid="check-badge">Check</span>
              )}
              {isPBM && canAct && !gameOver && <span className="your-turn-badge">You</span>}
            </div>
          </div>
        </div>
        {onUndo && (
          <button
            className="icon-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo last move"
            title="Undo last move (Ctrl+Z)"
            data-testid="undo-btn"
          >
            ↶
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => setUserFlip(v => !v)}
          aria-label="Flip board"
          title="Flip board (F)"
          data-testid="flip-btn"
        >
          ⇅
        </button>
        <button
          className="icon-btn"
          onClick={() => setArmyInfoOpen(true)}
          aria-label="Armies and settings"
          title="Armies and settings"
          data-testid="army-info-btn"
        >
          ⓘ
        </button>
        {onRules && (
          <button
            className="icon-btn"
            onClick={() => onRules('')}
            aria-label="Open rules"
            title="Rules"
            data-testid="game-rules-btn"
          >
            ?
          </button>
        )}
      </header>

      <div className="game-body">
        {/* Board — during Twins staging, shows the position after the chosen
            primary action so the rally dots match what the player sees. */}
        <div className="board-area">
          <div className="board-wrapper">
            <Board
              gameState={displayState}
              flipped={flipped}
              selectedSquare={isStaging ? null : selectedSquare}
              legalMovesForSelected={isStaging || !canAct ? [] : legalMovesForSelected}
              lastMovePrimary={isStaging ? stagedPrimary : lastMovePrimary}
              checkedSquares={isStaging ? [] : checkedSquares}
              onSquareClick={handleSquareClick}
              overlaySquares={overlaySquares}
              rallyTurns={twinsStagingTurns ?? undefined}
              empoweredSquares={empoweredSquares}
              exhaustedSquares={exhaustedSquares}
              invasionSquares={invasionSquares}
              onHoverSquare={setHoverSquare}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              animation={isStaging ? null : animation}
              onEscape={cancelInteraction}
            />
          </div>
        </div>

        {/* Context strip: what's happening right now. Sits below the board in portrait
            (so it never pushes the board around) and atop the sidebar on wide screens. */}
        <div className="context-strip">
          {status.type === 'ongoing' && isPBM && !canAct && (
            <div className="pbm-waiting-banner" data-testid="waiting-banner">
              <span>Waiting for {opponentLabel || 'your opponent'}'s move…</span>
              {onShare && history.length > 0 && (
                <button className="btn btn-secondary btn-small" onClick={onShare} data-testid="reshare-btn">
                  Share link again
                </button>
              )}
            </div>
          )}

          {gameOver && endDismissed && (
            <div className="game-over-banner" data-testid="game-over-banner">
              <span>{resultSummary(status, armies)}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setEndDismissed(false)}>
                Options
              </button>
            </div>
          )}

          <HintBar message={hint} />

          {/* Rally bar (shown during Twins staging phase) */}
          {twinsStagingTurns !== null && (
            <div className="rally-bar" data-testid="rally-bar">
              <button
                className="btn btn-ghost btn-small"
                onClick={() => setTwinsStagingTurns(null)}
                data-testid="rally-back"
              >
                {HINTS.BACK}
              </button>
              <span className="rally-bar-hint">{HINTS.TWINS_RALLY_PHASE}</span>
              <button
                className="btn btn-secondary btn-small"
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

          {/* What the tapped (or hovered) piece does — shown for any piece, even
              without moves, with live notes and a legend for its board markers */}
          {infoSquare !== null && infoPiece && twinsStagingTurns === null && (
            <PieceInfoPanel
              piece={infoPiece}
              army={armies[infoPiece.color]}
              hover={infoIsHover}
              status={infoIsHover || gameOver ? null
                : infoPiece.color !== sideToMove || !canAct
                  ? HINTS.INSPECT_WAITING
                  : (legalMovesForSelected.length === 0 ? HINTS.NO_LEGAL_MOVES : null)}
              notes={infoNotes}
              legend={infoIsHover ? undefined : infoLegend}
              action={!infoIsHover && shatterLegalForSelected && shatterPreviewSq === null ? (
                <button
                  className="btn shatter-btn"
                  onClick={() => setShatterPreviewSq(selectedSquare!)}
                  title={HINTS.TWINS_SHATTER_DESC}
                  data-testid="shatter-mode-btn"
                >
                  💥 {HINTS.SHATTER}
                </button>
              ) : null}
            />
          )}
        </div>

        {/* Chrome */}
        <div className="game-chrome">
          <CapturedPieceTray captured={captured} armies={armies} />
          <EssenceMeter essence={gameState.essence} armies={armies} essenceDelta={essenceDelta} />
          <MoveListPanel history={history} />
          <SanInput
            gameState={gameState}
            disabled={gameOver || !canAct || isStaging}
            onSubmit={turn => { cancelInteraction(); submitTurn(turn); }}
          />
        </div>
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

      {/* March preview */}
      {marchPreviewTurn !== null && (
        <MarchPreview
          turn={marchPreviewTurn}
          gameState={gameState}
          onConfirm={() => {
            submitTurn(marchPreviewTurn);
            setMarchPreviewTurn(null);
          }}
          onCancel={() => setMarchPreviewTurn(null)}
        />
      )}

      {/* Chooser sheet */}
      {chooserTurns && (
        <TurnChooser
          turns={chooserTurns}
          gameState={gameState}
          onSelect={turn => {
            // Rally variants arrive here already complete; everything else may still
            // need a preview (Rampage/March) or a rally (Twins).
            if (turn.rally !== undefined) {
              setChooserTurns(null);
              submitTurn(turn);
            } else {
              commitTurn(turn);
            }
          }}
          onCancel={() => setChooserTurns(null)}
        />
      )}

      {/* Army info + settings sheet */}
      {armyInfoOpen && (
        <ArmyInfoSheet
          armies={armies}
          onRules={onRules ? anchor => { setArmyInfoOpen(false); onRules(anchor); } : undefined}
          onClose={() => setArmyInfoOpen(false)}
          toggles={toggles}
        />
      )}

      {/* End modal */}
      {gameOver && !endDismissed && (
        <GameEndModal
          status={status}
          armies={armies}
          onReview={onReview ?? (() => {})}
          onNewGame={onNewGame}
          onRematch={onRematch}
          onUndo={canUndo ? handleUndo : undefined}
          onClose={() => setEndDismissed(true)}
          onRules={onRules}
        />
      )}
    </div>
  );
}
