import { useState } from 'react';
import type { Army, Color } from '../../engine/types';
import type { PBMPayload } from '../../pbm/types';
import { respondToCommit } from '../../pbm/index';
import { transport } from '../../app/transport';
import { ArmyPicker } from '../components/ArmyPicker';

interface Props {
  payload: PBMPayload;
  onBack: () => void;
  onShare: (payload: PBMPayload) => void;
}

export function PBMRespondScreen({ payload, onBack, onShare }: Props) {
  const [label, setLabel] = useState('');
  const [army, setArmy] = useState<Army | null>(null);

  const creatorColor = payload.commit.by;
  const respondentColor: Color = creatorColor === 'W' ? 'B' : 'W';
  const creatorLabel = creatorColor === 'W'
    ? (payload.white.label || 'Opponent')
    : (payload.black.label || 'Opponent');

  function handleRespond() {
    if (!army) return;
    const responded = respondToCommit(payload, label || 'Player 2', army);
    transport.saveGame(responded.gameId, responded);
    transport.saveMeta(responded.gameId, { myColor: respondentColor });
    sessionStorage.setItem('lastPBMGameId', responded.gameId);
    onShare(responded);
  }

  return (
    <div className="ng-screen">
      <div className="ng-header">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <h2>Respond to challenge</h2>
      </div>

      <div className="pbm-info-card">
        <div className="pbm-info-row">
          <span className="pbm-info-label">From</span>
          <span className="pbm-info-value">{creatorLabel}</span>
        </div>
        <div className="pbm-info-row">
          <span className="pbm-info-label">Their color</span>
          <span className="pbm-info-value">{creatorColor === 'W' ? 'White' : 'Black'}</span>
        </div>
        <div className="pbm-info-row">
          <span className="pbm-info-label">Your color</span>
          <span className="pbm-info-value">{respondentColor === 'W' ? 'White' : 'Black'}</span>
        </div>
      </div>

      <div className="pbm-form">
        <label className="pbm-label">Your name</label>
        <input
          className="pbm-input"
          placeholder="e.g. Bob"
          value={label}
          onChange={e => setLabel(e.target.value)}
          data-testid="respond-label"
        />
      </div>

      <div className="ng-player-label" style={{ marginTop: '8px' }}>
        Choose your army (in the clear — the protocol allows this)
      </div>
      <ArmyPicker selected={army} onSelect={setArmy} />

      <div className="ng-footer">
        <button
          className="btn btn-primary"
          disabled={army === null}
          onClick={handleRespond}
          data-testid="respond-submit"
        >
          Respond &amp; Share →
        </button>
      </div>
    </div>
  );
}
