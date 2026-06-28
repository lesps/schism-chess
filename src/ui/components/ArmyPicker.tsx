import type { Army } from '../../engine/types';
import { ARMIES, ARMY_ACCENTS, ARMY_NAMES, ARMY_TAGLINES } from '../shared';

interface Props {
  selected: Army | null;
  onSelect: (army: Army) => void;
}

export function ArmyPicker({ selected, onSelect }: Props) {
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
            <span
              className="army-card-name"
              style={{ color: isSelected ? accent : undefined }}
            >
              {ARMY_NAMES[army]}
            </span>
            <span className="army-card-tag">{ARMY_TAGLINES[army]}</span>
          </button>
        );
      })}
    </div>
  );
}
