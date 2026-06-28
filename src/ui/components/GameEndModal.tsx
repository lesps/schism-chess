import type { GameStatus } from '../../engine/status';
import type { Army, Color } from '../../engine/types';
import { ARMY_ACCENTS, ARMY_NAMES } from '../shared';

interface Props {
  status: GameStatus;
  armies: { W: Army; B: Army };
  onReview: () => void;
  onNewGame: () => void;
}

export function GameEndModal({ status, armies, onReview, onNewGame }: Props) {
  if (status.type === 'ongoing') return null;

  const { icon, title, subtitle, accent } = buildContent(status, armies);

  return (
    <div className="modal-overlay" role="dialog" aria-modal aria-label="Game over">
      <div className="modal">
        <div className="modal-icon">{icon}</div>
        <h2 className="modal-title" style={{ color: accent ?? undefined }}>
          {title}
        </h2>
        <p className="modal-subtitle">{subtitle}</p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onNewGame}>
            New game
          </button>
          <button className="btn btn-ghost" onClick={onReview}>
            Review board
          </button>
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
        subtitle: 'The king crosses the midline — invasion!',
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
