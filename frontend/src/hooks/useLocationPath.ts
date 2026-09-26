import { useEffect, useState } from 'react';

/**
 * Route table.
 *
 * The app is a single-page workspace with a handful of public routes. Keeping
 * this as plain data means `App` can render a real 404 and the auth guard can
 * redirect without duplicating path strings.
 */
export const ROUTES = {
  landing: '/',
  login: '/login',
  signup: '/signup',
  app: '/app',
} as const;

/** Normalises aliases, strips trailing slashes and maps the bare app root. */
export function canonicalPath(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/';
  if (['/signin', '/sign-in', '/loginor'].includes(clean)) return ROUTES.login;
  if (['/sign-up', '/sign%20up', '/register', '/sign up'].includes(clean)) return ROUTES.signup;
  if (clean === ROUTES.app || clean === '/app/') return '/app/dashboard';
  return clean.toLowerCase();
}

/** Pushes a path without a full page load, then restores scroll to the top. */
export function navigate(path: string, replace = false) {
  const target = canonicalPath(path);
  if (window.location.pathname === target) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/** Subscribes to history changes. */
export function useLocationPath() {
  const [path, setPath] = useState(() => canonicalPath(window.location.pathname));

  useEffect(() => {
    const update = () => setPath(canonicalPath(window.location.pathname));
    window.addEventListener('popstate', update);

    // Rewrite aliased URLs once so the address bar matches the rendered view.
    const canonical = canonicalPath(window.location.pathname);
    if (canonical !== window.location.pathname) {
      window.history.replaceState(null, '', canonical);
    }

    return () => window.removeEventListener('popstate', update);
  }, []);

  return path;
}

/** True when the path is an authenticated workspace route. */
export function isAppPath(path: string): boolean {
  return path === ROUTES.app || path.startsWith('/app/');
}
