import type { Army } from '../../engine/types';
import { ARMIES, ARMY_ACCENTS, ARMY_NAMES, ARMY_RULE_ANCHORS, ARMY_TAGLINES } from '../shared';

interface Props {
  selected: Army | null;
  onSelect: (army: Army) => void;
  onRules?: (anchor: string) => void;
}

export function ArmyPicker({ selected, onSelect, onRules }: Props) {
  // The rules "?" is a sibling of the card button (overlaid via CSS), not a
  // child — nesting a button inside a button is invalid HTML and confuses
  // assistive tech and test locators.
  return (
    <div className="army-grid">
      {ARMIES.map(army => {
        const accent = ARMY_ACCENTS[army];
        const isSelected = selected === army;
        return (
          <div key={army} className="army-card-wrap">
            <button
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
              </div>
              <span className="army-card-tag">{ARMY_TAGLINES[army]}</span>
            </button>
            {onRules && (
              <button
                className="army-card-rules-link"
                onClick={() => onRules(ARMY_RULE_ANCHORS[army])}
                aria-label={`Rules for ${ARMY_NAMES[army]}`}
                title={`Rules for ${ARMY_NAMES[army]}`}
              >
                ?
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
