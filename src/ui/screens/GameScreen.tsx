import { useState } from 'react';
import type { Army, Square, Turn } from '../../engine/types';
import { Board, getDestinationsForOrigin } from '../components/Board';
import { CapturedPieceTray } from '../components/CapturedPieceTray';
import { EssenceMeter } from '../components/EssenceMeter';
import { GameEndModal } from '../components/GameEndModal';
import { MoveListPanel } from '../components/MoveListPanel';
import { TurnChooser } from '../components/TurnChooser';
import { useGameLogic, turnsForMove } from '../hooks/useGameLogic';
import { ARMY_ACCENTS, ARMY_NAMES, getPrimaryFrom } from '../shared';

interface Props {
  armyW: Army;
  armyB: Army;
  initialSfen?: string;
  onHome: () => void;
  onNewGame: () => void;
}

export function GameScreen({ armyW, armyB, initialSfen, onHome, onNewGame }: Props) {
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
    submitTurn,
  } = logic;

  const [chooserTurns, setChooserTurns] = useState<Turn[] | null>(null);
  const [autoFlip, setAutoFlip] = useState(true);
  const [locked, setLocked] = useState(false); // manual lock toggle
  const [manualFlipped, setManualFlipped] = useState(false);

  const flipped = autoFlip && !locked
    ? gameState.sideToMove === 'B'
    : manualFlipped;

  const lastEntry = history[history.length - 1] ?? null;
  const lastMovePrimary = lastEntry?.turn.primary ?? null;

  function handleSquareClick(sq: Square) {
    if (status.type !== 'ongoing') return;

    if (selectedSquare !== null) {
      // Try sq as a destination for the selected piece
      const destTurns = turnsForMove(allLegal, selectedSquare, sq);
      if (destTurns.length > 0) {
        if (destTurns.length === 1) {
          submitTurn(destTurns[0]);
        } else {
          setChooserTurns(destTurns);
          setSelectedSquare(null);
        }
        return;
      }

      // Not a valid destination — try selecting a new piece
      const piece = gameState.board[sq];
      if (piece && piece.color === gameState.sideToMove) {
        // Only re-select if the sq has legal moves (avoid selecting trapped pieces and giving feedback)
        const hasMoves = allLegal.some(t => getPrimaryFrom(t) === sq);
        if (hasMoves) {
          setSelectedSquare(sq);
          return;
        }
      }

      // Deselect
      setSelectedSquare(null);
      return;
    }

    // No piece selected — try to select one
    const piece = gameState.board[sq];
    if (piece && piece.color === gameState.sideToMove) {
      const hasMoves = allLegal.some(t => getPrimaryFrom(t) === sq);
      if (hasMoves) setSelectedSquare(sq);
    }
  }

  // Determine which squares have any legal moves from selected (for destinations map)
  const destinationsMap = selectedSquare !== null
    ? getDestinationsForOrigin(legalMovesForSelected, selectedSquare)
    : new Map<Square, Turn[]>();
  void destinationsMap; // used by Board via legalMovesForSelected

  const { sideToMove, armies } = gameState;
  const movingArmy = armies[sideToMove];
  const movingArmyColor = ARMY_ACCENTS[movingArmy];
  const sideLabel = sideToMove === 'W' ? 'White' : 'Black';

  function handleFlipToggle() {
    if (autoFlip) {
      // Disable auto-flip, lock current orientation
      setAutoFlip(false);
      setLocked(true);
      setManualFlipped(gameState.sideToMove === 'B');
    } else {
      if (locked) {
        setLocked(false);
        setManualFlipped(prev => !prev);
      } else {
        setAutoFlip(true);
      }
    }
  }

  const flipLabel = autoFlip ? '⟳' : (locked ? '🔒' : '↕');

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

      {/* Board */}
      <div className="board-wrapper">
        <Board
          gameState={gameState}
          flipped={flipped}
          selectedSquare={selectedSquare}
          legalMovesForSelected={legalMovesForSelected}
          lastMovePrimary={lastMovePrimary}
          checkedSquares={checkedSquares}
          onSquareClick={handleSquareClick}
        />
      </div>

      {/* Chrome */}
      <div className="game-chrome">
        <CapturedPieceTray captured={captured} armies={armies} />
        <EssenceMeter essence={gameState.essence} armies={armies} />
        <MoveListPanel history={history} />
      </div>

      {/* Chooser sheet */}
      {chooserTurns && (
        <TurnChooser
          turns={chooserTurns}
          gameState={gameState}
          onSelect={turn => {
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
          onReview={() => {/* keep modal visible, just dismiss it */}}
          onNewGame={onNewGame}
        />
      )}
    </div>
  );
}
