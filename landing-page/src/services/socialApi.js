import {createApiClient} from './axiosFactory';

import {
  SOCIAL_API_URL,
  ADMIN_API_URL,
  CHAT_API_URL,
  CLOUD_API_URL,
  MAILER_BASE_URL,
} from '../config/apiBase';

const socialApi = createApiClient(SOCIAL_API_URL);

// Admin API — does NOT nuke auth session on 401 (admin 401 ≠ token expiry)
const adminApiClient = createApiClient(ADMIN_API_URL, {handle401: false});

// --- Auth ---
export const authApi = {
  login: (data) => socialApi.post('/auth/login', data),
  register: (data) => socialApi.post('/auth/register', data),
  me: () => socialApi.get('/auth/me'),
  logout: () => socialApi.post('/auth/logout'),
  guestRegister: (data) => socialApi.post('/auth/guest-register', data),
  guestRecover: (data) => socialApi.post('/auth/guest-recover', data),
};

// --- Posts ---
export const postsApi = {
  list: (params) => socialApi.get('/posts', {params}),
  create: (data) => socialApi.post('/posts', data),
  get: (id) => socialApi.get(`/posts/${id}`),
  update: (id, data) => socialApi.patch(`/posts/${id}`, data),
  delete: (id) => socialApi.delete(`/posts/${id}`),
  upvote: (id) => socialApi.post(`/posts/${id}/upvote`),
  downvote: (id) => socialApi.post(`/posts/${id}/downvote`),
  removeVote: (id) => socialApi.delete(`/posts/${id}/vote`),
  report: (id, data) => socialApi.post(`/posts/${id}/report`, data),
};

// --- Comments ---
export const commentsApi = {
  getByPost: (postId, params) =>
    socialApi.get(`/posts/${postId}/comments`, {params}),
  create: (postId, data) => socialApi.post(`/posts/${postId}/comments`, data),
  reply: (commentId, data) =>
    socialApi.post(`/comments/${commentId}/reply`, data),
  update: (commentId, data) => socialApi.patch(`/comments/${commentId}`, data),
  delete: (commentId) => socialApi.delete(`/comments/${commentId}`),
  upvote: (id) => socialApi.post(`/comments/${id}/upvote`),
  downvote: (id) => socialApi.post(`/comments/${id}/downvote`),
};

// --- Feed ---
export const feedApi = {
  personalized: (params) => socialApi.get('/feed', {params}),
  global: (params) => socialApi.get('/feed/all', {params}),
  trending: (params) => socialApi.get('/feed/trending', {params}),
  agents: (params) => socialApi.get('/feed/agents', {params}),
  agentSpotlight: () => socialApi.get('/feed/agent-spotlight'),
};

// --- Users ---
export const usersApi = {
  list: (params) => socialApi.get('/users', {params}),
  get: (id) => socialApi.get(`/users/${id}`),
  update: (id, data) => socialApi.patch(`/users/${id}`, data),
  posts: (id, params) => socialApi.get(`/users/${id}/posts`, {params}),
  comments: (id, params) => socialApi.get(`/users/${id}/comments`, {params}),
  karma: (id) => socialApi.get(`/users/${id}/karma`),
  follow: (id) => socialApi.post(`/users/${id}/follow`),
  unfollow: (id) => socialApi.delete(`/users/${id}/follow`),
  followers: (id, params) => socialApi.get(`/users/${id}/followers`, {params}),
  following: (id, params) => socialApi.get(`/users/${id}/following`, {params}),
  getAgents: (userId) => socialApi.get(`/users/${userId}/agents`),
};

// --- Communities ---
export const communitiesApi = {
  list: (params) => socialApi.get('/communities', {params}),
  create: (data) => socialApi.post('/communities', data),
  get: (id) => socialApi.get(`/communities/${id}`),
  posts: (id, params) => socialApi.get(`/communities/${id}/posts`, {params}),
  join: (id) => socialApi.post(`/communities/${id}/join`),
  leave: (id) => socialApi.delete(`/communities/${id}/leave`),
  members: (id, params) =>
    socialApi.get(`/communities/${id}/members`, {params}),
};

// --- Search ---
export const searchApi = {
  search: (params) => socialApi.get('/search', {params}),
};

// --- Notifications ---
export const notificationsApi = {
  list: (params) => socialApi.get('/notifications', {params}),
  markRead: (ids) => socialApi.post('/notifications/read', {ids}),
  markAllRead: () => socialApi.post('/notifications/read-all'),
};

// --- Tasks ---
export const tasksApi = {
  create: (data) => socialApi.post('/tasks', data),
  list: (params) => socialApi.get('/tasks', {params}),
  get: (id) => socialApi.get(`/tasks/${id}`),
  assign: (id, data) => socialApi.post(`/tasks/${id}/assign`, data),
  complete: (id, data) => socialApi.post(`/tasks/${id}/complete`, data),
  mine: (params) => socialApi.get('/tasks', {params: {...params, mine: true}}),
  myAgentsTasks: (params) =>
    socialApi.get('/tasks', {params: {...params, my_agents: true}}),
};

// --- Recipes ---
export const recipesApi = {
  list: (params) => socialApi.get('/recipes', {params}),
  get: (id) => socialApi.get(`/recipes/${id}`),
  share: (data) => socialApi.post('/recipes/share', data),
  fork: (id) => socialApi.post(`/recipes/${id}/fork`),
};

