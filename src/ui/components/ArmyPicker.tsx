import type { Army } from '../../engine/types';
import { ARMIES, ARMY_ACCENTS, ARMY_NAMES, ARMY_TAGLINES } from '../shared';

const ARMY_RULE_ANCHORS: Record<Army, string> = {
  Crown:   '1-the-crown',
  Phantom: '2-the-phantom',
  Accord:  '3-the-accord',
  Twins:   '4-the-twins',
  Veil:    '5-the-veil',
  Wild:    '6-the-wild',
};

interface Props {
  selected: Army | null;
  onSelect: (army: Army) => void;
  onRules?: (anchor: string) => void;
}

export function ArmyPicker({ selected, onSelect, onRules }: Props) {
  return (
    <div className="army-grid">
      {ARMIES.map(army => {
        const accent = ARMY_ACCENTS[army];
        const isSelected = selected === army;
        return (
          <button
            key={army}
            className={`army-card${isSelected ? ' selected' : ''}`}
            style={{
              borderColor: isSelected ? accent : undefined,
            }}
            onClick={() => onSelect(army)}
            aria-pressed={isSelected}
            aria-label={ARMY_NAMES[army]}
          >
            <div className="army-card-header">
              <span
                className="army-card-name"
                style={{ color: isSelected ? accent : undefined }}
              >
                {ARMY_NAMES[army]}
              </span>
              {onRules && (
                <button
                  className="army-card-rules-link"
                  onClick={e => { e.stopPropagation(); onRules(ARMY_RULE_ANCHORS[army]); }}
                  aria-label={`Rules for ${ARMY_NAMES[army]}`}
                  tabIndex={0}
                >
                  ?
                </button>
              )}
            </div>
            <span className="army-card-tag">{ARMY_TAGLINES[army]}</span>
          </button>
        );
      })}
    </div>
  );
}
