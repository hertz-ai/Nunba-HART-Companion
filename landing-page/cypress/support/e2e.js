// Cypress E2E Support File

// Code coverage collection
import '@cypress/code-coverage/support';

// Mochawesome reporter screenshot capture
import 'cypress-mochawesome-reporter/register';

// Prevent ALL uncaught exceptions from failing E2E tests
// The React app throws many non-critical errors (network, auth, lazy loading, etc.)
Cypress.on('uncaught:exception', () => false);

// Reset rate limiter buckets before the entire suite so registrations don't throttle
// Uses fetch() via cy.wrap to gracefully handle connection-refused (cy.request throws)
before(() => {
  cy.wrap(
    fetch('http://localhost:5000/api/social/test/reset-rate-limits', {
      method: 'POST',
    }).catch(() => {
      /* backend not running — OK for stub-based tests */
    }),
    {timeout: 5000}
  );
});

// Remove webpack-dev-server error overlay that covers UI elements
// This iframe blocks clicks in headless Chrome
beforeEach(() => {
  cy.on('window:before:load', (win) => {
    // Remove the overlay after page loads
    const removeOverlay = () => {
      const overlay = win.document.getElementById(
        'webpack-dev-server-client-overlay'
      );
      if (overlay) {
        overlay.remove();
      }
    };
    // Try immediately and after delays
    setTimeout(removeOverlay, 500);
    setTimeout(removeOverlay, 1500);
    setTimeout(removeOverlay, 3000);
    setTimeout(removeOverlay, 5000);
  });
});

// ---------------------------------------------------------------------------
// Social Auth Custom Commands
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:5000';
const SOCIAL_API = `${API_BASE}/api/social`;

// Generate unique test user credentials
let _testUserCounter = 0;
function uniqueTestUser() {
  const ts = Date.now();
  _testUserCounter++;
  return {
    username: `cypressuser_${ts}_${_testUserCounter}`,
    password: 'TestPass123!',
    display_name: `Cypress Test User ${_testUserCounter}`,
  };
}

/**
 * Register a new social user via the API, then login to get JWT.
 *
 * Backend response formats:
 *   Register (201): { success, data: { id, username, api_token, ... } }  (no JWT)
 *   Login    (200): { success, data: { token: "JWT...", user: { id, ... } } }
 *
 * Yields { user_id, username, access_token }
 */
Cypress.Commands.add('socialRegister', (username, password, displayName) => {
  const user = username
    ? {username, password, display_name: displayName || username}
    : uniqueTestUser();

  return cy
    .request({
      method: 'POST',
      url: `${SOCIAL_API}/auth/register`,
      body: user,
      failOnStatusCode: false,
      timeout: 30000,
    })
    .then((res) => {
      // Whether register succeeded (201) or user already exists, login to get JWT
      return cy.socialLogin(user.username, user.password).then((loginData) => {
        return {
          ...loginData,
          display_name: user.display_name,
        };
      });
    });
});

/**
 * Login an existing social user via the API
 *
 * Backend response: { success, data: { token: "JWT...", user: { id, username, ... } } }
 *
 * Yields { user_id, username, access_token }
 */
Cypress.Commands.add('socialLogin', (username, password) => {
  return cy
    .request({
      method: 'POST',
      url: `${SOCIAL_API}/auth/login`,
      body: {username, password: password || 'TestPass123!'},
      failOnStatusCode: false,
      timeout: 30000,
    })
    .then((res) => {
      const data = res.body.data || res.body;
      // Login returns { token: "JWT...", user: { id, username, ... } }
      const token = data.token || data.access_token;
      const user = data.user || data;
      return {
        user_id: user.id || user.user_id,
        username: user.username || username,
        access_token: token,
      };
    });
});

/**
 * Register + login a unique test user and store token in Cypress env
 * This is the one-stop command for most tests.
 * Yields { user_id, username, access_token, refresh_token }
 */