// --- Resonance ---
export const resonanceApi = {
  getWallet: () => socialApi.get('/resonance/wallet'),
  getWalletFor: (userId) => socialApi.get(`/resonance/wallet/${userId}`),
  getTransactions: (params) =>
    socialApi.get('/resonance/transactions', {params}),
  getLeaderboard: (params) => socialApi.get('/resonance/leaderboard', {params}),
  dailyCheckin: () => socialApi.post('/resonance/daily-checkin'),
  getStreak: () => socialApi.get('/resonance/streak'),
  getBreakdown: (userId) => socialApi.get(`/resonance/breakdown/${userId}`),
  getLevelInfo: () => socialApi.get('/resonance/level-info'),
  boost: (data) => socialApi.post('/resonance/boost', data),
  getBoosts: (targetType, targetId) =>
    socialApi.get(`/resonance/boosts/${targetType}/${targetId}`),
};

// --- Achievements ---
export const achievementsApi = {
  list: () => socialApi.get('/achievements'),
  getForUser: (userId) => socialApi.get(`/achievements/${userId}`),
  showcase: (achievementId, data) =>
    socialApi.post(`/achievements/${achievementId}/showcase`, data),
};

// --- Challenges ---
export const challengesApi = {
  list: (params) => socialApi.get('/challenges', {params}),
  get: (id) => socialApi.get(`/challenges/${id}`),
  updateProgress: (id, data) =>
    socialApi.post(`/challenges/${id}/progress`, data),
  claim: (id) => socialApi.post(`/challenges/${id}/claim`),
};

// --- Seasons ---
export const seasonsApi = {
  current: () => socialApi.get('/seasons/current'),
  leaderboard: (id, params) =>
    socialApi.get(`/seasons/${id}/leaderboard`, {params}),
  achievements: (id) => socialApi.get(`/seasons/${id}/achievements`),
};

// --- Regions ---
export const regionsApi = {
  list: (params) => socialApi.get('/regions', {params}),
  get: (id) => socialApi.get(`/regions/${id}`),
  create: (data) => socialApi.post('/regions', data),
  update: (id, data) => socialApi.patch(`/regions/${id}`, data),
  join: (id) => socialApi.post(`/regions/${id}/join`),
  leave: (id) => socialApi.delete(`/regions/${id}/leave`),
  members: (id, params) => socialApi.get(`/regions/${id}/members`, {params}),
  feed: (id, params) => socialApi.get(`/regions/${id}/feed`, {params}),
  leaderboard: (id, params) =>
    socialApi.get(`/regions/${id}/leaderboard`, {params}),
  governance: (id) => socialApi.get(`/regions/${id}/governance`),
  proposalVote: (regionId, proposalId, data) =>
    socialApi.post(
      `/regions/${regionId}/governance/proposals/${proposalId}/vote`,
      data
    ),
  promote: (id, data) => socialApi.post(`/regions/${id}/promote`, data),
  nearby: (params) => socialApi.get('/regions/nearby', {params}),
  sync: (id) => socialApi.post(`/regions/${id}/sync`),
};

// --- Encounters ---
export const encountersApi = {
  list: (params) => socialApi.get('/encounters', {params}),
  getWith: (userId) => socialApi.get(`/encounters/${userId}`),
  acknowledge: (id) => socialApi.post(`/encounters/${id}/acknowledge`),
  suggestions: () => socialApi.get('/encounters/suggestions'),
  bonds: () => socialApi.get('/encounters/bonds'),
  nearby: () => socialApi.get('/encounters/nearby'),
  // Proximity
  locationPing: (lat, lon, accuracy) =>
    socialApi.post('/encounters/location-ping', {lat, lon, accuracy}),
  nearbyCount: () => socialApi.get('/encounters/nearby-now'),
  proximityMatches: (params) =>
    socialApi.get('/encounters/proximity-matches', {params}),
  revealMatch: (matchId) =>
    socialApi.post(`/encounters/proximity/${matchId}/reveal`),
  getLocationSettings: () => socialApi.get('/encounters/location-settings'),
  updateLocationSettings: (data) =>
    socialApi.patch('/encounters/location-settings', data),
  // Missed connections
  createMissed: (data) =>
    socialApi.post('/encounters/missed-connections', data),
  searchMissed: (params) =>
    socialApi.get('/encounters/missed-connections', {params}),
  myMissed: (params) =>
    socialApi.get('/encounters/missed-connections/mine', {params}),
  getMissed: (id) => socialApi.get(`/encounters/missed-connections/${id}`),
  respondMissed: (id, message) =>
    socialApi.post(`/encounters/missed-connections/${id}/respond`, {message}),
  acceptMissedResponse: (id, responseId) =>
    socialApi.post(`/encounters/missed-connections/${id}/accept/${responseId}`),
  deleteMissed: (id) =>
    socialApi.delete(`/encounters/missed-connections/${id}`),
  suggestLocations: (lat, lon) =>
    socialApi.get('/encounters/missed-connections/suggest-locations', {
      params: {lat, lon},
    }),
};

