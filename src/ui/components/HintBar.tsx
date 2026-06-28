interface Props {
  message: string | null;
}

export function HintBar({ message }: Props) {
  if (!message) return null;
  return (
    <div className="hint-bar" role="status" aria-live="polite">
      {message}
    </div>
  );
}
