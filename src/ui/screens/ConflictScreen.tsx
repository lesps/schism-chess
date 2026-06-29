import type { PBMPayload } from '../../pbm/types';

interface Props {
  stored: PBMPayload;
  incoming: PBMPayload;
  onKeepStored: () => void;
  onDiscard: () => void;
}

export function ConflictScreen({ stored, incoming, onKeepStored, onDiscard }: Props) {
  const storedLast = stored.moves[stored.moves.length - 1] ?? '(no moves)';
  const incomingLast = incoming.moves[incoming.moves.length - 1] ?? '(no moves)';

  return (
    <div className="conflict-screen ng-screen">
      <div className="conflict-icon">⚠️</div>
      <h2 className="conflict-title">History conflict</h2>
      <p className="conflict-desc">
        The imported game ({incoming.moves.length} moves) would overwrite or truncate
        your stored game ({stored.moves.length} moves) for the same game ID.
        This may indicate a tampered or outdated payload.
      </p>

      <div className="conflict-compare">
        <div className="conflict-version">
          <div className="conflict-version-label">Your version</div>
          <div className="conflict-version-move">{stored.moves.length} moves</div>
          <div className="conflict-version-last">Last: <span>{storedLast}</span></div>
        </div>
        <div className="conflict-sep">vs</div>
        <div className="conflict-version">
          <div className="conflict-version-label">Incoming</div>
          <div className="conflict-version-move">{incoming.moves.length} moves</div>
          <div className="conflict-version-last">Last: <span>{incomingLast}</span></div>
        </div>
      </div>

      <div className="ng-footer" style={{ flexDirection: 'column' }}>
        <button className="btn btn-secondary" onClick={onKeepStored} data-testid="conflict-keep">
          Keep my version
        </button>
        <button className="btn btn-ghost" onClick={onDiscard} data-testid="conflict-discard">
          Discard stored — accept incoming
        </button>
      </div>
    </div>
  );
}