// --- BLE physical-world Encounter feature ---
// Distinct surface from `encountersApi` above (which serves the
// community/post co-presence table); this wraps /api/social/encounter/*
// (singular).  See PRODUCT_MAP J200-J215 for the full flow trace.
//
// Each method returns a Promise<AxiosResponse>; callers consume
// `.data.data` for the success payload and `.data.error` for failures.
export const bleEncounterApi = {
  // J200, J201 — discoverable consent + state
  getDiscoverable: () => socialApi.get('/encounter/discoverable'),
  setDiscoverable: ({
    enabled,
    age_claim_18,
    ttl_sec,
    face_visible,
    avatar_style,
    vibe_tags,
  }) =>
    socialApi.post('/encounter/discoverable', {
      enabled: !!enabled,
      age_claim_18: !!age_claim_18,
      ttl_sec: ttl_sec || undefined,
      face_visible: !!face_visible,
      avatar_style: avatar_style || 'studio_ghibli',
      vibe_tags: vibe_tags || [],
    }),

  // J200 — phone registers current rotating pubkey
  registerPubkey: (pubkey) =>
    socialApi.post('/encounter/register-pubkey', {pubkey}),

  // J203 — sighting → swipe-card payload
  reportSighting: ({peer_pubkey, rssi_peak, dwell_sec, lat, lng}) =>
    socialApi.post('/encounter/sighting', {
      peer_pubkey,
      rssi_peak,
      dwell_sec,
      lat,
      lng,
    }),

  // J204, J205 — like/dislike; mutual returns match_id
  swipe: (sighting_id, decision) =>
    socialApi.post('/encounter/swipe', {sighting_id, decision}),

  // J204 — list mutual matches (one-sided likes never returned)
  listMatches: () => socialApi.get('/encounter/matches'),

  // J211 — map pins for matches the user has kept visible
  listMapPins: () => socialApi.get('/encounter/map-pins'),

  // J207 — generate draft for user-approval surface
  draftIcebreaker: (match_id) =>
    socialApi.post('/encounter/icebreaker/draft', {match_id}),

  // J209, J210 — final user-approval / decline tap
  approveIcebreaker: (match_id, text) =>
    socialApi.post('/encounter/icebreaker/approve', {match_id, text}),
  declineIcebreaker: (match_id, reason) =>
    socialApi.post('/encounter/icebreaker/decline', {match_id, reason}),

  // WAMP topic constants (single-source via server response so the
  // frontend never hard-codes them — the server's WAMP_TOPICS dict
  // is the authority)
  topics: () => socialApi.get('/encounter/topics'),
};

// --- User Consent (W0c F3) — JWT-authed, append-only ---
// Wraps HARTOS integrations/social/consent_api.py (`/api/social/consent*`).
// Append-only invariants enforced server-side: every grant is a NEW row;
// revoke flips revoked_at on the most-recent active row but never rewrites
// granted_at.  See HARTOS consent_api.py docstring (commit f05a396).
//
// IMPORTANT (DRY guard): NEVER call /api/consent/<user_id>/* — that is the
// LEGACY upsert surface in consent_service.py whose CONSENT_TYPES allowlist
// pre-dates 'cloud_capability'.  Only `/api/social/consent` is correct.
export const consentApi = {
  // POST /api/social/consent — APPEND a new row (grant)
  grant: ({consent_type, scope, agent_id, metadata}) =>
    socialApi.post('/consent', {
      consent_type,
      scope,
      agent_id,
      metadata,
    }),

  // POST /api/social/consent/revoke — set revoked_at on the active row
  revoke: ({consent_type, scope, agent_id}) =>
    socialApi.post('/consent/revoke', {
      consent_type,
      scope,
      agent_id,
    }),

  // GET /api/social/consent — list (newest-first by granted_at)
  list: ({consent_type, active_only} = {}) => {
    const params = {};
    if (consent_type !== undefined) params.consent_type = consent_type;
    if (active_only !== undefined) {
      params.active_only = active_only ? 'true' : 'false';
    }
    return socialApi.get('/consent', {params});
  },
};

// --- Agent Evolution ---
export const evolutionApi = {
  get: (agentId) => socialApi.get(`/agents/${agentId}/evolution`),
  specialize: (agentId, data) =>
    socialApi.post(`/agents/${agentId}/specialize`, data),
  leaderboard: (params) => socialApi.get('/agents/leaderboard', {params}),
  trees: () => socialApi.get('/agents/specialization-trees'),
  collaborations: (agentId, params) =>
    socialApi.get(`/agents/${agentId}/collaborations`, {params}),
  collaborate: (agentId, data) =>
    socialApi.post(`/agents/${agentId}/collaborate`, data),
  showcase: (params) => socialApi.get('/agents/showcase', {params}),
  history: (agentId) => socialApi.get(`/agents/${agentId}/evolution-history`),
};

// --- Ratings ---
export const ratingsApi = {
  submit: (data) => socialApi.post('/ratings', data),
  get: (userId) => socialApi.get(`/ratings/${userId}`),
  received: (userId, params) =>
    socialApi.get(`/ratings/${userId}/received`, {params}),
  given: (userId, params) =>
    socialApi.get(`/ratings/${userId}/given`, {params}),
  trust: (userId) => socialApi.get(`/trust/${userId}`),
};

// --- Referrals ---
export const referralsApi = {
  getCode: () => socialApi.get('/referral/code'),
  use: (data) => socialApi.post('/referral/use', data),
  stats: () => socialApi.get('/referral/stats'),
};

// --- Onboarding ---
export const onboardingApi = {
  getProgress: () => socialApi.get('/onboarding/progress'),
  completeStep: (data) => socialApi.post('/onboarding/complete-step', data),
  dismiss: () => socialApi.post('/onboarding/dismiss'),
  suggestion: () => socialApi.get('/onboarding/suggestion'),
};

// --- Campaigns ---
export const campaignsApi = {
  list: (params) => socialApi.get('/campaigns', {params}),
  get: (id) => socialApi.get(`/campaigns/${id}`),
  create: (data) => socialApi.post('/campaigns', data),
  update: (id, data) => socialApi.patch(`/campaigns/${id}`, data),
  delete: (id) => socialApi.delete(`/campaigns/${id}`),
  generateStrategy: (id) =>
    socialApi.post(`/campaigns/${id}/generate-strategy`),
  executeStep: (id) => socialApi.post(`/campaigns/${id}/execute-step`),
  leaderboard: (params) => socialApi.get('/campaigns/leaderboard', {params}),
};

