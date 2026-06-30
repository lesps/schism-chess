/**
 * Minimal Markdown-to-HTML renderer for RULES.md display.
 * Handles: ATX headings, paragraphs, bold, italic, inline code,
 * unordered lists, tables, blockquotes, horizontal rules, links.
 * Not a general-purpose renderer — tuned to the subset used in RULES.md.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inlineMarkdown(text: string): string {
  return text
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic (single asterisk or underscore, not part of **)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = escapeHtml(url);
      const rel = url.startsWith('http') ? ' rel="noopener noreferrer" target="_blank"' : '';
      return `<a href="${safeUrl}"${rel}>${escapeHtml(label)}</a>`;
    });
}

function renderTable(lines: string[]): string {
  const rows = lines.map(l =>
    l.split('|')
      .slice(1, -1)
      .map(cell => cell.trim()),
  );
  if (rows.length < 2) return '';

  const headerCells = rows[0].map(c => `<th>${inlineMarkdown(escapeHtml(c))}</th>`).join('');
  const bodyRows = rows
    .slice(2)
    .map(r => `<tr>${r.map(c => `<td>${inlineMarkdown(escapeHtml(c))}</td>`).join('')}</tr>`)
    .join('');

  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/** Convert markdown text to an HTML string. */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^={3,}$/.test(line.trim())) {
      output.push('<hr>');
      i++;
      continue;
    }

    // ATX heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = slugify(text);
      output.push(`<h${level} id="${id}">${inlineMarkdown(escapeHtml(text))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      output.push(`<blockquote><p>${inlineMarkdown(escapeHtml(quoteLines.join(' ')))}</p></blockquote>`);
      continue;
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const langClass = lang ? ` class="language-${lang}"` : '';
      output.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Table (starts with |)
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      output.push(renderTable(tableLines));
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(escapeHtml(lines[i].replace(/^[-*]\s/, '')))}</li>`);
        i++;
      }
      output.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: collect lines until blank
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('|') && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !/^[-*]\s/.test(lines[i]) && !/^-{3,}$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${inlineMarkdown(escapeHtml(paraLines.join(' ')))}</p>`);
    }
  }

  return output.join('\n');
}
