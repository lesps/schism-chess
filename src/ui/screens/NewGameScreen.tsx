import { useState } from 'react';
import type { Army } from '../../engine/types';
import { ArmyPicker } from '../components/ArmyPicker';
import { ARMY_ACCENTS, ARMY_NAMES, ARMY_TAGLINES } from '../shared';

type Step = 'p1-privacy' | 'p1-pick' | 'handover' | 'p2-privacy' | 'p2-pick' | 'reveal';

interface Props {
  onStart: (armyW: Army, armyB: Army) => void;
  onBack: () => void;
}

export function NewGameScreen({ onStart, onBack }: Props) {
  const [step, setStep] = useState<Step>('p1-privacy');
  const [armyW, setArmyW] = useState<Army | null>(null);
  const [armyB, setArmyB] = useState<Army | null>(null);

  switch (step) {
    case 'p1-privacy':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={onBack}>← Back</button>
            <h2>New game</h2>
          </div>
          <div className="ng-player-label">Player 1</div>
          <div className="privacy-card">
            <div className="privacy-icon">🙈</div>
            <h3>Shield the screen</h3>
            <p>Keep your army choice private. Tap when you are ready to pick.</p>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              onClick={() => setStep('p1-pick')}
            >
              {'I\'m ready →'}
            </button>
          </div>
        </div>
      );

    case 'p1-pick':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('p1-privacy')}>← Back</button>
            <h2>Choose your army</h2>
          </div>
          <div className="ng-player-label">Player 1 (White)</div>
          <ArmyPicker selected={armyW} onSelect={setArmyW} />
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              disabled={armyW === null}
              onClick={() => setStep('handover')}
            >
              Done →
            </button>
          </div>
        </div>
      );

    case 'handover':
      return (
        <div className="ng-screen">
          <div className="privacy-card" style={{ flex: 1 }}>
            <div className="privacy-icon">📱</div>
            <h3>Hand to Player 2</h3>
            <p>Player 1 has chosen. Pass the device to your opponent.</p>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              onClick={() => setStep('p2-privacy')}
            >
              Player 2 is ready →
            </button>
          </div>
        </div>
      );

    case 'p2-privacy':
      return (
        <div className="ng-screen">
          <div className="ng-player-label">Player 2</div>
          <div className="privacy-card">
            <div className="privacy-icon">🙈</div>
            <h3>Shield the screen</h3>
            <p>Keep your army choice private. Tap when you are ready to pick.</p>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              onClick={() => setStep('p2-pick')}
            >
              {'I\'m ready →'}
            </button>
          </div>
        </div>
      );

    case 'p2-pick':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('p2-privacy')}>← Back</button>
            <h2>Choose your army</h2>
          </div>
          <div className="ng-player-label">Player 2 (Black)</div>
          <ArmyPicker selected={armyB} onSelect={setArmyB} />
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              disabled={armyB === null}
              onClick={() => setStep('reveal')}
            >
              Done →
            </button>
          </div>
        </div>
      );

    case 'reveal': {
      const w = armyW ?? 'Crown';
      const b = armyB ?? 'Crown';
      return (
        <div className="ng-screen">
          <h2 style={{ textAlign: 'center', fontWeight: 700 }}>Your armies</h2>
          <div className="reveal-armies">
            <div className="reveal-slot">
              <div className="reveal-slot-label">Player 1 — White</div>
              <ArmyRevealCard army={w} />
            </div>
            <div className="reveal-slot">
              <div className="reveal-slot-label">Player 2 — Black</div>
              <ArmyRevealCard army={b} />
            </div>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setArmyW(null);
                setArmyB(null);
                setStep('p1-privacy');
              }}
            >
              Start over
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onStart(w, b)}
              data-testid="start-game"
            >
              Start game →
            </button>
          </div>
        </div>
      );
    }
  }
}

function ArmyRevealCard({ army }: { army: Army }) {
  const accent = ARMY_ACCENTS[army];
  return (
    <div className="reveal-army-card" style={{ borderColor: accent }}>
      <div className="reveal-army-name" style={{ color: accent }}>
        {ARMY_NAMES[army]}
      </div>
      <div className="reveal-army-tag">{ARMY_TAGLINES[army]}</div>
    </div>
  );
}
