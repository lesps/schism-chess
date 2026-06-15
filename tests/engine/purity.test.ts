import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function collectTsFiles(dir: string): string[] {
  try {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectTsFiles(full));
      } else if (extname(full) === '.ts') {
        files.push(full);
      }
    }
    return files;
  } catch {
    return [];
  }
}

// Matches any import from react, react-dom, or their subpaths
const REACT_IMPORT = /from\s+['"](?:react(?:-dom)?(?:\/[^'"]*)?)['"]/;

describe('engine purity', () => {
  it('src/engine has no react or react-dom imports', () => {
    const files = collectTsFiles(join(ROOT, 'src', 'engine'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      expect(content, `${file} must not import react or react-dom`).not.toMatch(
        REACT_IMPORT,
      );
    }
  });

  it('src/pbm has no react or react-dom imports', () => {
    const files = collectTsFiles(join(ROOT, 'src', 'pbm'));
    // pbm may be empty — that's fine; if files exist, they must be pure
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      expect(content, `${file} must not import react or react-dom`).not.toMatch(
        REACT_IMPORT,
      );
    }
  });
});
