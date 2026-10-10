import { useState } from 'react';
import type { Army, Color } from '../../engine/types';
import type { PBMPayload } from '../../pbm/types';
import { createGame } from '../../pbm/index';
import { browserHasher, generateSalt } from '../../app/hasher';
import { persistGame } from '../../app/transport';
import { ArmyPicker } from '../components/ArmyPicker';

type Step = 'labels' | 'color' | 'privacy' | 'army' | 'creating';

interface Props {
  onBack: () => void;
  onShare: (payload: PBMPayload) => void;
  onRules?: (anchor: string) => void;
}

export function PBMCreateScreen({ onBack, onShare, onRules }: Props) {
  const [step, setStep] = useState<Step>('labels');
  const [creatorLabel, setCreatorLabel] = useState('');
  const [opponentLabel, setOpponentLabel] = useState('');
  const [color, setColor] = useState<Color | null>(null);
  const [army, setArmy] = useState<Army | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!army || !color) return;
    setStep('creating');
    setError(null);
    try {
      const salt = generateSalt();
      const payload = await createGame(
        creatorLabel.trim() || 'Player 1',
        color,
        army,
        salt,
        browserHasher,
        opponentLabel.trim(),
      );
      // The salt stays on this device until the reveal
      persistGame(payload.gameId, payload, { myColor: color, commit: { army, salt } });
      onShare(payload);
    } catch (err) {
      setError(String(err));
      setStep('army');
    }
  }

  switch (step) {
    case 'labels':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={onBack}>← Back</button>
            <h2>New play-by-mail game</h2>
          </div>
          <div className="pbm-form">
            <label className="pbm-label" htmlFor="creator-label">Your name</label>
            <input
              className="pbm-input"
              placeholder="e.g. Alice"
              value={creatorLabel}
              onChange={e => setCreatorLabel(e.target.value)}
              id="creator-label"
              data-testid="creator-label"
            />
            <label className="pbm-label" htmlFor="opponent-label">Opponent's name <span className="pbm-label-hint">(optional — they can change it)</span></label>
            <input
              className="pbm-input"
              placeholder="e.g. Bob"
              value={opponentLabel}
              onChange={e => setOpponentLabel(e.target.value)}
              id="opponent-label"
              data-testid="opponent-label"
            />
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              onClick={() => setStep('color')}
              data-testid="labels-next"
            >
              Next →
            </button>
          </div>
        </div>
      );

    case 'color':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('labels')}>← Back</button>
            <h2>Choose your color</h2>
          </div>
          <div className="color-pick">
            <button
              className={`color-btn${color === 'W' ? ' selected' : ''}`}
              onClick={() => setColor('W')}
              data-testid="pick-white"
            >
              <span className="color-btn-piece">♔</span>
              <span className="color-btn-label">White</span>
              <span className="color-btn-desc">Moves first</span>
            </button>
            <button
              className={`color-btn${color === 'B' ? ' selected' : ''}`}
              onClick={() => setColor('B')}
              data-testid="pick-black"
            >
              <span className="color-btn-piece">♚</span>
              <span className="color-btn-label">Black</span>
              <span className="color-btn-desc">Moves second</span>
            </button>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              disabled={color === null}
              onClick={() => setStep('privacy')}
              data-testid="color-next"
            >
              Next →
            </button>
          </div>
        </div>
      );

    case 'privacy':
      return (
        <div className="ng-screen">
          <div className="privacy-card" style={{ flex: 1 }}>
            <div className="privacy-icon">🙈</div>
            <h3>Shield the screen</h3>
            <p>
              Your army choice will be committed as a cryptographic hash.
              Keep it secret until your opponent has responded.
            </p>
            <p className="privacy-warning">
              ⚠ Don't clear browser data before your opponent responds —
              your sealed army choice is stored only on this device.
            </p>
          </div>
          <div className="ng-footer">
            <button className="btn btn-primary" onClick={() => setStep('army')} data-testid="privacy-ready">
              I'm ready →
            </button>
          </div>
        </div>
      );

    case 'army':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('privacy')}>← Back</button>
            <h2>Choose your army</h2>
          </div>
          <ArmyPicker selected={army} onSelect={setArmy} onRules={onRules} />
          {error && <div className="import-error" role="alert">{error}</div>}
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              disabled={army === null}
              onClick={handleCreate}
              data-testid="create-game"
            >
              Create &amp; Share →
            </button>
          </div>
        </div>
      );

    case 'creating':
      return (
        <div className="ng-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '14px' }}>Creating game…</div>
        </div>
      );
  }
}
