import { useEffect, useRef } from 'react';

interface HistoryEntry {
  san: string;
}

interface Props {
  history: HistoryEntry[];
}

export function MoveListPanel({ history }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history.length]);

  if (history.length === 0) {
    return (
      <div className="move-list">
        <div className="move-list-title">Moves</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 4 }}>
          Game in progress — no moves yet.
        </p>
      </div>
    );
  }

  // Group into pairs (White + Black)
  const pairs: { num: number; white: string; black?: string }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: history[i].san,
      black: history[i + 1]?.san,
    });
  }
  const latestOverall = history.length - 1;

  return (
    <div className="move-list" role="log" aria-label="Move history">
      <div className="move-list-title">Moves</div>
      {pairs.map(({ num, white, black }) => {
        const whiteIdx = (num - 1) * 2;
        const blackIdx = whiteIdx + 1;
        return (
          <div key={num} className="move-pair">
            <span className="move-num">{num}.</span>
            <span className={`move-san white${whiteIdx === latestOverall ? ' latest' : ''}`}>
              {white}
            </span>
            {black !== undefined && (
              <span className={`move-san${blackIdx === latestOverall ? ' latest' : ''}`}>
                {black}
              </span>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
