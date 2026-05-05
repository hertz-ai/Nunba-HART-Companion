/**
 * bleEncounterApi.test.js — Unit tests for the BLE physical-world
 * encounter client wrapper exported from socialApi.js.
 *
 * Backfills test coverage for the methods that shipped without tests
 * in commit 65084ae2 ("feat(social): bleEncounterApi client wraps
 * /api/social/encounter/*").  Flagged by master-orchestrator backfill
 * run aa3ead1 as W0b B2 REWORK.
 *
 * Each test asserts that the method calls the mocked axios client
 * with the correct URL AND body shape — the wire contract is the
 * authority (PRODUCT_MAP J200-J215, HARTOS encounter_api.py).
 *
 * Strategy (matches socialApi.test.js convention): mock the
 * './axiosFactory' module so createApiClient() returns a single
 * stable mock with jest.fn() spies for get/post/patch/put/delete.
 */

// Build the mock client — returned for every createApiClient() call
const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({data: {}})),
  post: jest.fn(() => Promise.resolve({data: {}})),
  patch: jest.fn(() => Promise.resolve({data: {}})),
  put: jest.fn(() => Promise.resolve({data: {}})),
  delete: jest.fn(() => Promise.resolve({data: {}})),
};

jest.mock('../../services/axiosFactory', () => {
  // Must build the object inside the factory — cannot reference outer const
  return {
    createApiClient: jest.fn(() => mockAxiosInstance),
  };
});

// Now import the API that uses createApiClient internally
const {bleEncounterApi} = require('../../services/socialApi');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── getDiscoverable / setDiscoverable (J200, J201) ────────────────────────
describe('bleEncounterApi.getDiscoverable', () => {
  it('calls GET /encounter/discoverable with no body', async () => {
    await bleEncounterApi.getDiscoverable();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/encounter/discoverable'
    );
  });
});