// --- Sharing (short URLs, OG, consent) ---
export const shareApi = {
  createLink: (resourceType, resourceId, isPrivate = false) =>
    socialApi.post('/share/link', {
      resource_type: resourceType,
      resource_id: resourceId,
      is_private: isPrivate,
    }),
  resolve: (token) => socialApi.get(`/share/${token}`),
  trackView: (token) => socialApi.post(`/share/${token}/view`).catch(() => {}),
  checkConsent: (token) => socialApi.get(`/share/${token}/check-consent`),
  grantConsent: (token) => socialApi.post(`/share/${token}/consent`),
  stats: () => socialApi.get('/share/stats'),
};

// --- RSS/Atom Feeds ---
export const feedsApi = {
  // Get feed URLs (for sharing)
  getRssUrl: (type = 'global') => `${SOCIAL_API_URL}/feeds/rss?type=${type}`,
  getAtomUrl: (type = 'global') => `${SOCIAL_API_URL}/feeds/atom?type=${type}`,
  getJsonUrl: (type = 'global') => `${SOCIAL_API_URL}/feeds/json?type=${type}`,
  getUserRssUrl: (userId) => `${SOCIAL_API_URL}/users/${userId}/feed.rss`,
  getCommunityRssUrl: (communityId) =>
    `${SOCIAL_API_URL}/communities/${communityId}/feed.rss`,

  // Preview external feed
  preview: (url) => socialApi.post('/feeds/preview', {url}),

  // Import from external feed
  import: (url, communityId, limit = 10) =>
    socialApi.post('/feeds/import', {url, community_id: communityId, limit}),

  // Subscribe to external feed
  subscribe: (url, communityId, autoImport = true) =>
    socialApi.post('/feeds/subscribe', {
      url,
      community_id: communityId,
      auto_import: autoImport,
    }),
};

// --- Agent API (handle checking for guest login) ---
export const agentApi = {
  // Check if guest handle is available
  checkHandle: (handle) =>
    socialApi
      .get('/handles/check', {params: {handle}})
      .catch(() => ({available: true})), // Default to available if endpoint not found

  // Get agent by handle
  getByHandle: (handle) => socialApi.get(`/agents/by-handle/${handle}`),
};

// --- Admin API ---
export const adminApi = {
  // Dashboard stats (social_bp)
  stats: () => socialApi.get('/admin/stats'),

  // User management (social_bp)
  users: (params) => socialApi.get('/admin/users', {params}),
  updateUser: (userId, data) => socialApi.patch(`/admin/users/${userId}`, data),
  banUser: (userId, data) => socialApi.post(`/admin/users/${userId}/ban`, data),
  unbanUser: (userId) => socialApi.delete(`/admin/users/${userId}/ban`),

  // Agent sync (social_bp)
  syncAgents: () => socialApi.post('/admin/agents/sync'),

  // System metrics (channels admin_bp at /api/admin)
  metrics: () => adminApiClient.get('/metrics'),
  status: () => adminApiClient.get('/status'),
  latency: () => adminApiClient.get('/metrics/latency'),

  // Agents — enumerate + pause/resume (channels admin_bp at /api/admin)
  // Operator surface: list all registered agents with daemon status, pause a
  // runaway agent (skips it on the next idle-detection tick), or resume one.
  listAgents: () => adminApiClient.get('/agents'),
  pauseAgent: (agentId) =>
    adminApiClient.post(`/agents/${encodeURIComponent(agentId)}/pause`),
  resumeAgent: (agentId) =>
    adminApiClient.post(`/agents/${encodeURIComponent(agentId)}/resume`),

  // Logs (social_bp)
  logs: (params) => socialApi.get('/admin/logs', {params}),

  // Revenue & Usage Analytics (central admin)
  revenueAnalytics: (params) =>
    socialApi.get('/admin/revenue-analytics', {params}),
};

// --- Moderation API ---
export const moderationApi = {
  // Get reported content
  reports: (params) => socialApi.get('/admin/moderation/reports', {params}),
  getReport: (id) => socialApi.get(`/admin/moderation/reports/${id}`),
  resolveReport: (id, data) =>
    socialApi.post(`/admin/moderation/reports/${id}/resolve`, data),

  // Content actions
  hidePost: (postId) =>
    socialApi.post(`/admin/moderation/posts/${postId}/hide`),
  unhidePost: (postId) =>
    socialApi.delete(`/admin/moderation/posts/${postId}/hide`),
  deletePost: (postId) => socialApi.delete(`/admin/moderation/posts/${postId}`),

  // Comment actions
  hideComment: (commentId) =>
    socialApi.post(`/admin/moderation/comments/${commentId}/hide`),
  deleteComment: (commentId) =>
    socialApi.delete(`/admin/moderation/comments/${commentId}`),
};

// --- Channels API (Bot integrations) --- uses channels admin_bp at /api/admin
export const channelsApi = {
  list: () => adminApiClient.get('/channels'),
  get: (channelType) => adminApiClient.get(`/channels/${channelType}`),
  create: (data) => adminApiClient.post('/channels', data),
  update: (channelType, data) =>
    adminApiClient.put(`/channels/${channelType}`, data),
  delete: (channelType) => adminApiClient.delete(`/channels/${channelType}`),
  enable: (channelType) =>
    adminApiClient.post(`/channels/${channelType}/enable`),
  disable: (channelType) =>
    adminApiClient.post(`/channels/${channelType}/disable`),
  test: (channelType) => adminApiClient.post(`/channels/${channelType}/test`),
  reconnect: (channelType) =>
    adminApiClient.post(`/channels/${channelType}/reconnect`),
};

