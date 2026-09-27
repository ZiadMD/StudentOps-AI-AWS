import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tailwind drops any utility whose colour family is absent from
 * `theme.colors` without warning, and it drops a class entirely when the
 * literal string never appears in the source. Either way the class name still
 * looks correct in the editor while producing no CSS at all, which is how
 * buttons and active nav items end up invisible. This suite fails the build
 * the moment a component references a ramp the config does not define.
 */

const root = join(__dirname, '..');
const configPath = join(root, '..', 'tailwind.config.js');

/** Matches `hover:bg-ink-900` but not `focus-visible:` split at the wrong colon. */
const COLOUR_UTILITY =
  /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border|ring|divide|from|to|via|fill|stroke|decoration|outline|placeholder|caret|accent|shadow)-([a-z][a-z0-9]*)-(\d{2,3})(?![\w-])/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip this suite so its own sample strings never show up in a report.
      return entry === 'test' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function declaredFamilies(): Set<string> {
  const config = readFileSync(configPath, 'utf-8');
  const block = config.match(/colors:\s*\{([\s\S]*?)\n\s{4}\}/);
  if (!block) throw new Error('tailwind.config.js: could not locate the colors block');
  const families = new Set<string>();
  for (const line of block[1].split('\n')) {
    const name = line.match(/^\s*([a-z][a-z0-9]*)\s*:/);
    if (name) families.add(name[1]);
  }
  return families;
}

describe('tailwind colour tokens', () => {
  it('declares the ink ramp the interface text depends on', () => {
    // ink is the primary text and hairline colour. If it is ever dropped again,
    // every heading, label and dark primary button loses its styling at once.
    expect(declaredFamilies()).toContain('ink');
  });

  it('references no colour utility from an undeclared family', () => {
    const families = declaredFamilies();
    const unknown = new Map<string, Set<string>>();

    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf-8');
      for (const match of text.matchAll(COLOUR_UTILITY)) {
        const family = match[3];
        if (families.has(family)) continue;
        const sites = unknown.get(family) ?? new Set<string>();
        sites.add(file.replace(root, 'src'));
        unknown.set(family, sites);
      }
    }

    const report = [...unknown.entries()]
      .map(([family, sites]) => `${family} (used in ${[...sites].join(', ')})`)
      .join('\n  ');

    expect(
      unknown.size === 0,
      `These colour families are not declared in tailwind.config.js, so Tailwind\n` +
        `silently drops every utility that uses them:\n  ${report}\n` +
        `Add them to theme.colors or rename the usages.`,
    ).toBe(true);
  });
});
