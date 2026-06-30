import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../utils/renderMarkdown';
import rulesContent from '../../../docs/RULES.md?raw';

interface Props {
  anchor?: string;
  onBack: () => void;
}

export function RulesScreen({ anchor, onBack }: Props) {
  const html = useMemo(() => renderMarkdown(rulesContent), []);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor || !contentRef.current) return;
    const el = contentRef.current.querySelector(`#${CSS.escape(anchor)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [anchor, html]);

  return (
    <div className="rules-screen">
      <header className="rules-header">
        <button
          className="btn btn-ghost rules-back"
          onClick={onBack}
          aria-label="Back"
        >
          ← Back
        </button>
        <h1 className="rules-header-title">Rules</h1>
      </header>
      <div
        ref={contentRef}
        className="rules-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