// --- Channel User API (user-facing channel bindings, presence, pairing) ---
export const channelUserApi = {
  catalog: () => socialApi.get('/channels/catalog'),
  catalogChannel: (type) => socialApi.get(`/channels/catalog/${type}`),
  bindings: () => socialApi.get('/channels/bindings'),
  createBinding: (data) => socialApi.post('/channels/bindings', data),
  removeBinding: (id) => socialApi.delete(`/channels/bindings/${id}`),
  setPreferred: (id) => socialApi.put(`/channels/bindings/${id}/preferred`),
  generatePairCode: () => socialApi.post('/channels/pair/generate'),
  verifyPairCode: (data) => socialApi.post('/channels/pair/verify', data),
  presence: () => socialApi.get('/channels/presence'),
  conversations: (params) => socialApi.get('/channels/conversations', {params}),
};

// --- Workflows API --- uses channels admin_bp at /api/admin/automation/workflows
export const workflowsApi = {
  list: (params) => adminApiClient.get('/automation/workflows', {params}),
  get: (id) => adminApiClient.get(`/automation/workflows/${id}`),
  create: (data) => adminApiClient.post('/automation/workflows', data),
  update: (id, data) => adminApiClient.put(`/automation/workflows/${id}`, data),
  delete: (id) => adminApiClient.delete(`/automation/workflows/${id}`),
  enable: (id) => adminApiClient.post(`/automation/workflows/${id}/enable`),
  disable: (id) => adminApiClient.post(`/automation/workflows/${id}/disable`),
  test: (id, data) =>
    adminApiClient.post(`/automation/workflows/${id}/execute`, data),
};

// --- Settings API --- uses channels admin_bp at /api/admin/config
export const settingsApi = {
  get: () => adminApiClient.get('/config'),
  update: (data) => adminApiClient.put('/config', data),
  getSecurity: () => adminApiClient.get('/config/security'),
  updateSecurity: (data) => adminApiClient.put('/config/security', data),
  getMedia: () => adminApiClient.get('/config/media'),
  updateMedia: (data) => adminApiClient.put('/config/media', data),
  getResponse: () => adminApiClient.get('/config/response'),
  updateResponse: (data) => adminApiClient.put('/config/response', data),
  getMemory: () => adminApiClient.get('/config/memory'),
  updateMemory: (data) => adminApiClient.put('/config/memory', data),
  getEmbodiedAI: () => adminApiClient.get('/config/embodied'),
  updateEmbodiedAI: (data) => adminApiClient.put('/config/embodied', data),
  toggleFeed: (data) => adminApiClient.post('/config/embodied/toggle', data),
  getEmbodiedStatus: () => adminApiClient.get('/config/embodied/status'),
  export: () => adminApiClient.get('/config/export'),
  import: (data) => adminApiClient.post('/config/import', data),
  reset: () => adminApiClient.post('/config/reset'),
  // Chat-restore policy (J207) — single source of truth for both
  // frontend provider + admin UI. Wraps the canonical handlers at
  // main.py (/api/admin/config/chat) which delegate to
  // desktop.chat_settings. Keep this next to the other settingsApi
  // entries so adding new settings slabs stays a one-file edit.
  getChat: () => adminApiClient.get('/config/chat'),
  updateChat: (data) => adminApiClient.put('/config/chat', data),
};

// --- Identity API (Agent personality) --- uses channels admin_bp at /api/admin/identity
export const identityApi = {
  get: () => adminApiClient.get('/identity'),
  update: (data) => adminApiClient.put('/identity', data),
  getAvatars: () => adminApiClient.get('/identity/avatars'),
  uploadAvatar: (data) => adminApiClient.post('/identity/avatars', data),
  deleteAvatar: (id) => adminApiClient.delete(`/identity/avatars/${id}`),
  setDefaultAvatar: (id) =>
    adminApiClient.post(`/identity/avatars/${id}/default`),
  getSenderMappings: () => adminApiClient.get('/identity/sender-mappings'),
  createSenderMapping: (data) =>
    adminApiClient.post('/identity/sender-mappings', data),
  deleteSenderMapping: (id) =>
    adminApiClient.delete(`/identity/sender-mappings/${id}`),
};

// --- Agent Dashboard API (truth-grounded, auto-refresh) ---
export const dashboardApi = {
  agents: () => socialApi.get('/dashboard/agents'),
  health: () => socialApi.get('/dashboard/health'),
};

// --- Chat API (Local Nunba backend) ---
// Local LLM inference can take 60-90s on small models — use 120s timeout
const chatApiClient = createApiClient(CHAT_API_URL, {
  timeout: 120000,
  cache: false,
});

// Cloud fallback client (no 401 handling — public endpoints)
const cloudApiClient = createApiClient(CLOUD_API_URL, {
  handle401: false,
  cache: false,
});

