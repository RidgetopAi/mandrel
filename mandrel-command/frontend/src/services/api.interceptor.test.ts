/**
 * Task 10669bdd — discriminating 401 interceptor (Command-UI logout-loop fix).
 *
 * THE BUG:
 *   The global axios response interceptor in services/api.ts force-logged-out
 *   (cleared the token + hard-redirect to /login) on ANY 401. One dashboard
 *   widget call (`/projects/sessions/all`) 401ing on a transient stale token
 *   therefore destroyed the whole session → logout loop on the laptop.
 *
 * THE FIX:
 *   Only an AUTH-CRITICAL 401 (login/logout/profile/refresh/me) forces a
 *   logout. A non-critical 401 fails that one call gracefully and the session
 *   survives.
 *
 * WHAT THIS PROVES:
 *   - isAuthCriticalUrl() correctly classifies critical vs non-critical paths
 *     (regardless of query string / baseURL prefix / casing).
 *   - The REAL response interceptor the ApiClient constructor registers:
 *       * does NOT clear the token or redirect on a non-critical 401
 *         (the `/projects/sessions/all` widget — the exact bug), and
 *       * DOES clear the token + redirect on an auth-critical 401.
 *
 * NOTE: axios v1 ships ESM that CRA's jest config does not transform
 * (transformIgnorePatterns excludes node_modules), so we mock `axios` here.
 * The mock's `create()` returns an instance whose `interceptors.response.use`
 * captures the handlers — we then invoke the REAL rejected handler the
 * constructor registered, so the discrimination logic under test is genuine.
 */

// Importing the module instantiates the singleton ApiClient, which registers the
// interceptors on the mocked axios instance (populating `captured.rejected`).
// jest hoists the `jest.mock('axios', …)` factory below ABOVE this import, and
// the `var captured` declaration is hoisted too, so the factory can assign to it.
import { isAuthCriticalUrl } from './api';

// Capture the response interceptor handler registered by the real constructor.
// A `var` holder (not `let`/`const`) avoids the TDZ under jest's hoisting.
// eslint-disable-next-line no-var, vars-on-top
var captured: { rejected?: (error: unknown) => unknown } = {};

jest.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: jest.fn() },
      response: {
        use: (_fulfilled: unknown, rejected: (e: unknown) => unknown) => {
          captured.rejected = rejected;
        },
      },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  return {
    __esModule: true,
    default: { create: jest.fn(() => instance) },
  };
});

describe('isAuthCriticalUrl (401 discrimination)', () => {
  test.each([
    '/auth/login',
    '/auth/logout',
    '/auth/profile',
    '/auth/refresh',
    '/auth/me',
    '/api/auth/profile', // works with baseURL prefix
    '/auth/profile?foo=bar', // ignores query string
    '/AUTH/PROFILE', // case-insensitive
  ])('treats %s as auth-critical', (url) => {
    expect(isAuthCriticalUrl(url)).toBe(true);
  });

  test.each([
    '/projects/sessions/all', // THE bug call
    '/projects/sessions/all?limit=10&project_id=abc',
    '/projects',
    '/contexts',
    '/tasks',
    undefined,
    '',
  ])('treats %s as NON-critical', (url) => {
    expect(isAuthCriticalUrl(url as string | undefined)).toBe(false);
  });
});

describe('response interceptor force-logout discrimination (real handler)', () => {
  let originalLocation: PropertyDescriptor | undefined;
  let assignedHref: string | null;

  beforeEach(() => {
    localStorage.setItem('aidis_token', 'fresh-token');
    localStorage.setItem('aidis_user', JSON.stringify({ id: '1' }));

    // Capture any hard-redirect without navigating jsdom.
    assignedHref = null;
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
    delete (window as any).location;
    (window as any).location = {
      set href(v: string) {
        assignedHref = v;
      },
      get href() {
        return assignedHref ?? '';
      },
    };
  });

  afterEach(() => {
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation);
    }
    localStorage.clear();
  });

  const make401 = (url: string) => ({
    config: { url },
    response: { status: 401, data: { message: 'Unauthorized' } },
    message: 'Request failed with status code 401',
  });

  test('the constructor registered a response error handler', () => {
    expect(typeof captured.rejected).toBe('function');
  });

  test('NON-critical 401 (the sessions widget) does NOT clear token or redirect', async () => {
    await expect(
      captured.rejected!(make401('/projects/sessions/all?limit=10&project_id=x'))
    ).rejects.toBeDefined(); // the one call still fails…

    // …but the session survives:
    expect(localStorage.getItem('aidis_token')).toBe('fresh-token');
    expect(localStorage.getItem('aidis_user')).not.toBeNull();
    expect(assignedHref).toBeNull();
  });

  test('auth-critical 401 (profile) DOES clear token and redirect to /login', async () => {
    await expect(
      captured.rejected!(make401('/auth/profile'))
    ).rejects.toBeDefined();

    expect(localStorage.getItem('aidis_token')).toBeNull();
    expect(localStorage.getItem('aidis_user')).toBeNull();
    expect(assignedHref).toBe('/login');
  });
});
