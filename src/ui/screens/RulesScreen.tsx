import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  // In-page anchor links (e.g. the Table of Contents) must scroll within this
  // overlay — letting the browser handle them would rewrite location.hash,
  // which the app uses for routing (#g=, #rules).
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    e.preventDefault();
    const el = contentRef.current?.querySelector(`#${CSS.escape(href.slice(1))}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
        <button
          className="btn btn-ghost rules-top"
          onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to table of contents"
          title="Back to top"
        >
          ↑ Top
        </button>
      </header>
      <div
        ref={contentRef}
        className="rules-content"
        onClick={handleContentClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
