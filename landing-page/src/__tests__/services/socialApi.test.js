/**
 * socialApi.test.js — Unit tests for the socialApi service module.
 * Tests API structure, method signatures, and correct URL construction.
 *
 * Strategy: mock axiosFactory at the module level. The jest.mock factory
 * returns a stable object that we can inspect via require() after init.
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

// Now import the APIs that use createApiClient internally
const socialApiModule = require('../../services/socialApi');

const {
  authApi,
  postsApi,
  commentsApi,
  feedApi,
  usersApi,
  communitiesApi,
  searchApi,
  notificationsApi,
  resonanceApi,
  achievementsApi,
  challengesApi,
  seasonsApi,
  referralsApi,
  onboardingApi,
  shareApi,
  adminApi,
  moderationApi,
  channelsApi,
  settingsApi,
  identityApi,
  chatApi,
  tasksApi,
  recipesApi,
  gamesApi,
  computeApi,
  mcpApi,
  marketplaceApi,
  themeApi,
} = socialApiModule;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Auth API ──────────────────────────────────────────────────────────────
describe('authApi', () => {
  it('login calls POST /auth/login', async () => {
    await authApi.login({username: 'user', password: 'pass'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', {
      username: 'user',
      password: 'pass',
    });
  });

  it('register calls POST /auth/register', async () => {
    await authApi.register({username: 'new', password: 'pw'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/register', {
      username: 'new',
      password: 'pw',
    });
  });

  it('me calls GET /auth/me', async () => {
    await authApi.me();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
  });

  it('logout calls POST /auth/logout', async () => {
    await authApi.logout();
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('guestRegister calls POST /auth/guest-register', async () => {
    await authApi.guestRegister({handle: 'guest1'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/auth/guest-register',
      {handle: 'guest1'}
    );
  });
});

// ── Posts API ─────────────────────────────────────────────────────────────
describe('postsApi', () => {
  it('list calls GET /posts with params', async () => {
    await postsApi.list({limit: 10, offset: 0});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/posts', {
      params: {limit: 10, offset: 0},
    });
  });

  it('create calls POST /posts', async () => {
    await postsApi.create({title: 'Test', content: 'Body'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/posts', {
      title: 'Test',
      content: 'Body',
    });
  });

  it('get calls GET /posts/:id', async () => {
    await postsApi.get('abc');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/posts/abc');
  });

  it('update calls PATCH /posts/:id', async () => {
    await postsApi.update('abc', {title: 'Updated'});
    expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/posts/abc', {
      title: 'Updated',
    });
  });

  it('delete calls DELETE /posts/:id', async () => {
    await postsApi.delete('abc');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/posts/abc');
  });

  it('upvote calls POST /posts/:id/upvote', async () => {
    await postsApi.upvote('123');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/posts/123/upvote');
  });

  it('downvote calls POST /posts/:id/downvote', async () => {
    await postsApi.downvote('123');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/posts/123/downvote');
  });

  it('removeVote calls DELETE /posts/:id/vote', async () => {
    await postsApi.removeVote('123');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/posts/123/vote');
  });
});

// ── Comments API ──────────────────────────────────────────────────────────
describe('commentsApi', () => {
  it('getByPost calls GET /posts/:postId/comments', async () => {
    await commentsApi.getByPost('post1', {limit: 5});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/posts/post1/comments',
      {params: {limit: 5}}
    );
  });

  it('create calls POST /posts/:postId/comments', async () => {
    await commentsApi.create('post1', {content: 'comment'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/posts/post1/comments',
      {content: 'comment'}
    );
  });

  it('reply calls POST /comments/:id/reply', async () => {
    await commentsApi.reply('c1', {content: 'reply'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/comments/c1/reply', {
      content: 'reply',
    });
  });

  it('upvote calls POST /comments/:id/upvote', async () => {
    await commentsApi.upvote('c1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/comments/c1/upvote');
  });
});

// ── Feed API ──────────────────────────────────────────────────────────────
describe('feedApi', () => {
  it('personalized calls GET /feed', async () => {
    await feedApi.personalized({limit: 20});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/feed', {
      params: {limit: 20},
    });
  });

  it('global calls GET /feed/all', async () => {
    await feedApi.global({limit: 10});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/feed/all', {
      params: {limit: 10},
    });
  });

  it('trending calls GET /feed/trending', async () => {
    await feedApi.trending({});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/feed/trending', {
      params: {},
    });
  });

  it('agents calls GET /feed/agents', async () => {
    await feedApi.agents({});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/feed/agents', {
      params: {},
    });
  });

  it('agentSpotlight calls GET /feed/agent-spotlight', async () => {
    await feedApi.agentSpotlight();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/feed/agent-spotlight');
  });
});

// ── Users API ─────────────────────────────────────────────────────────────
describe('usersApi', () => {
  it('get calls GET /users/:id', async () => {
    await usersApi.get('user1');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/user1');
  });

  it('follow calls POST /users/:id/follow', async () => {
    await usersApi.follow('user1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/users/user1/follow');
  });

  it('unfollow calls DELETE /users/:id/follow', async () => {
    await usersApi.unfollow('user1');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
      '/users/user1/follow'
    );
  });

  it('posts calls GET /users/:id/posts', async () => {
    await usersApi.posts('u1', {limit: 5});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/u1/posts', {
      params: {limit: 5},
    });
  });

  it('getAgents calls GET /users/:userId/agents', async () => {
    await usersApi.getAgents('u1');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/u1/agents');
  });
});

// ── Communities API ───────────────────────────────────────────────────────
describe('communitiesApi', () => {
  it('join calls POST /communities/:id/join', async () => {
    await communitiesApi.join('comm1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/communities/comm1/join'
    );
  });

  it('leave calls DELETE /communities/:id/leave', async () => {
    await communitiesApi.leave('comm1');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
      '/communities/comm1/leave'
    );
  });
});

// ── Search API ────────────────────────────────────────────────────────────
describe('searchApi', () => {
  it('search calls GET /search with params', async () => {
    await searchApi.search({q: 'test'});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search', {
      params: {q: 'test'},
    });
  });
});

// ── Notifications API ─────────────────────────────────────────────────────
describe('notificationsApi', () => {
  it('list calls GET /notifications', async () => {
    await notificationsApi.list({unread: true});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/notifications', {
      params: {unread: true},
    });
  });

  it('markRead calls POST /notifications/read with ids', async () => {
    await notificationsApi.markRead(['n1', 'n2']);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/notifications/read', {
      ids: ['n1', 'n2'],
    });
  });

  it('markAllRead calls POST /notifications/read-all', async () => {
    await notificationsApi.markAllRead();
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/notifications/read-all'
    );
  });
});

// ── Resonance API ─────────────────────────────────────────────────────────
describe('resonanceApi', () => {
  it('getWallet calls GET /resonance/wallet', async () => {
    await resonanceApi.getWallet();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/resonance/wallet');
  });

  it('dailyCheckin calls POST /resonance/daily-checkin', async () => {
    await resonanceApi.dailyCheckin();
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/resonance/daily-checkin'
    );
  });

  it('getStreak calls GET /resonance/streak', async () => {
    await resonanceApi.getStreak();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/resonance/streak');
  });

  it('boost calls POST /resonance/boost', async () => {
    await resonanceApi.boost({target_type: 'post', target_id: '123'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/resonance/boost', {
      target_type: 'post',
      target_id: '123',
    });
  });
});

// ── Referrals API ─────────────────────────────────────────────────────────
describe('referralsApi', () => {
  it('getCode calls GET /referral/code', async () => {
    await referralsApi.getCode();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/referral/code');
  });

  it('use calls POST /referral/use', async () => {
    await referralsApi.use({code: 'REF123'});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/referral/use', {
      code: 'REF123',
    });
  });
});

// ── Share API ─────────────────────────────────────────────────────────────
describe('shareApi', () => {
  it('createLink calls POST /share/link with correct params', async () => {
    await shareApi.createLink('post', 'p1', true);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/share/link', {
      resource_type: 'post',
      resource_id: 'p1',
      is_private: true,
    });
  });

  it('resolve calls GET /share/:token', async () => {
    await shareApi.resolve('abc123');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/share/abc123');
  });
});

// ── Moderation API ────────────────────────────────────────────────────────
describe('moderationApi', () => {
  it('hidePost calls POST /admin/moderation/posts/:id/hide', async () => {
    await moderationApi.hidePost('p1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/admin/moderation/posts/p1/hide'
    );
  });

  it('deletePost calls DELETE /admin/moderation/posts/:id', async () => {
    await moderationApi.deletePost('p1');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
      '/admin/moderation/posts/p1'
    );
  });
});

// ── Theme API ─────────────────────────────────────────────────────────────
describe('themeApi', () => {
  it('getPresets calls GET /theme/presets', async () => {
    await themeApi.getPresets();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/theme/presets');
  });

  it('apply calls POST /theme/apply', async () => {
    await themeApi.apply('dark-purple');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/theme/apply', {
      theme_id: 'dark-purple',
    });
  });

  it('generate calls POST /theme/generate', async () => {
    await themeApi.generate('ocean vibes', 'midnight');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/theme/generate', {
      description: 'ocean vibes',
      base_preset: 'midnight',
    });
  });
});

// ── Games API ─────────────────────────────────────────────────────────────
describe('gamesApi', () => {
  it('catalog calls GET /games/catalog', async () => {
    await gamesApi.catalog({category: 'puzzle'});
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/games/catalog', {
      params: {category: 'puzzle'},
    });
  });

  it('join calls POST /games/:id/join', async () => {
    await gamesApi.join('g1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/games/g1/join');
  });

  it('move calls POST /games/:id/move', async () => {
    await gamesApi.move('g1', {x: 1, y: 2});
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/games/g1/move', {
      x: 1,
      y: 2,
    });
  });
});

// ── Friends API (Phase 7c.1) ──────────────────────────────────────────────
describe('friendsApi', () => {
  const {friendsApi} = socialApiModule;

  it('sendRequest → POST /friends/request with target_user_id', async () => {
    await friendsApi.sendRequest('user-42');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/request', {target_user_id: 'user-42'});
  });

  it('accept → POST /friends/request/<id>/accept', async () => {
    await friendsApi.accept('f-123');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/request/f-123/accept');
  });

  it('reject → POST /friends/request/<id>/reject', async () => {
    await friendsApi.reject('f-123');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/request/f-123/reject');
  });

  it('cancel → POST /friends/request/<id>/cancel', async () => {
    await friendsApi.cancel('f-9');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/request/f-9/cancel');
  });

  it('unfriend → POST /friends/<userId>/unfriend', async () => {
    await friendsApi.unfriend('u-77');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/u-77/unfriend');
  });

  it('block(userId, reason) → POST /friends/<userId>/block with reason', async () => {
    await friendsApi.block('u-99', 'spam');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/u-99/block', {reason: 'spam'});
  });

  it('block(userId) without reason → POST without reason field', async () => {
    await friendsApi.block('u-99');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/u-99/block', undefined);
  });

  it('unblock → POST /friends/<userId>/unblock', async () => {
    await friendsApi.unblock('u-99');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/friends/u-99/unblock');
  });

  it('list defaults to status=active → GET /friends?status=active', async () => {
    await friendsApi.list();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/friends', {params: {status: 'active'}});
  });

  it('listPending → GET /friends?status=pending', async () => {
    await friendsApi.listPending();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/friends', {params: {status: 'pending'}});
  });

  it('listBlocks → GET /friends/blocks', async () => {
    await friendsApi.listBlocks();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/friends/blocks');
  });
});

// ── Invites API (Phase 7c.2) ──────────────────────────────────────────────
describe('invitesApi', () => {
  const {invitesApi} = socialApiModule;

  it('send targeted-user → POST /invites with invitee_id', async () => {
    await invitesApi.send({
      parent_kind: 'community', parent_id: 'c-1',
      invitee_id: 'u-7', role_offered: 'member',
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invites', {
      parent_kind: 'community', parent_id: 'c-1',
      invitee_id: 'u-7', invitee_email: undefined,
      role_offered: 'member', expires_in_days: undefined,
    });
  });

  it('send shareable link → POST without invitee_id', async () => {
    await invitesApi.send({
      parent_kind: 'community', parent_id: 'c-1',
      role_offered: 'member', expires_in_days: 7,
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/invites', {
      parent_kind: 'community', parent_id: 'c-1',
      invitee_id: undefined, invitee_email: undefined,
      role_offered: 'member', expires_in_days: 7,
    });
  });

  it('send off-platform email → POST with invitee_email', async () => {
    await invitesApi.send({
      parent_kind: 'community', parent_id: 'c-1',
      invitee_email: 'friend@example.test',
      role_offered: 'member',
    });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/invites',
      expect.objectContaining({invitee_email: 'friend@example.test'}));
  });

  it('accept → POST /invites/<id>/accept', async () => {
    await invitesApi.accept('inv-42');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/invites/inv-42/accept');
  });

  it('reject → POST /invites/<id>/reject', async () => {
    await invitesApi.reject('inv-42');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/invites/inv-42/reject');
  });

  it('listIncoming → GET /invites/incoming (no params)', async () => {
    await invitesApi.listIncoming();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/invites/incoming', undefined);
  });

  it('resolveCode → GET /invites/code/<code>', async () => {
    await invitesApi.resolveCode('abc-xyz-123');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/invites/code/abc-xyz-123');
  });
});

// ── Compute API ───────────────────────────────────────────────────────────
describe('computeApi', () => {
  it('optIn calls POST /compute/opt-in', async () => {
    await computeApi.optIn();
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/compute/opt-in');
  });

  it('status calls GET /compute/status', async () => {
    await computeApi.status();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/compute/status');
  });
});

// ── API structure completeness ────────────────────────────────────────────
describe('API module structure', () => {
  it('all expected API modules are exported', () => {
    expect(authApi).toBeDefined();
    expect(postsApi).toBeDefined();
    expect(commentsApi).toBeDefined();
    expect(feedApi).toBeDefined();
    expect(usersApi).toBeDefined();
    expect(communitiesApi).toBeDefined();
    expect(searchApi).toBeDefined();
    expect(notificationsApi).toBeDefined();
    expect(resonanceApi).toBeDefined();
    expect(achievementsApi).toBeDefined();
    expect(challengesApi).toBeDefined();
    expect(seasonsApi).toBeDefined();
    expect(referralsApi).toBeDefined();
    expect(onboardingApi).toBeDefined();
    expect(shareApi).toBeDefined();
    expect(adminApi).toBeDefined();
    expect(moderationApi).toBeDefined();
    expect(channelsApi).toBeDefined();
    expect(settingsApi).toBeDefined();
    expect(identityApi).toBeDefined();
    expect(chatApi).toBeDefined();
    expect(tasksApi).toBeDefined();
    expect(recipesApi).toBeDefined();
    expect(gamesApi).toBeDefined();
    expect(computeApi).toBeDefined();
    expect(mcpApi).toBeDefined();
    expect(marketplaceApi).toBeDefined();
    expect(themeApi).toBeDefined();
  });

  it('postsApi has all CRUD methods', () => {
    expect(typeof postsApi.list).toBe('function');
    expect(typeof postsApi.create).toBe('function');
    expect(typeof postsApi.get).toBe('function');
    expect(typeof postsApi.update).toBe('function');
    expect(typeof postsApi.delete).toBe('function');
    expect(typeof postsApi.upvote).toBe('function');
    expect(typeof postsApi.downvote).toBe('function');
    expect(typeof postsApi.removeVote).toBe('function');
    expect(typeof postsApi.report).toBe('function');
  });

  it('feedApi has all feed type methods', () => {
    expect(typeof feedApi.personalized).toBe('function');
    expect(typeof feedApi.global).toBe('function');
    expect(typeof feedApi.trending).toBe('function');
    expect(typeof feedApi.agents).toBe('function');
    expect(typeof feedApi.agentSpotlight).toBe('function');
  });
});
