import type { Army, Color } from '../../engine/types';
import { ARMY_ACCENTS } from '../shared';

interface Props {
  essence: { W: number; B: number };
  armies: { W: Army; B: Army };
}

export function EssenceMeter({ essence, armies }: Props) {
  const showW = armies.W === 'Veil';
  const showB = armies.B === 'Veil';
  if (!showW && !showB) return null;

  return (
    <div className="essence-meter">
      {showW && <EssenceRow color="W" value={essence.W} accent={ARMY_ACCENTS['Veil']} />}
      {showB && <EssenceRow color="B" value={essence.B} accent={ARMY_ACCENTS['Veil']} />}
    </div>
  );
}

function EssenceRow({ color, value, accent }: { color: Color; value: number; accent: string }) {
  return (
    <div className="essence-row" style={{ color: accent }}>
      <span className="essence-label">
        {color === 'W' ? 'White' : 'Black'} Essence
      </span>
      <div className="essence-pips" aria-label={`${value} of 4 essence`}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`essence-pip ${i <= value ? 'filled' : 'empty'}`}
          />
        ))}
      </div>
      <span className="essence-count">{value}/4</span>
    </div>
  );
}
