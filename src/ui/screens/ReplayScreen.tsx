import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import type { Army } from '../../engine/types';
import { initialState, applyTurnUnchecked } from '../../engine/index';
import { replayGame, sanToTurn, isParseError } from '../../engine/notation';
import type { PBMPayload } from '../../pbm/types';
import { Board } from '../components/Board';
import { ARMY_NAMES } from '../shared';

interface Props {
  payload: PBMPayload;
  onBack: () => void;
}

function buildStates(payload: PBMPayload): { states: GameState[]; sans: string[] } {
  const wArmy = payload.armies.W;
  const bArmy = payload.armies.B;
  if (!wArmy || !bArmy) {
    return { states: [], sans: [] };
  }
  const armyW = wArmy as Army;
  const armyB = bArmy as Army;

  const sans = [...payload.moves] as string[];
  const movePairs: Array<{ white: string; black?: string }> = [];
  for (let i = 0; i < sans.length; i += 2) {
    movePairs.push({ white: sans[i], black: sans[i + 1] });
  }

  const record = { armies: { W: armyW, B: armyB }, moves: movePairs };
  const result = replayGame(record);

  if ('moveNumber' in result) {
    return { states: [initialState(armyW, armyB)], sans: [] };
  }

  // Collect all intermediate states by re-applying moves one at a time
  const states: GameState[] = [initialState(armyW, armyB)];
  let state = initialState(armyW, armyB);
  const collectedSans: string[] = [];

  for (const san of sans) {
    const turn = sanToTurn(state, san);
    if (isParseError(turn)) break;
    state = applyTurnUnchecked(state, turn);
    states.push(state);
    collectedSans.push(san);
  }

  return { states, sans: collectedSans };
}

export function ReplayScreen({ payload, onBack }: Props) {
  const { states, sans } = useMemo(() => buildStates(payload), [payload]);
  const [idx, setIdx] = useState(states.length > 0 ? states.length - 1 : 0);

  if (states.length === 0) {
    return (
      <div className="ng-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-dim)' }}>No moves to replay yet.</p>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
      </div>
    );
  }

  const currentState = states[Math.min(idx, states.length - 1)];
  const totalMoves = sans.length;
  const wArmy = payload.armies.W as Army;
  const bArmy = payload.armies.B as Army;

  function moveLabel(): string {
    if (idx === 0) return 'Starting position';
    if (idx === states.length - 1 && payload.phase === 'finished') return 'Final position';
    const moveNum = Math.ceil(idx / 2);
    const side = idx % 2 === 1 ? '.' : '…';
    const san = sans[idx - 1] ?? '';
    return `${moveNum}${side} ${san}`;
  }

  return (
    <div className="replay-screen">
      <header className="game-header">
        <button className="game-header-home" onClick={onBack} data-testid="replay-back">←</button>
        <div className="turn-indicator">
          <div className="turn-indicator-army" style={{ color: 'var(--text-dim)', fontSize: '13px' }}>
            {ARMY_NAMES[wArmy]} vs {ARMY_NAMES[bArmy]}
          </div>
          <div className="turn-indicator-label">{moveLabel()}</div>
        </div>
      </header>

      <div className="board-wrapper">
        <Board
          gameState={currentState}
          flipped={false}
          selectedSquare={null}
          legalMovesForSelected={[]}
          lastMovePrimary={null}
          checkedSquares={[]}
          onSquareClick={() => {}}
          overlaySquares={new Map()}
          empoweredSquares={new Set()}
          exhaustedSquares={new Set()}
          invasionSquares={new Set()}
        />
      </div>

      <div className="replay-controls">
        <div className="replay-nav">
          <button
            className="btn btn-secondary replay-nav-btn"
            onClick={() => setIdx(0)}
            disabled={idx === 0}
            aria-label="Go to start"
          >
            ⏮
          </button>
          <button
            className="btn btn-secondary replay-nav-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="Previous move"
            data-testid="replay-prev"
          >
            ◀
          </button>
          <input
            type="range"
            className="replay-slider"
            min={0}
            max={totalMoves}
            value={idx}
            onChange={e => setIdx(Number(e.target.value))}
            aria-label="Move position"
            data-testid="replay-slider"
          />
          <button
            className="btn btn-secondary replay-nav-btn"
            onClick={() => setIdx(i => Math.min(totalMoves, i + 1))}
            disabled={idx === totalMoves}
            aria-label="Next move"
            data-testid="replay-next"
          >
            ▶
          </button>
          <button
            className="btn btn-secondary replay-nav-btn"
            onClick={() => setIdx(totalMoves)}
            disabled={idx === totalMoves}
            aria-label="Go to end"
          >
            ⏭
          </button>
        </div>

        <div className="replay-move-list">
          {Array.from({ length: Math.ceil(totalMoves / 2) }, (_, i) => {
            const wSan = sans[i * 2] ?? '';
            const bSan = sans[i * 2 + 1];
            const wIdx = i * 2 + 1;
            const bIdx = i * 2 + 2;
            return (
              <div key={i} className="move-pair">
                <span className="move-num">{i + 1}.</span>
                <button
                  className={`move-san white replay-move-btn${idx === wIdx ? ' replay-active' : ''}`}
                  onClick={() => setIdx(wIdx)}
                >
                  {wSan}
                </button>
                {bSan && (
                  <button
                    className={`move-san replay-move-btn${idx === bIdx ? ' replay-active' : ''}`}
                    onClick={() => setIdx(bIdx)}
                  >
                    {bSan}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
