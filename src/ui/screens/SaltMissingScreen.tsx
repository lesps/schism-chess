interface Props {
  opponentLabel: string;
  onForfeit: () => void;
  onBack: () => void;
}

export function SaltMissingScreen({ opponentLabel, onForfeit, onBack }: Props) {
  return (
    <div className="ng-screen salt-missing-screen" data-testid="salt-missing">
      <div className="conflict-icon">🔑</div>
      <h2 className="conflict-title">Army commitment lost</h2>
      <p className="conflict-desc">
        Your opponent ({opponentLabel}) has responded, but the sealed army choice
        you made when creating this game is no longer stored on this device.
        This can happen if browser storage was cleared.
      </p>
      <div className="privacy-card" style={{ flex: 0 }}>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center' }}>
          You cannot reveal your army or continue this game without the original
          salt. If you forfeit, the game record is deleted from this device.
        </p>
      </div>
      <div className="ng-footer" style={{ flexDirection: 'column' }}>
        <button className="btn btn-secondary" onClick={onBack} data-testid="salt-back">
          ← Back
        </button>
        <button className="btn btn-ghost" onClick={onForfeit} data-testid="salt-forfeit">
          Forfeit &amp; delete game
        </button>
      </div>
    </div>
  );
}
