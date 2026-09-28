import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginPage } from '../components/auth/LoginPage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const layout = readFileSync(join(__dirname, '..', 'components', 'auth', 'AuthLayout.tsx'), 'utf-8');
const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8');

describe('auth panel scroll behaviour', () => {
  it('never gives the panel its own scroll container', () => {
    render(<LoginPage onLogin={function() {}} onGoToRegister={function() {}} />);
    const panel = document.querySelector('.auth-panel')!;
    // The reported fault: a wide but short window forced the panel into a
    // fixed-height scroller of its own, so the page and the panel scrolled
    // separately and the panel clipped.
    expect(panel.className).not.toContain('overflow-y-auto');
    expect(panel.className).not.toContain('overflow-auto');
    expect(layout).not.toContain('lg:h-dvh');
  });

  it('pins the panel to the viewport only from lg upward', () => {
    const sticky = css.match(/@media \(min-width: 1024px\) \{\s*\.auth-panel \{([^}]*)\}/);
    expect(sticky).not.toBeNull();
    expect(sticky![1]).toContain('position: sticky');
    expect(sticky![1]).toContain('top: 0');
    expect(sticky![1]).toContain('100dvh');
  });

  it('leaves the base panel unclipped so mobile is not cut off', () => {
    const base = css.match(/^\.auth-panel \{([^}]*)\}/m);
    expect(base).not.toBeNull();
    expect(base![1]).toContain('overflow: hidden');
  });
});
