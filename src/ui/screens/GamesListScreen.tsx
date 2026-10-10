import { useState } from 'react';
import type { PBMPayload } from '../../pbm/types';
import { transport } from '../../app/transport';
import type { LocalGameMeta } from '../../app/transport';
import { ARMY_ACCENTS, ARMY_NAMES } from '../shared';
import type { Army, Color } from '../../engine/types';

interface GameRow {
  id: string;
  payload: PBMPayload;
  meta: LocalGameMeta | null;
}

interface Props {
  onBack: () => void;
  /** Open the game at whatever step it needs next (play, share, respond, reveal). */
  onOpen: (gameId: string) => void;
  onImport: () => void;
  onReplay: (gameId: string) => void;
}

function armyLabel(army: Army | undefined): string {
  return army ? ARMY_NAMES[army] : 'Sealed';
}

function loadRows(): GameRow[] {
  return transport.listGames()
    .map(({ id, payload }) => ({ id, payload, meta: transport.loadMeta(id) }))
    .sort((a, b) => (b.meta?.updatedAt ?? 0) - (a.meta?.updatedAt ?? 0) || b.payload.moves.length - a.payload.moves.length);
}

function statusLabel({ payload, meta }: GameRow): { text: string; yourTurn: boolean } {
  if (payload.phase === 'finished') return { text: resultText(payload, meta), yourTurn: false };
  if (payload.phase === 'commit') {
    return meta?.commit
      ? { text: 'Challenge sent — waiting for a response', yourTurn: false }
      : { text: 'Challenge received — pick your army', yourTurn: true };
  }
  if (payload.phase === 'reveal') {
    return meta && meta.myColor !== payload.commit.by
      ? { text: 'Response sent — waiting for the reveal', yourTurn: false }
      : { text: 'Response received — tap to reveal', yourTurn: true };
  }
  const toMove: Color = payload.moves.length % 2 === 0 ? 'W' : 'B';
  if (!meta || meta.isLocal) return { text: `${toMove === 'W' ? 'White' : 'Black'} to move`, yourTurn: false };
  return toMove === meta.myColor
    ? { text: 'Your move', yourTurn: true }
    : { text: 'Their move', yourTurn: false };
}

function resultText(payload: PBMPayload, meta: LocalGameMeta | null): string {
  if (meta && !meta.isLocal && payload.result && payload.result !== '1/2-1/2') {
    const winner: Color = payload.result === '1-0' ? 'W' : 'B';
    return winner === meta.myColor ? 'You won' : 'You lost';
  }
  switch (payload.result) {
    case '1-0': return 'White won';
    case '0-1': return 'Black won';
    case '1/2-1/2': return 'Draw';
    default: return 'Finished';
  }
}

function gameTitle({ payload, meta }: GameRow): string {
  if (meta?.isLocal) return 'Local game';
  if (meta) {
    const opp = meta.myColor === 'W' ? payload.black.label : payload.white.label;
    return `vs ${opp || 'Opponent'} · you play ${meta.myColor === 'W' ? 'White' : 'Black'}`;
  }
  return `${payload.white.label || 'White'} vs ${payload.black.label || 'Black'}`;
}

function timeAgo(ts: number | undefined): string | null {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function GamesListScreen({ onBack, onOpen, onImport, onReplay }: Props) {
  const [rows, setRows] = useState<GameRow[]>(loadRows);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    transport.deleteGame(id);
    setConfirmDelete(null);
    setRows(loadRows());
  }

  return (
    <div className="ng-screen">
      <div className="ng-header">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <h2>My games</h2>
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
        {rows.map(row => {
          const { id, payload, meta } = row;
          const finished = payload.phase === 'finished';
          const status = statusLabel(row);
          const ago = timeAgo(meta?.updatedAt);
          return (
            <div key={id} className={`game-row${status.yourTurn ? ' your-turn' : ''}`} data-testid={`game-row-${id}`}>
              <button
                className="game-row-info"
                onClick={() => (finished ? onReplay(id) : onOpen(id))}
                aria-label={`${gameTitle(row)} — ${status.text}`}
              >
                <span className="game-row-title">{gameTitle(row)}</span>
                <span className="game-row-armies">
                  <span className="game-row-army" style={{ color: payload.armies.W ? ARMY_ACCENTS[payload.armies.W] : undefined }}>
                    {armyLabel(payload.armies.W)}
                  </span>
                  <span className="game-row-sep">vs</span>
                  <span className="game-row-army" style={{ color: payload.armies.B ? ARMY_ACCENTS[payload.armies.B] : undefined }}>
                    {armyLabel(payload.armies.B)}
                  </span>
                </span>
                <span className="game-row-status">
                  {status.yourTurn && <span className="your-turn-dot" aria-hidden />}
                  {status.text}
                  {payload.moves.length > 0 && ` · ${payload.moves.length} ${payload.moves.length === 1 ? 'ply' : 'plies'}`}
                  {ago && ` · ${ago}`}
                </span>
              </button>
              <div className="game-row-actions">
                {!finished && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => onOpen(id)}
                    data-testid={`resume-${id}`}
                  >
                    {payload.phase === 'play' ? 'Resume' : 'Open'}
                  </button>
                )}
                {(finished || payload.phase === 'play') && (
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => onReplay(id)}
                    data-testid={`replay-${id}`}
                  >
                    Review
                  </button>
                )}
                <button
                  className={`btn btn-ghost btn-small game-row-delete${confirmDelete === id ? ' confirming' : ''}`}
                  onClick={() => handleDelete(id)}
                  onBlur={() => setConfirmDelete(c => (c === id ? null : c))}
                  aria-label={confirmDelete === id ? 'Confirm delete' : 'Delete game'}
                  data-testid={`delete-${id}`}
                >
                  {confirmDelete === id ? 'Delete?' : '✕'}
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
