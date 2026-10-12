import type { Army, Color } from '../../engine/types';
import {
  ARMY_ACCENTS,
  ARMY_IDENTITIES,
  ARMY_NAMES,
  ARMY_RULE_ANCHORS,
  ARMY_TAGLINES,
  PIECE_COLORS,
  getPieceInfo,
  getSlotName,
} from '../shared';
import { armyRoster } from '../pieceGuide';
import { PieceIcon } from '../pieceArt';
import { useSheetKeys } from './useSheetKeys';

export interface SheetToggle {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
}

interface Props {
  armies: { W: Army; B: Army };
  onRules?: (anchor: string) => void;
  onClose: () => void;
  /** Device preferences shown under the army cards (sound, auto-rotate, …). */
  toggles?: SheetToggle[];
}

/**
 * Bottom sheet summarizing the two armies in play: name, tagline, and a
 * short identity blurb, with deep links into the full rules — plus the
 * game's display/sound settings.
 */
export function ArmyInfoSheet({ armies, onRules, onClose, toggles }: Props) {
  useSheetKeys(onClose);
  const colors: Color[] = ['W', 'B'];
  return (
    <div className="chooser-overlay" onClick={onClose} data-testid="army-info-sheet">
      <div
        className="chooser-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Armies and pieces in this game"
      >
        <div className="sheet-grip" aria-hidden />
        <div className="chooser-title">Armies &amp; pieces in this game</div>
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
                <ul className="army-roster" data-testid={`army-roster-${color}`}>
                  {armyRoster(army).map(slot => (
                    <li key={slot} className="army-roster-row">
                      <span className="army-roster-icon" style={{ color: PIECE_COLORS[army][color] }} aria-hidden>
                        <PieceIcon slot={slot} color={color} army={army} />
                      </span>
                      <span className="army-roster-text">
                        <strong>{getSlotName(slot, army)}</strong>
                        <span>{getPieceInfo(slot, army)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <details className="army-info-more">
                  <summary>How this army plays</summary>
                  <p className="army-info-identity">{ARMY_IDENTITIES[army]}</p>
                </details>
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
        {toggles && toggles.length > 0 && (
          <div className="sheet-settings">
            {toggles.map(t => (
              <label key={t.label} className="sheet-toggle">
                <span>{t.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={t.value}
                  onChange={e => t.onChange(e.target.checked)}
                  data-testid={t.testId}
                />
              </label>
            ))}
          </div>
        )}
        <button className="chooser-cancel" onClick={onClose} data-testid="army-info-close">
          Close
        </button>
      </div>
    </div>
  );
}
