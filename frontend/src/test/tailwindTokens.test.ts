import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tailwind drops any utility whose colour family is absent from the resolved
 * theme, and it never warns. A class name that looks perfectly correct in the
 * editor can therefore emit no CSS at all, which is how a primary button or an
 * active nav item ends up invisible while every test still passes.
 *
 * This suite resolves the real PostCSS build rather than parsing the config, so
 * it stays correct regardless of how the palette is declared: through
 * `theme.colors`, through per-property keys such as `textColor`, or through
 * theme variables. Anything the build drops is reported here.
 *
 * It needs `dist/assets/*.css`, so run a build first (`npm run build`). The test
 * is skipped rather than failed when the build output is absent.
 */

const srcDir = join(__dirname, '..');
const root = join(srcDir, '..');
const distDir = join(root, 'dist', 'assets');

/** Utilities that resolve a colour: `bg-`, `text-`, `border-`, `ring-`, and so on. */
const UTILITIES =
  'bg|text|border|ring|divide|from|to|via|fill|stroke|decoration|outline|placeholder|caret|accent|shadow';

/**
 * Captures a colour utility and keeps the full variant chain, so
 * `focus-visible:ring-blue-600` is not misread as `visible:ring-blue-600`.
 */
const COLOUR_UTILITY = new RegExp(
  String.raw`(?<![\w-])((?:[a-z-]+:)*)(${UTILITIES})-([a-z][a-z0-9]*)-(\d{2,3})(?![\w-])`,
  'g',
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip this suite so its own sample strings never appear in a report.
      return entry === 'test' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function builtStylesheet(): string | null {
  if (!existsSync(distDir)) return null;
  const sheets = readdirSync(distDir).filter(name => name.endsWith('.css'));
  if (sheets.length === 0) return null;
  return sheets.map(name => readFileSync(join(distDir, name), 'utf-8')).join('\n');
}

/** Tailwind escapes the colon in variant-prefixed class names on output. */
function isEmitted(css: string, className: string): boolean {
  return css.includes(`.${className}`)
    || css.includes(`.${className.split(':').join('\\:')}`);
}

const css = builtStylesheet();

describe.skipIf(css === null)('tailwind colour utilities', () => {
  it('emits CSS for every colour utility referenced in src/', () => {
    if (css === null) return;

    const unresolved = new Map<string, Set<string>>();

    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf-8');
      for (const match of text.matchAll(COLOUR_UTILITY)) {
        const className = match[0];
        if (isEmitted(css, className)) continue;
        const sites = unresolved.get(className) ?? new Set<string>();
        sites.add(file.replace(srcDir, 'src'));
        unresolved.set(className, sites);
      }
    }

    const report = [...unresolved.entries()]
      .map(([className, sites]) => `${className} (${[...sites].join(', ')})`)
      .join('\n  ');

    expect(
      unresolved.size === 0,
      `Tailwind generated no CSS for these colour utilities, so the elements they\n` +
        `are applied to will render unstyled:\n  ${report}\n` +
        `Declare the colour family in tailwind.config.js, or rename the usage.`,
    ).toBe(true);
  });
});
