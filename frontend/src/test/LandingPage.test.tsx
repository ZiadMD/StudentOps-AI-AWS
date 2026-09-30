import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LandingPage } from '../components/landing/LandingPage';
import { LANDING_CONTENT } from '../components/landing/content';

/**
 * These cover the wiring rather than the design: that the page takes its
 * language from the app instead of holding its own, that the entry points
 * resolve to real routes, and that the copy does not drift back to the three
 * claims that were not true of the backend.
 */

/**
 * Reduced motion is forced on, so the loader, the typing loop and the
 * scripted counters all settle immediately instead of running on rAF.
 */
function mockMatchMedia(matches: Record<string, boolean> = { '(prefers-reduced-motion: reduce)': true }) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: matches[query] ?? false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList,
  );
}

/** happy-dom implements neither of these, and both are used by the page. */
function stubEnvironment() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
    } as unknown as typeof IntersectionObserver,
  );
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.scrollTo = () => undefined;
  Element.prototype.animate = () =>
    ({ cancel: () => undefined, finish: () => undefined }) as unknown as Animation;
}

beforeEach(() => {
  mockMatchMedia();
  stubEnvironment();
  // The loader is dismissed, so the sections under test are in the DOM.
  sessionStorage.setItem('studentops_landing_seen', '1');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderLanding(props: Partial<Parameters<typeof LandingPage>[0]> = {}) {
  return render(<LandingPage language="en" onToggleLanguage={() => undefined} {...props} />);
}

describe('LandingPage', () => {
  it('renders the headline and every section anchor', () => {
    renderLanding();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Run your org.');
    expect(document.getElementById('features')).toBeInTheDocument();
    expect(document.getElementById('roles')).toBeInTheDocument();
    expect(document.getElementById('agent')).toBeInTheDocument();
    expect(document.getElementById('finale')).toBeInTheDocument();
  });

  it('points sign-in and sign-up at real auth routes, not at placeholders', () => {
    renderLanding();

    const links = [...document.querySelectorAll('a[href]')].map(link => link.getAttribute('href') ?? '');
    expect(links).toContain('/login');

    // The Figma original used `href="#"` throughout the footer, which rendered
    // a column of links that went nowhere.
    expect(links).not.toContain('#');
    expect(links.every(href => href.startsWith('/') || href.startsWith('#'))).toBe(true);
  });

  it('sends a signed-in visitor to their workspace instead of to sign in', () => {
    const { container } = renderLanding({ signedIn: true });

    // Both header actions go to the workspace. The footer keeps a static
    // sign-in link, which is fine, so this asserts on the header.
    const header = container.querySelector('header');
    expect(header?.querySelector('a[href="/app/dashboard"]')).toBeInTheDocument();
    expect(header?.querySelector('a[href="/login"]')).toBeNull();
  });

  it('uses the app language rather than holding its own', async () => {
    const onToggleLanguage = vi.fn();
    const { container, rerender } = render(
      <LandingPage language="en" onToggleLanguage={onToggleLanguage} />,
    );

    expect(container.querySelector('.lo-root')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('group chats.');

    // Simulates the toggle firing in LanguageContext and re-rendering the tree
    // with the new language.
    rerender(<LandingPage language="ar" onToggleLanguage={onToggleLanguage} />);

    await waitFor(() => {
      expect(container.querySelector('.lo-root')).toHaveAttribute('dir', 'rtl');
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مجموعات الواتساب.');
  });

  it('sets a document title in the active language', () => {
    renderLanding();
    expect(document.title).toContain('group chats');

    cleanup();
    renderLanding({ language: 'ar' });
    expect(document.title).toContain('ستودنت‌أوبس');
  });

  describe('copy accuracy', () => {
    /**
     * Every string in the page, flattened.
     *
     * `FeatureStage` mounts only the feature that is currently on screen, so
     * asserting against rendered output would silently skip four of the five
     * feature bodies — the exact copy these tests exist to protect. Reading
     * the content source checks all of them.
     */
    function allCopy(): string {
      return JSON.stringify(LANDING_CONTENT);
    }

    it('does not claim a midnight automation run', () => {
      // The scheduler polls every 300s and the task cycle is deadline
      // relative, so "at 12:00 AM it checks" is not what the service does.
      expect(allCopy()).not.toMatch(/12:00\s*AM/i);
      expect(allCopy()).not.toMatch(/midnight/i);
    });

    it('does not claim Google Meet marks attendance', () => {
      // GoogleMeetAttendanceProvider.get_raw_meeting_attendance is a stub that
      // returns None; attendance is recorded by HR against a session.
      expect(allCopy()).not.toMatch(/Meet integration marks/i);
      expect(allCopy()).toMatch(/HR records who attended/i);
      expect(allCopy()).toMatch(/provider seam/i);
    });

    it('quotes the real behaviour scale, not a month-over-month delta', () => {
      // scoring_service returns no historical series, so "up 9 points from
      // last month" cannot be computed from anything this system holds.
      expect(allCopy()).not.toMatch(/up 9 points/i);
      expect(allCopy()).toMatch(/out of 23/);
    });

    it('says reminders are queued for approval rather than sent', () => {
      // Every outbound message is written with status PENDING_APPROVAL and
      // passes the HITL gate, so copy that implies an automatic send is
      // wrong even though the automation itself does run unattended.
      expect(allCopy()).toMatch(/approve before anything is sent/i);
      expect(allCopy()).toMatch(/waits for your confirmation first/i);
    });

    it('uses the five roles the backend actually enforces', () => {
      const copy = allCopy();
      for (const role of ['Member', 'Committee HR', 'Committee Head', 'HR Leader', 'Regional / Vice HR']) {
        expect(copy).toContain(role);
      }
    });

    it('carries no emoji and no invented metrics', () => {
      const copy = allCopy();
      // Emoji, and the percentage-delta shape the anti-slop rules forbid.
      expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(copy).not.toMatch(/\+\d+%/);
    });
  });

  describe('reduced motion', () => {
    it('answers a suggestion in full rather than streaming it', async () => {
      renderLanding();

      screen.getByRole('button', { name: 'Show attendance' }).click();

      await waitFor(() => {
        expect(document.body.textContent).toMatch(/two present, two missed/i);
      });
    });

    it('stacks the week scene instead of leaving it a clipped horizontal track', () => {
      const { container } = renderLanding();

      // The week scene is a pinned horizontal band driven by scroll position.
      // With motion reduced there is no pin, so the track must stack and fit
      // the viewport. Left as `w-max` in an `overflow: hidden` section it is
      // four viewport widths wide and every panel past the first is clipped
      // away — a full-height empty band.
      const track = container.querySelector('section [dir="ltr"].flex');
      expect(track).toBeInTheDocument();
      expect(track?.className).not.toContain('w-max');
      expect(track?.className).toContain('w-full');

      const panels = [...(track?.children ?? [])];
      expect(panels.length).toBeGreaterThanOrEqual(3);
      for (const panel of panels) {
        expect(panel.className).not.toContain('shrink-0');
      }
    });

    it('renders the final counters rather than a stuck zero', () => {
      const { container } = renderLanding();

      // The counts climb from 0 on scroll, which does not happen here, so
      // they have to be rendered at their final value or the section reads
      // as "0 unread messages".
      const scene = container.querySelector('section[aria-label]');
      expect(scene?.textContent).toContain('47');
      expect(scene?.textContent).toContain('0');
    });

    it('installs no custom cursor', () => {
      const { container } = renderLanding();

      // A JS-tracked cursor on a device that has asked for less motion is
      // strictly worse than the native one.
      expect(container.querySelector('.lo-cursor-dot')).toBeNull();
      expect(container.querySelector('.lo-root')?.className).not.toContain('lo-has-cursor');
    });
  });
});