describe('bleEncounterApi.setDiscoverable', () => {
  it('calls POST /encounter/discoverable with all fields coerced', async () => {
    await bleEncounterApi.setDiscoverable({
      enabled: true,
      age_claim_18: true,
      ttl_sec: 3600,
      face_visible: true,
      avatar_style: 'pixel_art',
      vibe_tags: ['hiking', 'coffee'],
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      {
        enabled: true,
        age_claim_18: true,
        ttl_sec: 3600,
        face_visible: true,
        avatar_style: 'pixel_art',
        vibe_tags: ['hiking', 'coffee'],
      }
    );
  });

  it('coerces enabled/age_claim_18/face_visible to booleans via !!', async () => {
    // Pass truthy non-booleans — wrapper must boolean-coerce
    await bleEncounterApi.setDiscoverable({
      enabled: 1,
      age_claim_18: 'yes',
      ttl_sec: 60,
      face_visible: {},
      avatar_style: 'studio_ghibli',
      vibe_tags: [],
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      {
        enabled: true,
        age_claim_18: true,
        ttl_sec: 60,
        face_visible: true,
        avatar_style: 'studio_ghibli',
        vibe_tags: [],
      }
    );
  });

  it('coerces falsy enabled/age_claim_18/face_visible to false', async () => {
    await bleEncounterApi.setDiscoverable({
      enabled: undefined,
      age_claim_18: 0,
      ttl_sec: 120,
      face_visible: null,
      avatar_style: 'studio_ghibli',
      vibe_tags: [],
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      {
        enabled: false,
        age_claim_18: false,
        ttl_sec: 120,
        face_visible: false,
        avatar_style: 'studio_ghibli',
        vibe_tags: [],
      }
    );
  });

  it('defaults avatar_style to studio_ghibli when missing/empty', async () => {
    await bleEncounterApi.setDiscoverable({
      enabled: true,
      age_claim_18: true,
      ttl_sec: 1800,
      face_visible: false,
      avatar_style: undefined,
      vibe_tags: ['music'],
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      expect.objectContaining({avatar_style: 'studio_ghibli'})
    );
  });

  it('defaults vibe_tags to [] when missing', async () => {
    await bleEncounterApi.setDiscoverable({
      enabled: true,
      age_claim_18: true,
      ttl_sec: 600,
      face_visible: true,
      avatar_style: 'pixel_art',
      vibe_tags: undefined,
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      expect.objectContaining({vibe_tags: []})
    );
  });

  it('passes ttl_sec=undefined when falsy (server treats as default)', async () => {
    // ttl_sec uses `ttl_sec || undefined` — 0 / null / undefined → undefined
    await bleEncounterApi.setDiscoverable({
      enabled: true,
      age_claim_18: true,
      ttl_sec: 0,
      face_visible: false,
      avatar_style: 'studio_ghibli',
      vibe_tags: [],
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/discoverable',
      expect.objectContaining({ttl_sec: undefined})
    );
  });
});

// ── registerPubkey (J200) ─────────────────────────────────────────────────
describe('bleEncounterApi.registerPubkey', () => {
  it('calls POST /encounter/register-pubkey with {pubkey}', async () => {
    await bleEncounterApi.registerPubkey('abc123hexkey');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/register-pubkey',
      {pubkey: 'abc123hexkey'}
    );
  });
});

// ── reportSighting (J203) ─────────────────────────────────────────────────
describe('bleEncounterApi.reportSighting', () => {
  it('calls POST /encounter/sighting with full sighting payload', async () => {
    await bleEncounterApi.reportSighting({
      peer_pubkey: 'peer_xyz',
      rssi_peak: -45,
      dwell_sec: 12,
      lat: 12.9716,
      lng: 77.5946,
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/sighting',
      {
        peer_pubkey: 'peer_xyz',
        rssi_peak: -45,
        dwell_sec: 12,
        lat: 12.9716,
        lng: 77.5946,
      }
    );
  });

  it('forwards undefined location fields verbatim (no coercion)', async () => {
    await bleEncounterApi.reportSighting({
      peer_pubkey: 'peer_xyz',
      rssi_peak: -70,
      dwell_sec: 5,
      lat: undefined,
      lng: undefined,
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/sighting',
      {
        peer_pubkey: 'peer_xyz',
        rssi_peak: -70,
        dwell_sec: 5,
        lat: undefined,
        lng: undefined,
      }
    );
  });
});

// ── swipe (J204, J205) ────────────────────────────────────────────────────
describe('bleEncounterApi.swipe', () => {
  it('calls POST /encounter/swipe with {sighting_id, decision} for like', async () => {
    await bleEncounterApi.swipe('sight_42', 'like');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/encounter/swipe', {
      sighting_id: 'sight_42',
      decision: 'like',
    });
  });

  it('calls POST /encounter/swipe with dislike decision', async () => {
    await bleEncounterApi.swipe('sight_99', 'dislike');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/encounter/swipe', {
      sighting_id: 'sight_99',
      decision: 'dislike',
    });
  });
});

// ── listMatches (J204) ────────────────────────────────────────────────────
describe('bleEncounterApi.listMatches', () => {
  it('calls GET /encounter/matches with no body', async () => {
    await bleEncounterApi.listMatches();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/encounter/matches');
  });
});

// ── listMapPins (J211) ────────────────────────────────────────────────────
describe('bleEncounterApi.listMapPins', () => {
  it('calls GET /encounter/map-pins with no body', async () => {
    await bleEncounterApi.listMapPins();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/encounter/map-pins');
  });
});

// ── draftIcebreaker (J207) ────────────────────────────────────────────────
describe('bleEncounterApi.draftIcebreaker', () => {
  it('calls POST /encounter/icebreaker/draft with {match_id}', async () => {
    await bleEncounterApi.draftIcebreaker('match_007');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/icebreaker/draft',
      {match_id: 'match_007'}
    );
  });
});

// ── approveIcebreaker / declineIcebreaker (J209, J210) ────────────────────
describe('bleEncounterApi.approveIcebreaker', () => {
  it('calls POST /encounter/icebreaker/approve with {match_id, text}', async () => {
    await bleEncounterApi.approveIcebreaker('match_007', 'hi there!');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/icebreaker/approve',
      {match_id: 'match_007', text: 'hi there!'}
    );
  });
});

describe('bleEncounterApi.declineIcebreaker', () => {
  it('calls POST /encounter/icebreaker/decline with {match_id, reason}', async () => {
    await bleEncounterApi.declineIcebreaker('match_007', 'tone_off');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/encounter/icebreaker/decline',
      {match_id: 'match_007', reason: 'tone_off'}
    );
  });
});

// ── topics (WAMP topic registry — single source via server) ───────────────
describe('bleEncounterApi.topics', () => {
  it('calls GET /encounter/topics with no body', async () => {
    await bleEncounterApi.topics();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/encounter/topics');
  });
});

// ── API surface completeness ──────────────────────────────────────────────
describe('bleEncounterApi structure', () => {
  it('exports all 11 methods named in commit 65084ae2', () => {
    expect(typeof bleEncounterApi.getDiscoverable).toBe('function');
    expect(typeof bleEncounterApi.setDiscoverable).toBe('function');
    expect(typeof bleEncounterApi.registerPubkey).toBe('function');
    expect(typeof bleEncounterApi.reportSighting).toBe('function');
    expect(typeof bleEncounterApi.swipe).toBe('function');
    expect(typeof bleEncounterApi.listMatches).toBe('function');
    expect(typeof bleEncounterApi.listMapPins).toBe('function');
    expect(typeof bleEncounterApi.draftIcebreaker).toBe('function');
    expect(typeof bleEncounterApi.approveIcebreaker).toBe('function');
    expect(typeof bleEncounterApi.declineIcebreaker).toBe('function');
    expect(typeof bleEncounterApi.topics).toBe('function');
  });
});