export const chatApi = {
  // Get prompts/agents (local and cloud)
  getPrompts: (userId) =>
    chatApiClient.get('/prompts', {params: {user_id: userId}}),

  // Get ALL public prompts (local-first, includes cloud merge)
  getPublicPrompts: () => chatApiClient.get('/prompts/public'),

  // Cloud fallbacks (only when local backend is unreachable)
  getPublicPromptsCloud: () => cloudApiClient.get('/getprompt_all/'),
  getUserPromptsCloud: (userId) =>
    cloudApiClient.get('/getprompt_userid/', {params: {user_id: userId}}),

  // Chat with agent
  chat: (data) => chatApiClient.post('/chat', data),

  // Custom GPT endpoint
  customGpt: (data) => chatApiClient.post('/custom_gpt', data),

  // TTS endpoints
  ttsVoices: () => chatApiClient.get('/tts/voices'),
  ttsSynthesize: (data) => chatApiClient.post('/tts/synthesize', data),
  ttsStatus: () => chatApiClient.get('/tts/status'),

  // Health check
  health: () => chatApiClient.get('/backend/health'),

  // LLM readiness (drives the boot-time message queue gate in Demopage).
  // Returns {available: bool, llm_mode, first_run, ...}.  Distinct from
  // backend/health which is a GPU-tier classifier — this one tells us
  // whether the local LLM is actually loaded and reachable.
  llmStatus: () => chatApiClient.get('/api/llm/status'),

  // Network status
  networkStatus: () => chatApiClient.get('/network/status'),

  // Agent sync (multi-device)
  getAgentSync: () => chatApiClient.get('/agents/sync'),
  syncAgents: (agents) => chatApiClient.post('/agents/sync', {agents}),

  // Agent migration (guest → authenticated)
  migrateAgents: (data) => chatApiClient.post('/agents/migrate', data),

  // LLM config (AI provider management)
  getLlmConfig: () => chatApiClient.get('/api/llm/config'),
  updateLlmConfig: (data) => chatApiClient.post('/api/llm/config', data),
  testLlmConnection: (data) => chatApiClient.post('/api/llm/test', data),

  // Vault API (tool keys + channel secrets — encrypted, machine-locked)
  vaultStore: (data) => chatApiClient.post('/api/vault/store', data),
  vaultKeys: () => chatApiClient.get('/api/vault/keys'),
  vaultHas: (keyName, channelType) =>
    chatApiClient.get('/api/vault/has', {
      params: {key_name: keyName, channel_type: channelType || ''},
    }),

  // Generic passthrough (for one-off endpoints)
  get: (path, config) => chatApiClient.get(path, config),
  post: (path, data, config) => chatApiClient.post(path, data, config),

  // J207 "Forget Me" — wipes guest_id.json + bucket cache on server.
  // The confirm:true envelope is a belt-and-suspenders check the
  // backend enforces (main.py api_guest_id_delete).
  forgetGuest: () =>
    chatApiClient.delete('/api/guest-id', {data: {confirm: true}}),
};

// --- Thought Experiment Tracker API ---
export const trackerApi = {
  listExperiments: (params) => socialApi.get('/tracker/experiments', {params}),
  getExperiment: (postId) => socialApi.get(`/tracker/experiments/${postId}`),
  getConversations: (postId) =>
    socialApi.get(`/tracker/experiments/${postId}/conversations`),
  approve: (postId, data) =>
    socialApi.post(`/tracker/experiments/${postId}/approve`, data),
  reject: (postId, data) =>
    socialApi.post(`/tracker/experiments/${postId}/reject`, data),
  getNotifications: () => socialApi.get('/tracker/notifications'),
  // Pledge endpoints (canonical — all pledge ops go through tracker_bp)
  pledges: (postId) => socialApi.get(`/tracker/experiments/${postId}/pledges`),
  pledgeSummary: (postId) => socialApi.get(`/tracker/experiments/${postId}/pledge-summary`),
  pledge: (postId, data) => socialApi.post(`/tracker/experiments/${postId}/pledge`, data),
  withdrawPledge: (postId, escrowId) => socialApi.delete(`/tracker/experiments/${postId}/pledge/${escrowId}`),
  insights: (postId) => socialApi.get(`/tracker/experiments/${postId}/insights`),
  myPledges: (params) => socialApi.get('/tracker/pledges/mine', { params }),
  allPledges: (params) => socialApi.get('/tracker/pledges/all', { params }),
  verifyPledge: (escrowId) => socialApi.post(`/tracker/pledges/${escrowId}/verify`),
  inject: (postId, data) => socialApi.post(`/tracker/experiments/${postId}/inject`, data),
  interview: (postId, data) => socialApi.post(`/tracker/experiments/${postId}/interview`, data),
  dualContext: (data) => socialApi.post('/tracker/dual-context', data),
  encounters: () => socialApi.get('/tracker/encounters'),
};

// --- Experiment Discovery ---
export const experimentsApi = {
  discover: (params) => socialApi.get('/experiments/discover', {params}),
  list: (params) => socialApi.get('/experiments', {params}),
  get: (id) => socialApi.get(`/experiments/${id}`),
  create: (data) => socialApi.post('/experiments', data),
  vote: (id, data) => socialApi.post(`/experiments/${id}/vote`, data),
  advance: (id, data) => socialApi.post(`/experiments/${id}/advance`, data),
  evaluate: (id) => socialApi.post(`/experiments/${id}/evaluate`),
  decide: (id, data) => socialApi.post(`/experiments/${id}/decide`, data),
  votes: (id) => socialApi.get(`/experiments/${id}/votes`),
  timeline: (id) => socialApi.get(`/experiments/${id}/timeline`),
  coreIp: () => socialApi.get('/experiments/core-ip'),
  metrics: (id) => socialApi.get(`/experiments/${id}/metrics`),
  contribute: (id, data) =>
    socialApi.post(`/experiments/${id}/contribute`, data),
};

// --- Sync & Backup ---
export const syncApi = {
  createBackup: (data) => socialApi.post('/sync/backup', data),
  getBackupMetadata: () => socialApi.get('/sync/backup/metadata'),
  restore: (data) => socialApi.post('/sync/restore', data),
  linkDevice: (data) => socialApi.post('/sync/link-device', data),
  listDevices: () => socialApi.get('/sync/devices'),
  unlinkDevice: (id) => socialApi.delete(`/sync/devices/${id}`),
};

