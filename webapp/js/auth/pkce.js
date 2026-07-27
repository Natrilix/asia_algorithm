/**
 * Microsoft Entra ID sign-in, authorisation code flow with PKCE.
 *
 * Written directly against the protocol rather than pulling in MSAL: the whole
 * app is meant to deploy as static files with no build step and no vendored
 * megabytes, and the SPA flow is small enough to read in one sitting. Entra's
 * token endpoint sends CORS headers for apps registered with a "Single-page
 * application" redirect URI, so the code exchange happens in the browser.
 *
 * Tokens are held in `sessionStorage`: they die with the tab, and never touch
 * `localStorage` where they would outlive the clinician's session.
 */

const STORAGE_PREFIX = 'isncsci.auth.';

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export class EntraAuth {
  /**
   * @param {{tenantId: string, clientId: string, scopes: string[], redirectUri?: string}} options
   */
  constructor(options) {
    this.tenantId = options.tenantId;
    this.clientId = options.clientId;
    this.scopes = options.scopes ?? [];
    this.redirectUri = options.redirectUri ?? defaultRedirectUri();
    this.authority = `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0`;
    this.storageKey = `${STORAGE_PREFIX}${this.clientId}`;
  }

  isConfigured() {
    return Boolean(this.tenantId && this.clientId);
  }

  /* ------------------------------------------------------------ token store */

  readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(this.storageKey) ?? 'null');
    } catch (error) {
      return null;
    }
  }

  writeSession(session) {
    sessionStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  signOut() {
    sessionStorage.removeItem(this.storageKey);
  }

  /* --------------------------------------------------------------- redirect */

  /**
   * Call once at start-up. If the page was loaded as the redirect target this
   * completes the code exchange and cleans the code out of the address bar.
   * @returns {Promise<boolean>} true when a sign-in was completed here
   */
  async handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const stateParam = params.get('state');
    const error = params.get('error');

    if (error) {
      clearAuthParams();
      throw new Error(params.get('error_description') || error);
    }
    if (!code || !stateParam) {
      return false;
    }

    const pending = JSON.parse(sessionStorage.getItem(`${this.storageKey}.pending`) ?? 'null');
    sessionStorage.removeItem(`${this.storageKey}.pending`);
    clearAuthParams();

    if (!pending || pending.state !== stateParam) {
      throw new Error('Sign-in response did not match the request. Please try again.');
    }

    const tokens = await this.exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: pending.verifier,
    });
    this.store(tokens);
    return true;
  }

  /** Sends the browser to Entra to sign in. Does not return. */
  async signIn() {
    const verifier = randomString();
    const state = randomString(16);
    sessionStorage.setItem(`${this.storageKey}.pending`, JSON.stringify({ verifier, state }));

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: [...this.scopes, 'offline_access', 'openid', 'profile'].join(' '),
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256',
    });
    window.location.assign(`${this.authority}/authorize?${params.toString()}`);
  }

  /* ------------------------------------------------------------------ token */

  /**
   * A valid access token, refreshing silently when possible. Throws
   * `SignInRequiredError` when the user has to interact.
   */
  async getAccessToken() {
    const session = this.readSession();
    if (session && session.expiresAt - 60_000 > Date.now()) {
      return session.accessToken;
    }
    if (session?.refreshToken) {
      try {
        const tokens = await this.exchange({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        });
        this.store(tokens);
        return this.readSession().accessToken;
      } catch (error) {
        this.signOut();
      }
    }
    throw new SignInRequiredError();
  }

  async exchange(extra) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      scope: [...this.scopes, 'offline_access'].join(' '),
      ...extra,
    });
    const response = await fetch(`${this.authority}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || `Sign-in failed (${response.status}).`);
    }
    return payload;
  }

  store(tokens) {
    this.writeSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? this.readSession()?.refreshToken ?? '',
      expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    });
  }
}

export class SignInRequiredError extends Error {
  constructor() {
    super('Sign-in required.');
    this.name = 'SignInRequiredError';
  }
}

function defaultRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function clearAuthParams() {
  const url = new URL(window.location.href);
  for (const key of ['code', 'state', 'session_state', 'error', 'error_description', 'error_uri']) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, url.toString());
}
