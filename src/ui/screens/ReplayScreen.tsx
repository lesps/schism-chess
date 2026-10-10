import { useEffect, useMemo, useState } from 'react';
import type { Army, GameState } from '../../engine/types';
import { gameStatus, getThreatModel } from '../../engine/index';
import type { PBMPayload } from '../../pbm/types';
import { Board } from '../components/Board';
import { resultSummary } from '../components/GameEndModal';
import { ARMY_ACCENTS, ARMY_NAMES } from '../shared';
import { rebuildGame } from '../gameRecord';
import type { HistoryEntry } from '../gameRecord';

interface Props {
  payload: PBMPayload;
  onBack: () => void;
}

interface Frames {
  states: GameState[];
  history: HistoryEntry[];
}

function buildFrames(payload: PBMPayload): Frames {
  const wArmy = payload.armies.W;
  const bArmy = payload.armies.B;
  if (!wArmy || !bArmy) return { states: [], history: [] };
  const { state, history } = rebuildGame(wArmy as Army, bArmy as Army, payload.moves);
  return { states: [...history.map(h => h.stateBefore), state], history };
}

function checkedRoyals(state: GameState) {
  const opponent = state.sideToMove === 'W' ? 'B' : 'W';
  return getThreatModel(state.armies[opponent]).royalsInCheck(state, state.sideToMove);
}

export function ReplayScreen({ payload, onBack }: Props) {
  const { states, history } = useMemo(() => buildFrames(payload), [payload]);
  const [idx, setIdx] = useState(states.length > 0 ? states.length - 1 : 0);
  const [flipped, setFlipped] = useState(false);
  const totalMoves = history.length;

  // ←/→ step, Home/End jump, F flips
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // the slider handles its own keys
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(totalMoves, i + 1));
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(totalMoves);
      else if (e.key === 'f' || e.key === 'F') setFlipped(f => !f);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalMoves]);

  const finalStatus = useMemo(
    () => (states.length > 0 ? gameStatus(states[states.length - 1]) : null),
    [states],
  );

  if (states.length === 0) {
    return (
      <div className="ng-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-dim)' }}>No moves to replay yet.</p>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
      </div>
    );
  }

  const currentState = states[Math.min(idx, states.length - 1)];
  const lastPrimary = idx > 0 ? history[idx - 1].turn.primary : null;
  const wArmy = payload.armies.W as Army;
  const bArmy = payload.armies.B as Army;
  const atEnd = idx === states.length - 1;

  function moveLabel(): string {
    if (idx === 0) return 'Starting position';
    const moveNum = Math.ceil(idx / 2);
    const side = idx % 2 === 1 ? '.' : '…';
    const san = history[idx - 1]?.san ?? '';
    return `${moveNum}${side} ${san}`;
  }

  const result = atEnd && finalStatus && finalStatus.type !== 'ongoing'
    ? resultSummary(finalStatus, { W: wArmy, B: bArmy })
    : null;

  return (
    <div className="replay-screen">
      <header className="game-header">
        <button className="icon-btn game-header-home" onClick={onBack} aria-label="Back" data-testid="replay-back">←</button>
        <div className="turn-indicator">
          <div className="turn-indicator-text">
            <div className="turn-indicator-army replay-title">
              <span style={{ color: ARMY_ACCENTS[wArmy] }}>{ARMY_NAMES[wArmy]}</span>
              <span className="replay-vs"> vs </span>
              <span style={{ color: ARMY_ACCENTS[bArmy] }}>{ARMY_NAMES[bArmy]}</span>
            </div>
            <div className="turn-indicator-label">{moveLabel()}</div>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setFlipped(f => !f)}
          aria-label="Flip board"
          title="Flip board (F)"
        >
          ⇅
        </button>
      </header>

      <div className="game-body">
        <div className="board-area">
          <div className="board-wrapper">
            <Board
              gameState={currentState}
              flipped={flipped}
              selectedSquare={null}
              legalMovesForSelected={[]}
              lastMovePrimary={lastPrimary}
              checkedSquares={checkedRoyals(currentState)}
              onSquareClick={() => {}}
              interactive={false}
            />
          </div>
        </div>

        <div className="context-strip">
          {result && <div className="game-over-banner" data-testid="replay-result"><span>{result}</span></div>}
          {atEnd && !result && payload.phase !== 'finished' && (
            <div className="hint-bar">Game in progress — this is the latest position.</div>
          )}
        </div>

        <div className="game-chrome replay-controls">
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

          <div className="move-list replay-move-list">
            <div className="move-list-pairs">
              {Array.from({ length: Math.ceil(totalMoves / 2) }, (_, i) => {
                const wSan = history[i * 2]?.san ?? '';
                const bSan = history[i * 2 + 1]?.san;
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
      </div>
    </div>
  );
}
