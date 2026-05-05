/**
 * consentApi.test.js — Unit tests for the JWT-authed UserConsent
 * client wrapper exported from socialApi.js (W0c F3).
 *
 * Mirrors bleEncounterApi.test.js convention: mock './axiosFactory'
 * so createApiClient() returns a single stable mock with jest.fn()
 * spies for get/post/patch/put/delete; assert URL + body shape match
 * the wire contract defined in HARTOS integrations/social/consent_api.py
 * (commit f05a396).
 */

const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({data: {}})),
  post: jest.fn(() => Promise.resolve({data: {}})),
  patch: jest.fn(() => Promise.resolve({data: {}})),
  put: jest.fn(() => Promise.resolve({data: {}})),
  delete: jest.fn(() => Promise.resolve({data: {}})),
};

jest.mock('../../services/axiosFactory', () => ({
  createApiClient: jest.fn(() => mockAxiosInstance),
}));

const {consentApi} = require('../../services/socialApi');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── grant — POST /api/social/consent ─────────────────────────────────────
describe('consentApi.grant', () => {
  it('calls POST /consent with consent_type + scope only when others omitted', async () => {
    await consentApi.grant({
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/consent', {
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      agent_id: undefined,
      metadata: undefined,
    });
  });

  it('forwards agent_id + metadata when provided', async () => {
    await consentApi.grant({
      consent_type: 'cloud_capability',
      scope: '*',
      agent_id: 'agt_42',
      metadata: {origin: 'settings_page'},
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/consent', {
      consent_type: 'cloud_capability',
      scope: '*',
      agent_id: 'agt_42',
      metadata: {origin: 'settings_page'},
    });
  });
});

// ── revoke — POST /api/social/consent/revoke ─────────────────────────────
describe('consentApi.revoke', () => {
  it('calls POST /consent/revoke with consent_type + scope', async () => {
    await consentApi.revoke({
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/consent/revoke', {
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      agent_id: undefined,
    });
  });

  it('forwards agent_id when provided', async () => {
    await consentApi.revoke({
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      agent_id: 'agt_42',
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/consent/revoke', {
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      agent_id: 'agt_42',
    });
  });
});

// ── list — GET /api/social/consent ───────────────────────────────────────
describe('consentApi.list', () => {
  it('calls GET /consent with no params when no filters supplied', async () => {
    await consentApi.list();
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/consent', {params: {}});
  });

  it('encodes consent_type filter in query params', async () => {
    await consentApi.list({consent_type: 'cloud_capability'});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/consent', {
      params: {consent_type: 'cloud_capability'},
    });
  });

  it('encodes active_only=true as the string "true"', async () => {
    await consentApi.list({active_only: true});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/consent', {
      params: {active_only: 'true'},
    });
  });

  it('encodes active_only=false as the string "false"', async () => {
    await consentApi.list({active_only: false});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/consent', {
      params: {active_only: 'false'},
    });
  });

  it('combines both filters', async () => {
    await consentApi.list({
      consent_type: 'cloud_capability',
      active_only: true,
    });
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/consent', {
      params: {consent_type: 'cloud_capability', active_only: 'true'},
    });
  });
});

// ── API surface ──────────────────────────────────────────────────────────
describe('consentApi structure', () => {
  it('exports the 3 methods in the F3 spec', () => {
    expect(typeof consentApi.grant).toBe('function');
    expect(typeof consentApi.revoke).toBe('function');
    expect(typeof consentApi.list).toBe('function');
  });
});