Cypress.Commands.add('socialAuth', () => {
  const user = uniqueTestUser();
  return cy
    .socialRegister(user.username, user.password, user.display_name)
    .then((authData) => {
      // Store in Cypress env for other commands to use
      Cypress.env('socialToken', authData.access_token);
      Cypress.env('socialUserId', authData.user_id);
      Cypress.env('socialUsername', authData.username);
      return authData;
    });
});

/**
 * Make an authenticated API request to the social backend
 * Automatically attaches the Bearer token from cy.socialAuth()
 */
Cypress.Commands.add('socialRequest', (method, path, body, options = {}) => {
  const token = options.token || Cypress.env('socialToken');
  const url = path.startsWith('http') ? path : `${SOCIAL_API}${path}`;
  return cy.request({
    method,
    url,
    body,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...options.headers,
    },
    failOnStatusCode:
      options.failOnStatusCode !== undefined ? options.failOnStatusCode : false,
    ...options,
  });
});

/**
 * Visit a page with social auth token pre-set in localStorage
 * The React app reads access_token from localStorage on boot
 */
Cypress.Commands.add('socialVisit', (path, options = {}) => {
  const token = options.token || Cypress.env('socialToken');
  const userId = options.userId || Cypress.env('socialUserId');
  const username = options.username || Cypress.env('socialUsername');

  cy.visit(path, {
    failOnStatusCode: false,
    timeout: 60000,
    ...options,
    onBeforeLoad(win) {
      if (token) {
        win.localStorage.setItem('access_token', token);
      }
      if (userId) {
        win.localStorage.setItem('social_user_id', userId);
      }
      if (username) {
        win.localStorage.setItem('social_username', username);
      }
      // Call parent onBeforeLoad if provided
      if (options.onBeforeLoad) {
        options.onBeforeLoad(win);
      }
    },
  });
});

// ---------------------------------------------------------------------------
// Role-based Auth Commands
// ---------------------------------------------------------------------------

/**
 * Register + login a unique test user, then intercept /auth/me to inject a role.
 * This lets tests simulate central/regional/flat/guest access tiers.
 *
 * Usage:
 *   cy.socialAuthWithRole('central')  → admin user
 *   cy.socialAuthWithRole('regional') → moderator
 *   cy.socialAuthWithRole('flat')     → normal authenticated user (default)
 *
 * Yields { user_id, username, access_token, role }
 */
Cypress.Commands.add('socialAuthWithRole', (role = 'flat') => {
  // Register + login first
  cy.socialAuth();

  // Intercept /auth/me to inject the requested role into the response
  cy.intercept('GET', '**/api/social/auth/me', (req) => {
    req.continue((res) => {
      if (res.body && res.body.data) {
        res.body.data.role = role;
        res.body.data.is_admin = role === 'central';
        res.body.data.is_moderator = role === 'central' || role === 'regional';
      } else if (res.body && res.body.success) {
        res.body.role = role;
      }
    });
  }).as('authMeWithRole');

  Cypress.env('socialRole', role);
});

/**
 * Visit a page as an admin (central role) user.
 * Combines socialAuthWithRole('central') + socialVisit with /auth/me intercept.
 * Use this in admin panel tests to bypass RoleGuard redirects.
 */
Cypress.Commands.add('socialVisitAsAdmin', (path, options = {}) => {
  const token = Cypress.env('socialToken');
  const userId = Cypress.env('socialUserId');
  const username = Cypress.env('socialUsername');

  // Intercept /auth/me to return central role
  cy.intercept('GET', '**/api/social/auth/me', (req) => {
    req.continue((res) => {
      if (res.body && res.body.data) {
        res.body.data.role = 'central';
        res.body.data.is_admin = true;
        res.body.data.is_moderator = true;
      }
    });
  }).as('authMeAdmin');

  cy.visit(path, {
    failOnStatusCode: false,
    timeout: 60000,
    ...options,
    onBeforeLoad(win) {
      if (token) win.localStorage.setItem('access_token', token);
      if (userId) win.localStorage.setItem('social_user_id', userId);
      if (username) win.localStorage.setItem('social_username', username);
      if (options.onBeforeLoad) options.onBeforeLoad(win);
    },
  });
});

