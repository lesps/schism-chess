import { useEffect, useRef, useState } from 'react';
import type { Army, Color } from '../../engine/types';
import { ARMY_ACCENTS } from '../shared';

interface Props {
  essence: { W: number; B: number };
  armies: { W: Army; B: Army };
  essenceDelta?: { color: Color; from: number; to: number } | undefined;
}

export function EssenceMeter({ essence, armies, essenceDelta }: Props) {
  const showW = armies.W === 'Veil';
  const showB = armies.B === 'Veil';
  if (!showW && !showB) return null;

  return (
    <div className="essence-meter">
      {showW && (
        <EssenceRow
          color="W"
          value={essence.W}
          accent={ARMY_ACCENTS['Veil']}
          delta={essenceDelta?.color === 'W' ? essenceDelta.to - essenceDelta.from : 0}
        />
      )}
      {showB && (
        <EssenceRow
          color="B"
          value={essence.B}
          accent={ARMY_ACCENTS['Veil']}
          delta={essenceDelta?.color === 'B' ? essenceDelta.to - essenceDelta.from : 0}
        />
      )}
    </div>
  );
}

interface RowProps {
  color: Color;
  value: number;
  accent: string;
  delta: number;
}

function EssenceRow({ color, value, accent, delta }: RowProps) {
  const [tickKey, setTickKey] = useState(0);
  const prevDeltaRef = useRef(0);

  useEffect(() => {
    if (delta !== 0 && delta !== prevDeltaRef.current) {
      setTickKey((k: number) => k + 1);
    }
    prevDeltaRef.current = delta;
  }, [delta]);

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
      {delta !== 0 && tickKey > 0 && (
        <span
          key={tickKey}
          className={`essence-tick ${delta > 0 ? 'gain' : 'loss'}`}
          aria-hidden
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}