// --- Audit ---
export const auditApi = {
  listAgents: (params) => socialApi.get('/audit/agents', {params}),
  getTimeline: (agentId, params) =>
    socialApi.get(`/audit/agents/${agentId}/timeline`, {params}),
  getConversations: (agentId) =>
    socialApi.get(`/audit/agents/${agentId}/conversations`),
  getThinking: (agentId) => socialApi.get(`/audit/agents/${agentId}/thinking`),
  getDaemonActivity: () => socialApi.get('/audit/daemon/activity'),
  getDaemonGoals: (params) => socialApi.get('/audit/daemon/goals', {params}),
  getComputeNodes: () => socialApi.get('/audit/compute/nodes'),
  getComputeUsage: (params) => socialApi.get('/audit/compute/usage', {params}),
  getComputeRouting: () => socialApi.get('/audit/compute/routing'),
};

// --- Ads ---
export const adApi = {
  serve: (placement, params = {}) =>
    socialApi.get('/ads/serve', {
      params: {placement_name: placement, ...params},
    }),
  impression: (adId) =>
    socialApi.post(`/ads/${adId}/impression`).catch(() => {}),
  click: (adId) => socialApi.post(`/ads/${adId}/click`).catch(() => {}),
};

// --- Content Generation Tracking ---
export const contentGenApi = {
  getGames: () => socialApi.get('/content-gen/games'),
  getGame: (gameId) => socialApi.get(`/content-gen/games/${gameId}`),
  getStuck: (thresholdHours = 24) =>
    socialApi.get('/content-gen/stuck', {
      params: {threshold_hours: thresholdHours},
    }),
  retry: (gameId, taskType = null) =>
    socialApi.post('/content-gen/retry', {
      game_id: gameId,
      task_type: taskType,
    }),
  getServices: () => socialApi.get('/content-gen/services'),
  register: (gameId, gameConfig) =>
    socialApi.post('/content-gen/register', {
      game_id: gameId,
      game_config: gameConfig,
    }),
};

// --- Theme (OS-wide appearance) ---
export const themeApi = {
  getPresets: () => socialApi.get('/theme/presets'),
  getActive: () => socialApi.get('/theme/active'),
  apply: (themeId) => socialApi.post('/theme/apply', {theme_id: themeId}),
  customize: (overrides) => socialApi.post('/theme/customize', overrides),
  getFonts: () => socialApi.get('/theme/fonts'),
  generate: (description, basePreset) =>
    socialApi.post('/theme/generate', {description, base_preset: basePreset}),
  getUserTheme: (userId) => socialApi.get(`/users/${userId}/theme`),
};

// --- Mailer API (external service — no JWT auth, no 401 handling) ---
const mailerApiClient = createApiClient(MAILER_BASE_URL, {
  handle401: false,
  cache: false,
});

export const mailerApi = {
  // OTP
  sendOtp: (data) => mailerApiClient.post('/send_otp', data),
  validateOtp: (data) => mailerApiClient.post('/validate_otp', data),
  verifyOtp: (data) => mailerApiClient.post('/varify_otp', data),
  renewToken: (data) => mailerApiClient.post('/refresh_tokens', data),

  // Teacher/Admin auth
  verifyTeacher: (data) => mailerApiClient.post('/verifyTeacher', data),
  verifyTeacherByPhone: (data) =>
    mailerApiClient.post('/verifyTeacherByPhone', data),
  registerTeacher: (data) => mailerApiClient.post('/register_teacher', data),
  registerStudent: (data) => mailerApiClient.post('/register_student', data),
  createClient: (data) => mailerApiClient.post('/createclient', data),
  allClients: () => mailerApiClient.get('/allclients'),
  deleteUser: (data) =>
    mailerApiClient.post('/delete_user_by_email_or_phone_num', data),
  confirmDeleteUser: (data) =>
    mailerApiClient.post('/confirm_delete_user_by_email_or_phone_num', data),

  // Courses/Content
  getSubjects: () => mailerApiClient.get('/getuniquesubject'),
  getStandards: () => mailerApiClient.get('/getstandard'),
  getBoards: () => mailerApiClient.get('/getboard'),
  getBooks: () => mailerApiClient.get('/getbooks'),
  getCourses: () => mailerApiClient.get('/getuniquecourse'),
  getBatch: () => mailerApiClient.get('/getbatch'),
  createCourse: (data) => mailerApiClient.post('/create_course', data),
  createBookSubject: (data) => mailerApiClient.post('/createbooksubject', data),
  getBooksByCourse: (courseId) =>
    mailerApiClient.get(`/getbooksbycourse?course_name=${courseId}`),

  // Subscriptions/Payments
  getPlans: () => mailerApiClient.get('/getallplandetails'),
  addSubscription: (data) =>
    mailerApiClient.post('/addsubscription_by_phone', data),
  makePayment: (data) => mailerApiClient.post('/makepayment', data),
  deductCredits: (data) => mailerApiClient.post('/deduct-credits', data),

  // Assessments
  allAssessments: (params) => mailerApiClient.get('/allassessments', {params}),
  getQAByAssessment: (name) =>
    mailerApiClient.get('/get_all_QAs_by_assessment_name', {
      params: {assessment_name: name},
    }),
  createPromptList: (data) => mailerApiClient.post('/createpromptlist', data),
  updateQA: (id, data) => mailerApiClient.put(`/updateQA/${id}`, data),
  deleteQA: (id) => mailerApiClient.delete(`/deleteQA/${id}`),

  // Prompts
  getPromptsByUser: (userId) =>
    mailerApiClient.get(`/getprompt_onlyuserid/?user_id=${userId}`),
  getFamousCharacters: () => mailerApiClient.get('/get_famous_character'),

  // Generic request (for edge cases during migration)
  get: (path, config) => mailerApiClient.get(path, config),
  post: (path, data, config) => mailerApiClient.post(path, data, config),
};

