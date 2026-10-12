import type { Army } from '../../engine/types';
import { ARMIES, ARMY_ACCENTS, ARMY_NAMES, PIECE_COLORS } from '../shared';
import { PieceIcon } from '../pieceArt';

export interface ContinueInfo {
  gameId: string;
  armyW: Army;
  armyB: Army;
  detail: string;
  isLocal: boolean;
}

interface Props {
  continueGame?: ContinueInfo | null;
  onContinue?: (gameId: string) => void;
  onNewLocalGame: () => void;
  onNewPBMGame: () => void;
  onGamesList: () => void;
  onImport: () => void;
  onRules: () => void;
}

export function HomeScreen({ continueGame, onContinue, onNewLocalGame, onNewPBMGame, onGamesList, onImport, onRules }: Props) {
  return (
    <main className="home">
      <div className="home-hero">
        <div className="home-emblems" aria-hidden>
          {ARMIES.map((army, i) => (
            <span
              key={army}
              className="home-emblem"
              style={{ color: PIECE_COLORS[army].W, animationDelay: `${i * 70}ms` }}
              title={ARMY_NAMES[army]}
            >
              <PieceIcon slot={army === 'Twins' ? 'K' : 'Q'} color="W" army={army} />
            </span>
          ))}
        </div>
        <h1 className="home-title">Schism Chess</h1>
        <p className="home-subtitle">
          Six asymmetric armies. Two win conditions.<br />One board.
        </p>
      </div>
      <div className="home-actions">
        {continueGame && onContinue && (
          <button
            className="btn continue-card"
            onClick={() => onContinue(continueGame.gameId)}
            data-testid="continue-game"
          >
            <span className="continue-card-label">Continue {continueGame.isLocal ? 'local game' : 'game'}</span>
            <span className="continue-card-armies">
              <span style={{ color: ARMY_ACCENTS[continueGame.armyW] }}>{ARMY_NAMES[continueGame.armyW]}</span>
              <span className="continue-card-vs">vs</span>
              <span style={{ color: ARMY_ACCENTS[continueGame.armyB] }}>{ARMY_NAMES[continueGame.armyB]}</span>
            </span>
            <span className="continue-card-detail">{continueGame.detail}</span>
          </button>
        )}
        <button className="btn btn-primary" onClick={onNewLocalGame} data-testid="new-local-game">
          New local game
        </button>
        <button className="btn btn-secondary" onClick={onNewPBMGame} data-testid="new-pbm-game">
          Play by mail
        </button>
        <button className="btn btn-secondary" onClick={onImport} data-testid="import-link">
          Import game link
        </button>
        <div className="home-links">
          <button className="btn btn-ghost" onClick={onGamesList} data-testid="games-list">
            My games
          </button>
          <button className="btn btn-ghost" onClick={onRules} data-testid="rules-link">
            Rules
          </button>
        </div>
      </div>
    </main>
  );
}
