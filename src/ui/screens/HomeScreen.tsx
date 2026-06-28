interface Props {
  onNewGame: () => void;
}

export function HomeScreen({ onNewGame }: Props) {
  return (
    <main className="home">
      <h1 className="home-title">Schism Chess</h1>
      <p className="home-subtitle">
        Six asymmetric armies. Two win conditions.<br />One board.
      </p>
      <div className="home-actions">
        <button className="btn btn-primary" onClick={onNewGame}>
          New local game
        </button>
        <button className="btn btn-secondary" disabled aria-disabled>
          Games — coming soon
        </button>
      </div>
    </main>
  );
}