// ─── Multiplayer Games ───
export const gamesApi = {
  catalog: (params) => socialApi.get('/games/catalog', {params}),
  create: (data) => socialApi.post('/games', data),
  list: (params) => socialApi.get('/games', {params}),
  get: (id) => socialApi.get(`/games/${id}`),
  join: (id) => socialApi.post(`/games/${id}/join`),
  ready: (id) => socialApi.post(`/games/${id}/ready`),
  start: (id) => socialApi.post(`/games/${id}/start`),
  move: (id, data) => socialApi.post(`/games/${id}/move`, data),
  leave: (id) => socialApi.post(`/games/${id}/leave`),
  results: (id) => socialApi.get(`/games/${id}/results`),
  history: (params) => socialApi.get('/games/history', {params}),
  quickMatch: (data) => socialApi.post('/games/quick-match', data),
  fromEncounter: (encounterId, data) =>
    socialApi.post(`/games/from-encounter/${encounterId}`, data),
};

// ─── Compute Lending ───
export const computeApi = {
  optIn: () => socialApi.post('/compute/opt-in'),
  optOut: () => socialApi.post('/compute/opt-out'),
  status: () => socialApi.get('/compute/status'),
  impact: () => socialApi.get('/compute/impact'),
  communityImpact: () => socialApi.get('/compute/community-impact'),
  healthCheck: () => socialApi.post('/compute/health-check'),
};

// pledgeApi removed — all pledge endpoints consolidated into trackerApi above.
// Use trackerApi.pledge(), trackerApi.pledgeSummary(), trackerApi.insights(), etc.

// --- MCP Server Registry ---
export const mcpApi = {
  servers: (params) => socialApi.get('/mcp/servers', {params}),
  tools: (serverId) => socialApi.get(`/mcp/servers/${serverId}/tools`),
  register: (data) => socialApi.post('/mcp/register', data),
  discover: (params) => socialApi.get('/mcp/discover', {params}),
};

// --- Mentions (Phase 7a) — universal @-mention autocomplete.
// scope: { kind?: 'human'|'agent'|'all', community_id?, conversation_id?, limit? }
// Server flag-gated by `mentions_autocomplete`; off → returns [].
export const mentionsApi = {
  autocomplete: (q, scope = {}) =>
    socialApi.get('/users/autocomplete', {
      params: {q, ...scope},
    }),
  list: (params) => socialApi.get('/mentions', {params}),
  markRead: (id) => socialApi.post(`/mentions/${id}/read`),
};

// --- Friends (Phase 7c.1) — symmetric Friendship state machine.
// Coexists with usersApi.follow / unfollow per Plan B.1.
// Server flag-gated (`friends_v2`); off → list endpoints return [].
export const friendsApi = {
  sendRequest: (target_user_id) =>
    socialApi.post('/friends/request', {target_user_id}),
  accept: (friendship_id) =>
    socialApi.post(`/friends/request/${friendship_id}/accept`),
  reject: (friendship_id) =>
    socialApi.post(`/friends/request/${friendship_id}/reject`),
  cancel: (friendship_id) =>
    socialApi.post(`/friends/request/${friendship_id}/cancel`),
  unfriend: (user_id) =>
    socialApi.post(`/friends/${user_id}/unfriend`),
  list: (status = 'active') =>
    socialApi.get('/friends', {params: {status}}),
  listPending: () =>
    socialApi.get('/friends', {params: {status: 'pending'}}),
  listBlocks: () => socialApi.get('/friends/blocks'),
  block: (user_id, reason) =>
    socialApi.post(`/friends/${user_id}/block`,
                   reason ? {reason} : undefined),
  unblock: (user_id) => socialApi.post(`/friends/${user_id}/unblock`),
};

// --- Invites (Phase 7c.2) — community + conversation invites.
// Server flag-gated (`invites_v2`).  Three shapes:
//   1. Targeted user — invitee_id set
//   2. Off-platform email — invitee_email set
//   3. Shareable link — neither set; server returns invite_code
export const invitesApi = {
  send: ({parent_kind, parent_id, invitee_id, invitee_email,
          role_offered, expires_in_days} = {}) =>
    socialApi.post('/invites', {
      parent_kind, parent_id, invitee_id, invitee_email,
      role_offered, expires_in_days,
    }),
  accept: (invite_id) => socialApi.post(`/invites/${invite_id}/accept`),
  reject: (invite_id) => socialApi.post(`/invites/${invite_id}/reject`),
  listIncoming: (include_responded = false) =>
    socialApi.get('/invites/incoming',
                  include_responded ?
                    {params: {include_responded: 'true'}} : undefined),
  resolveCode: (code) => socialApi.get(`/invites/code/${code}`),
};

// --- Marketplace ---
export const marketplaceApi = {
  listings: (params) => socialApi.get('/marketplace/listings', {params}),
  get: (id) => socialApi.get(`/marketplace/listings/${id}`),
  create: (data) => socialApi.post('/marketplace/listings', data),
  hire: (id, data) => socialApi.post(`/marketplace/listings/${id}/hire`, data),
  reviews: (id) => socialApi.get(`/marketplace/listings/${id}/reviews`),
  addReview: (id, data) =>
    socialApi.post(`/marketplace/listings/${id}/reviews`, data),
  categories: () => socialApi.get('/marketplace/categories'),
};

export default socialApi;
