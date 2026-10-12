import { useEffect, useRef } from 'react';

interface HistoryEntry {
  san: string;
}

interface Props {
  history: HistoryEntry[];
}

export function MoveListPanel({ history }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll only the list itself — scrollIntoView would also scroll the
  // (overflow-hidden) screen containers and shove the board out of view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  if (history.length === 0) {
    return (
      <div className="move-list move-list-empty">
        <div className="move-list-title">Moves</div>
        <p className="move-list-placeholder">No moves yet.</p>
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
    <div className="move-list" role="log" aria-label="Move history" ref={listRef}>
      <div className="move-list-title">Moves</div>
      <div className="move-list-pairs">
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
      </div>
    </div>
  );
}
