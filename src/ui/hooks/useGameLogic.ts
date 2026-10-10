import { useMemo, useState } from 'react';
import type { Army, GameState, Piece, Square, Turn } from '../../engine/types';
import {
  applyTurn,
  gameStatus,
  getThreatModel,
  initialState,
  legalTurns,
  parseSfen,
  turnToSan,
} from '../../engine';
import type { GameStatus } from '../../engine/status';
import { extractCaptures, getPrimaryDest, getPrimaryFrom } from '../shared';
import { capturedFromHistory, rebuildGame } from '../gameRecord';
import type { HistoryEntry } from '../gameRecord';

export type { HistoryEntry } from '../gameRecord';

export interface GameLogic {
  gameState: GameState;
  history: HistoryEntry[];
  status: GameStatus;
  captured: { W: Piece[]; B: Piece[] };
  selectedSquare: Square | null;
  legalMovesForSelected: Turn[];
  allLegal: Turn[];
  checkedSquares: Square[];
  setSelectedSquare: (sq: Square | null) => void;
  submitTurn: (turn: Turn) => void;
  /** Take back the last turn. No-op when there is nothing to undo. */
  undo: () => void;
}

export interface GameSource {
  /** Flat per-ply SAN list to replay from the initial position (resume / import). */
  initialMoves?: readonly string[];
  /** Start from an arbitrary position instead (DEV `?sfen=` loader). */
  initialSfen?: string;
}

interface Played {
  state: GameState;
  history: HistoryEntry[];
}

function initialPlayed(armyW: Army, armyB: Army, source: GameSource): Played {
  if (source.initialSfen) return { state: parseSfen(source.initialSfen), history: [] };
  if (source.initialMoves && source.initialMoves.length > 0) {
    const { state, history } = rebuildGame(armyW, armyB, source.initialMoves);
    return { state, history };
  }
  return { state: initialState(armyW, armyB), history: [] };
}

export function useGameLogic(armyW: Army, armyB: Army, source: GameSource = {}): GameLogic {
  const [played, setPlayed] = useState<Played>(() => initialPlayed(armyW, armyB, source));
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const { state: gameState, history } = played;

  const allLegal = useMemo(() => legalTurns(gameState), [gameState]);
  const status   = useMemo(() => gameStatus(gameState),  [gameState]);
  const captured = useMemo(() => capturedFromHistory(history), [history]);

  const legalMovesForSelected = useMemo(() => {
    if (selectedSquare === null) return [];
    return allLegal.filter(t => getPrimaryFrom(t) === selectedSquare);
  }, [selectedSquare, allLegal]);

  const checkedSquares = useMemo((): Square[] => {
    const { sideToMove, armies } = gameState;
    const opponent = sideToMove === 'W' ? 'B' : 'W';
    const model = getThreatModel(armies[opponent]);
    return model.royalsInCheck(gameState, sideToMove);
  }, [gameState]);

  function submitTurn(turn: Turn) {
    const san = turnToSan(gameState, turn);
    const captures = extractCaptures(gameState, turn);
    const newState = applyTurn(gameState, turn);
    setPlayed(prev => ({
      state: newState,
      history: [...prev.history, { san, turn, stateBefore: prev.state, captures }],
    }));
    setSelectedSquare(null);
  }

  function undo() {
    setPlayed(prev => {
      const last = prev.history[prev.history.length - 1];
      if (!last) return prev;
      return { state: last.stateBefore, history: prev.history.slice(0, -1) };
    });
    setSelectedSquare(null);
  }

  return {
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
    undo,
  };
}

/** Returns turns from `allLegal` that go from `from` to `dest`. */
export function turnsForMove(allLegal: Turn[], from: Square, dest: Square): Turn[] {
  return allLegal.filter(
    t => getPrimaryFrom(t) === from && getPrimaryDest(t) === dest,
  );
}
