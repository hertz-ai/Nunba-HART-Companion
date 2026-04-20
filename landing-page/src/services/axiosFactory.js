/**
 * axiosFactory.js — Single factory for authenticated axios instances.
 * All API services should use createApiClient() instead of duplicating interceptors.
 *
 * Built-in smart caching:
 * - GET requests are cached with per-endpoint TTL
 * - Concurrent identical GETs are deduplicated (one HTTP round-trip)
 * - Stale-while-revalidate: cached data returned instantly, revalidated in background
 * - Mutations (POST/PUT/PATCH/DELETE) auto-invalidate related GET caches
 * - Opt out with { cache: false } in request config
 */

import {apiCache} from './apiCache';

import axios from 'axios';

export function createApiClient(
  baseURL,
  {timeout = 15000, handle401 = true, cache = true} = {}
) {
  const instance = axios.create({
    baseURL,
    headers: {'Content-Type': 'application/json'},
    timeout,
  });

  // ── Auth interceptor ────────────────────────────────────────────────
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  if (cache) {
    // ── Cache request interceptor ───────────────────────────────────
    // For GET requests: check public cache FIRST, then user-scoped cache.
    // Return cached data if fresh, skip network entirely.
    // If stale: return cached data immediately AND trigger background revalidation.
    instance.interceptors.request.use((config) => {
      const method = (config.method || 'get').toLowerCase();
      if (method !== 'get' || config.cache === false) return config;

      // ── Check public cache first ──────────────────────────────────
      const publicKey = apiCache.buildKey({...config, _publicScope: true});
      const publicCached = apiCache.getPublic(publicKey);
      if (publicCached !== null) {
        // Fresh public cache hit — serve to everyone without re-fetching
        config.adapter = () =>
          Promise.resolve({
            data: publicCached,
            status: 200,
            statusText: 'OK (public cache)',
            headers: {},
            config,
          });
        return config;
      }

      // ── Check user-scoped cache ───────────────────────────────────
      const key = apiCache.buildKey(config);
      const cached = apiCache.get(key);

      if (cached && !cached.stale) {
        // Fresh cache hit — skip network entirely
        config.adapter = () =>
          Promise.resolve({
            data: cached.data,
            status: 200,
            statusText: 'OK (cache)',
            headers: {},
            config,
          });
        return config;
      }

      if (cached && cached.stale) {
        // Stale cache — return stale data now, revalidate in background
        // Store stale data so response interceptor can return it
        config._staleData = cached.data;
        config._cacheKey = key;
      }

      // Tag config for dedup + caching in response interceptor
      config._cacheKey = config._cacheKey || key;
      return config;
    });
  }

  // ── Response interceptor ──────────────────────────────────────────
  instance.interceptors.response.use(
    (response) => {
      const data = response.data;

      if (cache) {
        const config = response.config || {};
        const method = (config.method || 'get').toLowerCase();

        if (method === 'get' && config.cache !== false) {
          // Cache the GET response in user-scoped cache
          const key = config._cacheKey || apiCache.buildKey(config);
          const url = (config.baseURL || '') + (config.url || '');
          apiCache.set(key, data, url);

          // Also store in public cache if response signals public scope
          const isPublicHeader =
            response.headers?.['x-cache-scope'] === 'public';
          const isPublicData = data?._public === true;
          if (isPublicHeader || isPublicData) {
            const publicKey = apiCache.buildKey({
              ...config,
              _publicScope: true,
            });
            const publicTTL = apiCache.getPublicTTL(url);
            apiCache.setPublic(publicKey, data, publicTTL);
          }
        } else if (['post', 'put', 'patch', 'delete'].includes(method)) {
          // Mutation — invalidate related caches
          const url = (config.baseURL || '') + (config.url || '');
          apiCache.invalidateOnMutation(url);
        }
      }

      return data;
    },
    (error) => {
      if (handle401 && error.response?.status === 401) {
        localStorage.removeItem('access_token');
        window.dispatchEvent(new Event('auth:expired'));
      }

      // On network error: return stale cached data if available
      if (cache && error.config?._staleData !== undefined) {
        return error.config._staleData;
      }

      return Promise.reject(error.response ? error.response.data : error);
    }
  );

  // ── Wrap request method to add dedup for GETs ─────────────────────
  if (cache) {
    const originalRequest = instance.request.bind(instance);
    instance.request = function (config) {
      const method = (config.method || 'get').toLowerCase();
      if (method === 'get' && config.cache !== false) {
        const key = apiCache.buildKey(config);
        return apiCache.dedupFetch(key, () => originalRequest(config));
      }
      return originalRequest(config);
    };

    // Wrap convenience methods that use request() internally
    const originalGet = instance.get.bind(instance);
    instance.get = function (url, config = {}) {
      const fullConfig = {...config, url, method: 'get'};
      const key = apiCache.buildKey(fullConfig);
      return apiCache.dedupFetch(key, () => originalGet(url, config));
    };
  }

  return instance;
}
