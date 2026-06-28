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

export interface HistoryEntry {
  san: string;
  turn: Turn;
  stateBefore: GameState;
}

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
}

function makeInitialState(armyW: Army, armyB: Army, initialSfen?: string): GameState {
  if (initialSfen) {
    return parseSfen(initialSfen);
  }
  return initialState(armyW, armyB);
}

export function useGameLogic(
  armyW: Army,
  armyB: Army,
  initialSfen?: string,
): GameLogic {
  const [gameState, setGameState] = useState<GameState>(() =>
    makeInitialState(armyW, armyB, initialSfen),
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [captured, setCaptured] = useState<{ W: Piece[]; B: Piece[] }>({ W: [], B: [] });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const allLegal = useMemo(() => legalTurns(gameState), [gameState]);
  const status   = useMemo(() => gameStatus(gameState),  [gameState]);

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
    const caps = extractCaptures(gameState, turn);
    const newState = applyTurn(gameState, turn);

    setHistory(prev => [...prev, { san, turn, stateBefore: gameState }]);
    setCaptured(prev => ({
      W: [...prev.W, ...caps.filter(p => p.color === 'W')],
      B: [...prev.B, ...caps.filter(p => p.color === 'B')],
    }));
    setGameState(newState);
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
  };
}

/** Returns turns from `allLegal` that go from `from` to `dest`. */
export function turnsForMove(allLegal: Turn[], from: Square, dest: Square): Turn[] {
  return allLegal.filter(
    t => getPrimaryFrom(t) === from && getPrimaryDest(t) === dest,
  );
}
