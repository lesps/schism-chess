import { useEffect, useRef } from 'react';
import type { GameStatus } from '../../engine/status';
import type { Army, Color } from '../../engine/types';
import { ARMY_ACCENTS, ARMY_NAMES } from '../shared';

const WIN_CONDITION_RULE_ANCHOR = 'win-conditions';
const DRAWS_RULE_ANCHOR = 'draws';

interface Props {
  status: GameStatus;
  armies: { W: Army; B: Army };
  onReview: () => void;
  onNewGame: () => void;
  /** Local games: play again with the same armies. */
  onRematch?: () => void;
  /** Local games: take back the final move. */
  onUndo?: () => void;
  /** Dismiss the modal to look at the final position. */
  onClose?: () => void;
  onRules?: (anchor: string) => void;
}

export function GameEndModal({ status, armies, onReview, onNewGame, onRematch, onUndo, onClose, onRules }: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { primaryRef.current?.focus(); }, []);

  if (status.type === 'ongoing') return null;

  const { icon, title, subtitle, accent } = buildContent(status, armies);
  const rulesAnchor = status.type === 'draw' ? DRAWS_RULE_ANCHOR : WIN_CONDITION_RULE_ANCHOR;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal
      aria-label="Game over"
      onKeyDown={e => { if (e.key === 'Escape') onClose?.(); }}
    >
      <div className="modal" style={{ ['--modal-accent' as string]: accent ?? 'var(--text-dim)' }}>
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label="View the board" title="View the board">
            ✕
          </button>
        )}
        <div className="modal-icon">{icon}</div>
        <h2 className="modal-title" style={{ color: accent ?? undefined }}>
          {title}
        </h2>
        <p className="modal-subtitle">{subtitle}</p>
        <div className="modal-actions">
          {onRematch ? (
            <>
              <button ref={primaryRef} className="btn btn-primary" onClick={onRematch} data-testid="rematch">
                Rematch
              </button>
              <button className="btn btn-secondary" onClick={onNewGame}>
                New game
              </button>
            </>
          ) : (
            <button ref={primaryRef} className="btn btn-primary" onClick={onNewGame}>
              New game
            </button>
          )}
          <button className="btn btn-ghost" onClick={onReview}>
            Review moves
          </button>
          {onUndo && (
            <button className="btn btn-ghost" onClick={onUndo} data-testid="modal-undo">
              ↶ Undo last move
            </button>
          )}
          {onRules && (
            <button
              className="btn btn-ghost btn-small"
              onClick={() => onRules(rulesAnchor)}
            >
              See rules →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Content {
  icon: string;
  title: string;
  subtitle: string;
  accent: string | null;
}

/** One-line result, e.g. "The Crown wins by checkmate" — for banners and lists. */
export function resultSummary(status: GameStatus, armies: { W: Army; B: Army }): string {
  if (status.type === 'ongoing') return '';
  if (status.type === 'draw') {
    const how = { threefold: 'threefold repetition', 'fifty-move': 'the fifty-move rule', material: 'insufficient material' };
    return `Draw by ${how[status.by]}`;
  }
  const how = { checkmate: 'checkmate', invasion: 'invasion', 'stalemate-loss': 'stalemate' };
  const side = status.winner === 'W' ? 'White' : 'Black';
  return `${ARMY_NAMES[armies[status.winner]]} (${side}) wins by ${how[status.by]}`;
}

function buildContent(
  status: Exclude<GameStatus, { type: 'ongoing' }>,
  armies: { W: Army; B: Army },
): Content {
  if (status.type === 'draw') {
    const subtitles: Record<typeof status.by, string> = {
      'threefold':  'Position repeated three times.',
      'fifty-move': 'Fifty moves without a pawn move or capture.',
      'material':   'Insufficient material to checkmate.',
    };
    return {
      icon:     '🤝',
      title:    'Draw',
      subtitle: subtitles[status.by],
      accent:   null,
    };
  }

  const winner: Color = status.winner;
  const loser: Color  = winner === 'W' ? 'B' : 'W';
  const winArmy       = armies[winner];
  const loseArmy      = armies[loser];
  const winName       = ARMY_NAMES[winArmy];
  const accent        = ARMY_ACCENTS[winArmy];
  const winnerSide    = winner === 'W' ? 'White' : 'Black';
  const loserSide     = loser === 'W' ? 'White' : 'Black';

  switch (status.by) {
    case 'checkmate':
      return {
        icon:     '♛',
        title:    `${winName} wins`,
        subtitle: `${loserSide} ${ARMY_NAMES[loseArmy]} is checkmated.`,
        accent,
      };
    case 'invasion':
      return {
        icon:     '🏴',
        title:    `${winName} wins`,
        subtitle: armies[winner] === 'Twins'
          ? `Both ${winnerSide} Warlords cross the midline — invasion!`
          : `The ${winnerSide} king crosses the midline — invasion!`,
        accent,
      };
    case 'stalemate-loss':
      return {
        icon:     '⛔',
        title:    `${winName} wins`,
        subtitle: `${loserSide} has no legal moves — stalemate is a loss.`,
        accent,
      };
  }
}