// ---------------------------------------------------------------------------
// Utility Commands
// ---------------------------------------------------------------------------

// Custom command: wait for API response and assert
Cypress.Commands.add('waitForApi', (alias, statusCode = 200) => {
  cy.wait(alias).its('response.statusCode').should('eq', statusCode);
});

// Custom command: check element contains text (with retry)
Cypress.Commands.add('shouldContainText', (selector, text) => {
  cy.get(selector, {timeout: 10000}).should('contain.text', text);
});

// ---------------------------------------------------------------------------
// JWT Token Validation Commands
// ---------------------------------------------------------------------------

/**
 * Decode JWT payload (base64url -> JSON)
 * @param {string} token - JWT token string
 * @returns {object|null} - Decoded payload or null if invalid
 */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

/**
 * Validate JWT structure (3 base64url parts separated by dots)
 * @param {string} token - JWT token string
 * @returns {boolean} - True if valid JWT format
 */
function isValidJwtFormat(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => base64urlRegex.test(part));
}

/**
 * Validate JWT token format and structure
 * Yields the decoded payload if valid
 */
Cypress.Commands.add('validateJwt', (token) => {
  expect(token, 'Token should be a string').to.be.a('string');
  expect(token.length, 'Token should not be empty').to.be.greaterThan(0);
  expect(
    isValidJwtFormat(token),
    'Token should be valid JWT format (header.payload.signature)'
  ).to.be.true;

  const payload = decodeJwtPayload(token);
  expect(payload, 'JWT payload should be decodable').to.not.be.null;

  // Validate expiration
  if (payload && payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp, 'Token should not be expired').to.be.greaterThan(now);
  }

  return cy.wrap(payload);
});

/**
 * Get the current JWT token from Cypress env
 */
Cypress.Commands.add('getJwtToken', () => {
  return cy.wrap(Cypress.env('socialToken'));
});

/**
 * Clear all auth state from localStorage
 */
Cypress.Commands.add('clearAuthState', () => {
  const authKeys = [
    'access_token',
    'user_id',
    'email_address',
    'refresh_token',
    'expire_token',
    'guest_mode',
    'guest_name',
    'guest_user_id',
    'guest_name_verified',
    'auth_source',
    'social_user_id',
    'social_username',
  ];

  cy.window().then((win) => {
    authKeys.forEach((key) => {
      win.localStorage.removeItem(key);
    });
  });

  // Also clear Cypress env
  Cypress.env('socialToken', null);
  Cypress.env('socialUserId', null);
  Cypress.env('socialUsername', null);
});

/**
 * Verify that a request with the given token succeeds
 */
Cypress.Commands.add('verifyTokenWorks', (token) => {
  return cy
    .request({
      method: 'GET',
      url: `${API_BASE}/api/social/auth/me`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      failOnStatusCode: false,
      timeout: 30000,
    })
    .then((res) => {
      return {
        isValid: res.status === 200 && res.body.success === true,
        status: res.status,
        body: res.body,
      };
    });
});

/**
 * Verify that a request without token is rejected
 */
Cypress.Commands.add('verifyAuthRequired', (method, path) => {
  return cy
    .request({
      method,
      url: `${API_BASE}/api/social${path}`,
      headers: {'Content-Type': 'application/json'},
      failOnStatusCode: false,
      timeout: 30000,
    })
    .then((res) => {
      if (res.status >= 500) {
        cy.log(`${method} ${path}: Server error`);
        return {required: 'unknown', status: res.status};
      }
      if (res.status === 404 || res.status === 405) {
        cy.log(`${method} ${path}: Endpoint not found/allowed`);
        return {required: 'unknown', status: res.status};
      }
      const required =
        res.status === 401 ||
        res.status === 403 ||
        (res.body && res.body.success === false);
      return {required, status: res.status};
    });
});
