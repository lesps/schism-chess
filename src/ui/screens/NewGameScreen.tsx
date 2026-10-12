import { useState } from 'react';
import type { Army } from '../../engine/types';
import { ArmyPicker } from '../components/ArmyPicker';
import { ARMIES, ARMY_ACCENTS, ARMY_NAMES, ARMY_TAGLINES, PIECE_COLORS } from '../shared';
import { PieceIcon } from '../pieceArt';

type Step = 'p1-pick' | 'handover' | 'p2-pick' | 'reveal';

interface Props {
  onStart: (armyW: Army, armyB: Army) => void;
  onBack: () => void;
  onRules?: (anchor: string) => void;
}

function randomArmy(): Army {
  return ARMIES[Math.floor(Math.random() * ARMIES.length)];
}

export function NewGameScreen({ onStart, onBack, onRules }: Props) {
  const [step, setStep] = useState<Step>('p1-pick');
  const [armyW, setArmyW] = useState<Army | null>(null);
  const [armyB, setArmyB] = useState<Army | null>(null);

  switch (step) {
    case 'p1-pick':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={onBack}>← Back</button>
            <h2>Choose your army</h2>
          </div>
          <div className="ng-player-label">Player 1 (White) · keep your pick hidden from Player 2</div>
          <ArmyPicker selected={armyW} onSelect={setArmyW} onRules={onRules} />
          <div className="ng-footer">
            <button className="btn btn-secondary" onClick={() => setArmyW(randomArmy())} data-testid="random-army">
              🎲 Random
            </button>
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
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('p1-pick')}>← Back</button>
          </div>
          <div className="privacy-card" style={{ flex: 1 }}>
            <div className="privacy-icon">🙈</div>
            <h3>Pass to Player 2</h3>
            <p>Player 1 has chosen. Hand over the device — Player 2, keep your choice hidden too.</p>
          </div>
          <div className="ng-footer">
            <button
              className="btn btn-primary"
              onClick={() => setStep('p2-pick')}
            >
              Player 2 is ready →
            </button>
          </div>
        </div>
      );

    case 'p2-pick':
      return (
        <div className="ng-screen">
          <div className="ng-header">
            <button className="btn btn-ghost" onClick={() => setStep('handover')}>← Back</button>
            <h2>Choose your army</h2>
          </div>
          <div className="ng-player-label">Player 2 (Black)</div>
          <ArmyPicker selected={armyB} onSelect={setArmyB} onRules={onRules} />
          <div className="ng-footer">
            <button className="btn btn-secondary" onClick={() => setArmyB(randomArmy())} data-testid="random-army">
              🎲 Random
            </button>
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
        <div className="ng-screen reveal-screen">
          <h2 className="reveal-title">The armies are revealed</h2>
          <div className="reveal-armies">
            <div className="reveal-slot">
              <div className="reveal-slot-label">Player 1 — White</div>
              <ArmyRevealCard army={w} />
            </div>
            <div className="reveal-vs" aria-hidden>vs</div>
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
                setStep('p1-pick');
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
      <span className="reveal-army-icon" style={{ color: PIECE_COLORS[army].W }} aria-hidden>
        <PieceIcon slot={army === 'Twins' ? 'K' : 'Q'} color="W" army={army} />
      </span>
      <div className="reveal-army-name" style={{ color: accent }}>
        {ARMY_NAMES[army]}
      </div>
      <div className="reveal-army-tag">{ARMY_TAGLINES[army]}</div>
    </div>
  );
}
