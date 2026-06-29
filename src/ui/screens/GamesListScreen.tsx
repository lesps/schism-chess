import type { PBMPayload } from '../../pbm/types';
import { transport } from '../../app/transport';
import { ARMY_NAMES } from '../shared';
import type { Army } from '../../engine/types';

interface GameRow {
  id: string;
  payload: PBMPayload;
}

interface Props {
  onBack: () => void;
  onResume: (gameId: string) => void;
  onImport: () => void;
  onReplay: (gameId: string) => void;
}

function armyLabel(army: Army | undefined): string {
  return army ? ARMY_NAMES[army] : 'Sealed';
}

function phaseLabel(payload: PBMPayload): string {
  if (payload.phase === 'finished') return 'Finished';
  if (payload.phase === 'commit') return 'Waiting for response';
  if (payload.phase === 'reveal') return 'Waiting for reveal';
  // play phase
  const side = payload.moves.length % 2 === 0 ? 'White' : 'Black';
  return `${side} to move`;
}

function gameTitle(payload: PBMPayload): string {
  const w = payload.white.label || 'White';
  const b = payload.black.label || 'Black';
  return `${w} vs ${b}`;
}

export function GamesListScreen({ onBack, onResume, onImport, onReplay }: Props) {
  const rows: GameRow[] = transport.listGames().sort(
    (a, b) => (b.payload.moves.length - a.payload.moves.length),
  );

  function handleDelete(id: string) {
    transport.deleteGame(id);
    // Force re-render by reloading (simple approach)
    window.location.reload();
  }

  return (
    <div className="ng-screen">
      <div className="ng-header">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <h2>Games</h2>
      </div>

      {rows.length === 0 && (
        <div className="games-empty">
          <p>No saved games.</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Start a local game or create a play-by-mail game to see it here.
          </p>
        </div>
      )}

      <div className="games-list">
        {rows.map(({ id, payload }) => {
          const wArmy = armyLabel(payload.armies.W);
          const bArmy = armyLabel(payload.armies.B);
          const finished = payload.phase === 'finished';
          return (
            <div key={id} className="game-row" data-testid={`game-row-${id}`}>
              <div className="game-row-info">
                <div className="game-row-title">{gameTitle(payload)}</div>
                <div className="game-row-armies">
                  <span className="game-row-army white">{wArmy}</span>
                  <span className="game-row-sep">vs</span>
                  <span className="game-row-army black">{bArmy}</span>
                </div>
                <div className="game-row-status">{phaseLabel(payload)}</div>
                {payload.result && (
                  <div className="game-row-result">Result: {payload.result}</div>
                )}
              </div>
              <div className="game-row-actions">
                {!finished && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '13px', padding: '6px 12px' }}
                    onClick={() => onResume(id)}
                    data-testid={`resume-${id}`}
                  >
                    Resume
                  </button>
                )}
                {(finished || payload.phase === 'play') && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '13px', padding: '6px 12px' }}
                    onClick={() => onReplay(id)}
                    data-testid={`replay-${id}`}
                  >
                    Review
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '13px', padding: '6px 8px', color: 'var(--text-muted)' }}
                  onClick={() => handleDelete(id)}
                  data-testid={`delete-${id}`}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ng-footer">
        <button className="btn btn-secondary" onClick={onImport} data-testid="import-game">
          Import game link
        </button>
      </div>
    </div>
  );
}
