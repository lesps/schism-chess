interface Props {
  onNewLocalGame: () => void;
  onNewPBMGame: () => void;
  onGamesList: () => void;
  onImport: () => void;
  onRules: () => void;
}

export function HomeScreen({ onNewLocalGame, onNewPBMGame, onGamesList, onImport, onRules }: Props) {
  return (
    <main className="home">
      <h1 className="home-title">Schism Chess</h1>
      <p className="home-subtitle">
        Six asymmetric armies. Two win conditions.<br />One board.
      </p>
      <div className="home-actions">
        <button className="btn btn-primary" onClick={onNewLocalGame} data-testid="new-local-game">
          New local game
        </button>
        <button className="btn btn-secondary" onClick={onNewPBMGame} data-testid="new-pbm-game">
          Play by mail
        </button>
        <button className="btn btn-secondary" onClick={onImport} data-testid="import-link">
          Import game link
        </button>
        <button className="btn btn-ghost" onClick={onGamesList} data-testid="games-list">
          My games
        </button>
        <button className="btn btn-ghost" onClick={onRules} data-testid="rules-link">
          Rules
        </button>
      </div>
    </main>
  );
}
