/** Email confirmation values stay in this page's memory, never in React's URL state. */
export const EMAIL_CONFIRMATION_PATH = '/auth/confirm';

export type EmailConfirmationLocation = {
  pathname: string;
  search: string;
  hash: string;
  replaceUrl: (url: string) => void;
};

/**
 * Reinterprets the feature prototype's fragment capture for the integrated app.
 * App initializes it before BrowserRouter renders. Reads and StrictMode remounts
 * reuse the same value; a full page reload starts with an empty capture again.
 */
export function createEmailConfirmationBootstrap() {
  let captured = false;
  let tokenHash: string | null = null;

  return {
    capture(location: EmailConfirmationLocation): void {
      if (captured || location.pathname !== EMAIL_CONFIRMATION_PATH) return;

      const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
      const candidate = fragment.get('tokenHash');
      const search = new URLSearchParams(location.search);
      // Legacy query forms are removed, but never used as confirmation credentials.
      for (const key of ['token', 'tokenHash', 'token_hash']) search.delete(key);
      const sanitizedSearch = search.toString();
      const nextSearch = sanitizedSearch ? `?${sanitizedSearch}` : '';
      if (location.hash || nextSearch !== location.search) {
        location.replaceUrl(`${location.pathname}${nextSearch}`);
      }

      // Publish only after the URL has been cleaned. No request is sent here.
      tokenHash = candidate && candidate.trim().length >= 8 ? candidate : null;
      captured = true;
    },
    readTokenHash(): string | null {
      return tokenHash;
    },
  };
}

const emailConfirmationBootstrap = createEmailConfirmationBootstrap();

/** Called at the App composition boundary, before the router reads the location. */
export function captureInitialEmailConfirmation(): void {
  if (typeof window === 'undefined') return;
  emailConfirmationBootstrap.capture({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
  });
}

export function getInitialEmailConfirmationTokenHash(): string | null {
  return emailConfirmationBootstrap.readTokenHash();
}
