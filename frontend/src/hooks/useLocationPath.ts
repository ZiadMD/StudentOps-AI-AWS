import { useEffect, useState } from 'react';

export function canonicalPath(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/';
  if (['/signin', '/sign-in', '/loginor'].includes(clean)) return '/login';
  if (['/sign-up', '/sign%20up', '/register'].includes(clean)) return '/signup';
  if (clean === '/app') return '/app/dashboard';
  return clean;
}

export function navigate(path: string, replace = false) {
  const target = canonicalPath(path);
  if (window.location.pathname === target) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function useLocationPath() {
  const [path, setPath] = useState(() => canonicalPath(window.location.pathname));
  useEffect(() => {
    const update = () => setPath(canonicalPath(window.location.pathname));
    window.addEventListener('popstate', update);
    const canonical = canonicalPath(window.location.pathname);
    if (canonical !== window.location.pathname) navigate(canonical, true);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}
