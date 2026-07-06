import type { Army, Color } from '../../engine/types';
import {
  ARMY_ACCENTS,
  ARMY_IDENTITIES,
  ARMY_NAMES,
  ARMY_RULE_ANCHORS,
  ARMY_TAGLINES,
} from '../shared';

interface Props {
  armies: { W: Army; B: Army };
  onRules?: (anchor: string) => void;
  onClose: () => void;
}

/**
 * Bottom sheet summarizing the two armies in play: name, tagline, and a
 * short identity blurb, with deep links into the full rules.
 */
export function ArmyInfoSheet({ armies, onRules, onClose }: Props) {
  const colors: Color[] = ['W', 'B'];
  return (
    <div className="chooser-overlay" onClick={onClose} data-testid="army-info-sheet">
      <div
        className="chooser-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Armies in this game"
      >
        <div className="chooser-title">Armies in this game</div>
        <div className="army-info-list">
          {colors.map(color => {
            const army = armies[color];
            const accent = ARMY_ACCENTS[army];
            return (
              <div key={color} className="army-info-card" style={{ borderColor: accent }}>
                <div className="army-info-header">
                  <span className="army-info-name" style={{ color: accent }}>
                    {ARMY_NAMES[army]}
                  </span>
                  <span className="army-info-side">{color === 'W' ? 'White' : 'Black'}</span>
                </div>
                <div className="army-info-tagline">{ARMY_TAGLINES[army]}</div>
                <p className="army-info-identity">{ARMY_IDENTITIES[army]}</p>
                {onRules && (
                  <button
                    className="army-info-rules-link"
                    onClick={() => onRules(ARMY_RULE_ANCHORS[army])}
                    data-testid={`army-info-rules-${color}`}
                  >
                    Full rules →
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="army-info-win">
          Win by checkmate — or walk your King (both Warlords, for the Twins)
          across the dashed midline while not in check. Stalemate loses.
        </p>
        <button className="chooser-cancel" onClick={onClose} data-testid="army-info-close">
          Close
        </button>
      </div>
    </div>
  );
}
