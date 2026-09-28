// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';
import { beforeAll, describe, expect, it } from 'vitest';

const cssPath = fileURLToPath(new URL('../index.css', import.meta.url));
const configPath = fileURLToPath(new URL('../../tailwind.config.js', import.meta.url));
const source = readFileSync(cssPath, 'utf8');
let root;

beforeAll(async () => {
  const config = loadConfig(configPath);
  config.content = [{ raw: 'bg-white bg-slate-50/50 bg-slate-900 text-white text-slate-900 text-slate-500 bg-teal-50 text-teal-800 border-slate-200 divide-slate-100 hover:bg-slate-100 focus:bg-white focus:ring-slate-900 ring-offset-2 md:bg-slate-100 bg-rose-50 text-rose-700 border-rose-200', extension: 'html' }];
  const result = await postcss([tailwindcss(config)]).process('@tailwind base; @tailwind utilities;', { from: undefined });
  root = result.root;
});

function declaration(selector, property) {
  let value;
  root.walkRules(selector, rule => rule.walkDecls(property, decl => { value = decl.value; }));
  return value;
}

describe('compiled theme palette', () => {
  it('maps cards, text, forms, tables and profile statuses without changing white button text', () => {
    expect(declaration('.bg-white', 'background-color')).toContain('--theme-surface, 255 255 255');
    expect(declaration('.text-slate-900', 'color')).toContain('--theme-text-900, 15 23 42');
    expect(declaration('.text-slate-500', 'color')).toContain('--theme-text-500');
    expect(declaration('.border-slate-200', 'border-color')).toContain('--theme-border-200');
    expect(declaration('.divide-slate-100 > :not([hidden]) ~ :not([hidden])', 'border-color')).toContain('--theme-border-100');
    expect(declaration('.bg-teal-50', 'background-color')).toContain('--theme-teal-soft');
    expect(declaration('.text-teal-800', 'color')).toContain('--theme-teal-text');
    expect(declaration('.text-white', 'color')).not.toContain('--theme-');
    expect(declaration('.text-white', 'color')).toContain('255 255 255');
  });

  it('preserves opacity and interaction/responsive variants', () => {
    expect(declaration('.bg-slate-50\\/50', 'background-color')).toContain('/ 0.5');
    expect(declaration('.hover\\:bg-slate-100:hover', 'background-color')).toContain('--theme-bg-100');
    expect(declaration('.focus\\:bg-white:focus', 'background-color')).toContain('--theme-surface');
    expect(declaration('.focus\\:ring-slate-900:focus', '--tw-ring-color')).toContain('--theme-ring-900');
    expect(declaration('.md\\:bg-slate-100', 'background-color')).toContain('--theme-bg-100');
    expect(declaration('.ring-offset-2', '--tw-ring-offset-width')).toBe('2px');
  });

  it('keeps status backgrounds, borders and text independently themed', () => {
    expect(declaration('.bg-rose-50', 'background-color')).toContain('--theme-rose-soft');
    expect(declaration('.text-rose-700', 'color')).toContain('--theme-rose-text');
    expect(declaration('.border-rose-200', 'border-color')).toContain('--theme-rose-border');
  });

  it('only defines dark palette channels under html.dark and never inverts media', () => {
    const css = postcss.parse(source);
    const names = new Set();
    css.walkDecls(/^--theme-/, decl => {
      expect(decl.parent.selector).toBe('html.dark');
      names.add(decl.prop);
    });
    expect(names.size).toBeGreaterThan(50);
    root.walkDecls(decl => {
      for (const token of decl.value.matchAll(/var\((--theme-[\w-]+)/g)) expect(names.has(token[1])).toBe(true);
    });
    expect(source).not.toMatch(/filter\s*:\s*invert/);
  });
});
