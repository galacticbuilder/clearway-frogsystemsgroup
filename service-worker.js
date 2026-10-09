'use strict';

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/galacticbuilder/clearway-frogsystemsgroup/main/blocklist.json';
const REFRESH_ALARM = 'clearway-blocklist-refresh';
const RULE_ID_DOMAIN = 1000;
const RULE_ID_URL = 10000;
const RULE_ID_KEYWORD = 16000;
const RULE_ID_YOUTUBE = 18000;
const RULE_ID_ALLOW = 22000;
const MAX_DOMAINS = 3000;
const MAX_URL_FILTERS = 1000;
const MAX_KEYWORDS = 500;
const BLOCKED_PAGE = 'blocked.html';
const GAME_DOMAINS = ['roblox.com', 'poki.com', 'crazygames.com'];
const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

const NON_DOCUMENT_TYPES = [
  'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
];
const ALL_RESOURCE_TYPES = ['main_frame', ...NON_DOCUMENT_TYPES];

function normaliseDomain(value) {
  if (typeof value !== 'string') throw new Error('Every domain must be a string.');
  let domain = value.trim().toLowerCase().replace(/\.$/, '');
  if (domain.startsWith('*.')) domain = domain.slice(2);
  if (!domain || domain.length > 253 || domain.includes('://') ||
      domain.includes('/') || domain.includes('*') || domain.includes(':') ||
      domain.includes(' ') || domain.startsWith('.') || domain.endsWith('.')) {
    throw new Error('Invalid domain entry: ' + value);
  }
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Invalid domain entry: ' + value);
  }
  return domain;
}

function normaliseDomainList(values, limit = MAX_DOMAINS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.slice(0, limit).map(normaliseDomain))];
}

function validateBlocklist(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.domains)) {
    throw new Error('Unsupported or invalid blocklist schema.');
  }
  if (payload.domains.length > MAX_DOMAINS) {
    throw new Error('Blocklist exceeds the current safety limit of ' + MAX_DOMAINS + ' domains.');
  }
  return {
    schemaVersion: 1,
    version: String(payload.version || 'unversioned').slice(0, 80),
    updatedAt: String(payload.updatedAt || ''),
    domains: normaliseDomainList(payload.domains)
  };
}

async function getManagedPolicy() {
  try { return await chrome.storage.managed.get(null); }
  catch (_) { return {}; }
}

async function getStatus() {
  const stored = await chrome.storage.local.get([
    'clearwayEnabled', 'blocklistVersion', 'blocklistUpdatedAt',
    'lastRefreshAttempt', 'lastRefreshError', 'blockedDomainCount', 'blocklistSource'
  ]);
  const policy = await getManagedPolicy();
  const enabled = typeof policy.filteringEnabled === 'boolean'
    ? policy.filteringEnabled
    : stored.clearwayEnabled !== false;
  return {
    enabled,
    managed: typeof policy.filteringEnabled === 'boolean',
    blockYouTube: policy.blockYouTube === true || policy.blockYouTubeEntirely === true,
    blockGames: policy.blockGames === true,
    version: stored.blocklistVersion || 'Not downloaded',
    updatedAt: stored.blocklistUpdatedAt || null,
    lastRefreshAttempt: stored.lastRefreshAttempt || null,
    error: stored.lastRefreshError || null,
    domainCount: stored.blockedDomainCount || 0,
    source: stored.blocklistSource || 'remote'
  };
}

function urlFilterRules(filters, startId) {
  const rules = [];
  filters.slice(0, MAX_URL_FILTERS).forEach((filter, index) => {
    if (typeof filter !== 'string') return;
    const value = filter.trim();
    if (!value || value.length > 256) return;
    const base = startId + index * 2;
    rules.push({
      id: base, priority: 3,
      action: { type: 'redirect', redirect: { extensionPath: '/' + BLOCKED_PAGE } },
      condition: { urlFilter: value, resourceTypes: ['main_frame'] }
    });
    rules.push({
      id: base + 1, priority: 2,
      action: { type: 'block' },
      condition: { urlFilter: value, resourceTypes: NON_DOCUMENT_TYPES }
    });
  });
  return rules;
}

function keywordFilters(keywords) {
  if (!Array.isArray(keywords)) return [];
  return [...new Set(keywords.slice(0, MAX_KEYWORDS)
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9._/-]+/g, '*').replace(/^\*+|\*+$/g, ''))
    .filter((item) => item.length >= 3 && item.length <= 100)
    .map((item) => '*' + item + '*'))];
}

async function getCategoryDomains(policy) {
  const enabled = new Set((Array.isArray(policy.enabledCategories) ? policy.enabledCategories : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
  const feeds = Array.isArray(policy.categoryFeedUrls) ? policy.categoryFeedUrls.slice(0, 10) : [];
  const domains = new Set();
  for (const feedUrl of feeds) {
    if (typeof feedUrl !== 'string') continue;
    let parsed;
    try { parsed = new URL(feedUrl); } catch (_) { continue; }
    if (parsed.protocol !== 'https:') continue;
    try {
      const response = await fetch(parsed.href, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) continue;
      const payload = await response.json();
      if (!payload || payload.schemaVersion !== 1 || !payload.categories || typeof payload.categories !== 'object') continue;
      for (const [categoryName, entries] of Object.entries(payload.categories)) {
        if (!enabled.has(categoryName.toLowerCase()) || !Array.isArray(entries)) continue;
        for (const entry of entries.slice(0, MAX_DOMAINS)) {
          try { domains.add(normaliseDomain(entry)); } catch (_) {}
          if (domains.size >= MAX_DOMAINS) return [...domains];
        }
      }
    } catch (_) {
      // A single unavailable category source must not prevent local and school rules applying.
    }
  }
  return [...domains];
}

function youtubeVideoRules(videoIds) {
  const rules = [];
  const ids = [...new Set((Array.isArray(videoIds) ? videoIds : [])
    .filter((id) => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => /^[A-Za-z0-9_-]{6,20}$/.test(id)))].slice(0, 400);
  ids.forEach((id, index) => {
    const patterns = ['*youtube.com/watch?v=' + id + '*', '*youtube.com/shorts/' + id + '*', '*youtu.be/' + id + '*'];
    patterns.forEach((pattern, patternIndex) => {
      rules.push({
        id: RULE_ID_YOUTUBE + index * 6 + patternIndex * 2,
        priority: 5,
        action: { type: 'redirect', redirect: { extensionPath: '/' + BLOCKED_PAGE } },
        condition: { urlFilter: pattern, resourceTypes: ['main_frame'] }
      });
      rules.push({
        id: RULE_ID_YOUTUBE + index * 6 + patternIndex * 2 + 1,
        priority: 4,
        action: { type: 'block' },
        condition: { urlFilter: pattern, resourceTypes: NON_DOCUMENT_TYPES }
      });
    });
  });
  return rules;
}

async function installRules(blocklist, policy) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const enabled = policy.filteringEnabled !== false && policy.__enabled !== false;
  const rules = [];

  if (enabled) {
    // Each managed organisation can have its own categories and lists. The shared
    // demo list is used only when no organisation-specific policy is configured.
    const organisationPolicyConfigured = Boolean(
      policy.organizationName ||
      policy.blockYouTube === true ||
      policy.blockYouTubeEntirely === true ||
      policy.blockGames === true ||
      (Array.isArray(policy.enabledCategories) && policy.enabledCategories.length) ||
      (Array.isArray(policy.categoryFeedUrls) && policy.categoryFeedUrls.length) ||
      (Array.isArray(policy.blacklistDomains) && policy.blacklistDomains.length) ||
      (Array.isArray(policy.whitelistDomains) && policy.whitelistDomains.length) ||
      (Array.isArray(policy.blockedKeywords) && policy.blockedKeywords.length) ||
      (Array.isArray(policy.blockedUrlKeywords) && policy.blockedUrlKeywords.length) ||
      (Array.isArray(policy.blockedUrlFilters) && policy.blockedUrlFilters.length) ||
      (Array.isArray(policy.blockedYouTubeVideoIds) && policy.blockedYouTubeVideoIds.length)
    );
    const blockedDomains = new Set([
      ...normaliseDomainList(policy.blockDomains || []),
      ...normaliseDomainList(policy.blacklistDomains || [])
    ]);
    const categoryDomains = await getCategoryDomains(policy);
    categoryDomains.forEach((domain) => blockedDomains.add(domain));
    if (policy.blockYouTube === true || policy.blockYouTubeEntirely === true) YOUTUBE_DOMAINS.forEach((domain) => blockedDomains.add(domain));
    if (policy.blockGames === true) GAME_DOMAINS.forEach((domain) => blockedDomains.add(domain));
    if (!organisationPolicyConfigured) blocklist.domains.forEach((domain) => blockedDomains.add(domain));

    [...blockedDomains].slice(0, MAX_DOMAINS).forEach((domain, index) => {
      const base = RULE_ID_DOMAIN + index * 2;
      const filter = '||' + domain + '^';
      rules.push({
        id: base, priority: 2,
        action: { type: 'redirect', redirect: { extensionPath: '/' + BLOCKED_PAGE } },
        condition: { urlFilter: filter, resourceTypes: ['main_frame'] }
      });
      rules.push({
        id: base + 1, priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: filter, resourceTypes: NON_DOCUMENT_TYPES }
      });
    });

    rules.push(...urlFilterRules(Array.isArray(policy.blockedUrlFilters) ? policy.blockedUrlFilters : [], RULE_ID_URL));
    const keywords = [
      ...(Array.isArray(policy.blockedUrlKeywords) ? policy.blockedUrlKeywords : []),
      ...(Array.isArray(policy.blockedKeywords) ? policy.blockedKeywords : [])
    ];
    rules.push(...urlFilterRules(keywordFilters(keywords), RULE_ID_KEYWORD));
    if (policy.blockYouTubeEntirely !== true && policy.blockYouTube !== true) {
      rules.push(...youtubeVideoRules(policy.blockedYouTubeVideoIds));
    }

    const allowDomains = normaliseDomainList([
      ...(Array.isArray(policy.allowDomains) ? policy.allowDomains : []),
      ...(Array.isArray(policy.whitelistDomains) ? policy.whitelistDomains : [])
    ], 1000);
    allowDomains.forEach((domain, index) => {
      rules.push({
        id: RULE_ID_ALLOW + index, priority: 100,
        action: { type: 'allow' },
        condition: { urlFilter: '||' + domain + '^', resourceTypes: ALL_RESOURCE_TYPES }
      });
    });
  }

  if (rules.length > 25000) throw new Error('Policy creates too many browser rules. Reduce the number of domains or URL filters.');
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules
  });
}

async function applyCachedBlocklist() {
  const stored = await chrome.storage.local.get(['blocklist', 'clearwayEnabled']);
  const policy = await getManagedPolicy();
  const list = stored.blocklist ? validateBlocklist(stored.blocklist) : { domains: [] };
  if (typeof policy.filteringEnabled !== 'boolean') policy.filteringEnabled = stored.clearwayEnabled !== false;
  await installRules(list, policy);
}

async function refreshBlocklist() {
  await chrome.storage.local.set({ lastRefreshAttempt: new Date().toISOString(), lastRefreshError: null });
  try {
    const response = await fetch(BLOCKLIST_URL, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Blocklist server returned HTTP ' + response.status + '.');
    const payload = validateBlocklist(await response.json());
    const policy = await getManagedPolicy();
    const settings = await chrome.storage.local.get(['clearwayEnabled']);
    if (typeof policy.filteringEnabled !== 'boolean') policy.filteringEnabled = settings.clearwayEnabled !== false;
    await installRules(payload, policy);
    await chrome.storage.local.set({
      blocklist: payload,
      blocklistVersion: payload.version,
      blocklistUpdatedAt: payload.updatedAt || new Date().toISOString(),
      blockedDomainCount: payload.domains.length,
      lastRefreshError: null,
      blocklistSource: 'remote'
    });
    return { success: true, version: payload.version, domainCount: payload.domains.length };
  } catch (error) {
    const remoteError = String(error && error.message || error);
    // The repository may be private or the remote endpoint may be unavailable.
    // Fall back to the blocklist packaged with the extension so first-run installs
    // can still apply the included demo list without GitHub authentication.
    try {
      const bundledResponse = await fetch(chrome.runtime.getURL('blocklist.json'), { cache: 'no-store' });
      if (!bundledResponse.ok) throw new Error('Bundled blocklist returned HTTP ' + bundledResponse.status + '.');
      const payload = validateBlocklist(await bundledResponse.json());
      const policy = await getManagedPolicy();
      const settings = await chrome.storage.local.get(['clearwayEnabled']);
      if (typeof policy.filteringEnabled !== 'boolean') policy.filteringEnabled = settings.clearwayEnabled !== false;
      await installRules(payload, policy);
      await chrome.storage.local.set({
        blocklist: payload,
        blocklistVersion: payload.version,
        blocklistUpdatedAt: payload.updatedAt || new Date().toISOString(),
        blockedDomainCount: payload.domains.length,
        lastRefreshError: null,
        blocklistSource: 'bundled'
      });
      return { success: true, version: payload.version, domainCount: payload.domains.length, source: 'bundled', warning: 'Using the blocklist included with Clearway. Remote refresh failed: ' + remoteError };
    } catch (fallbackError) {
      await chrome.storage.local.set({ lastRefreshError: remoteError + ' Bundled fallback failed: ' + String(fallbackError && fallbackError.message || fallbackError) });
      try { await applyCachedBlocklist(); } catch (_) {}
      return { success: false, error: remoteError };
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(['clearwayEnabled']);
  if (typeof settings.clearwayEnabled !== 'boolean') await chrome.storage.local.set({ clearwayEnabled: true });
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 60 });
  await refreshBlocklist();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 60 });
  await applyCachedBlocklist();
  await refreshBlocklist();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshBlocklist();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'managed' || (areaName === 'local' && changes.clearwayEnabled)) {
    applyCachedBlocklist().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_STATUS') return getStatus();
    if (message?.type === 'REFRESH_BLOCKLIST') return refreshBlocklist();
    if (message?.type === 'CATEGORY_LOOKUP' && typeof message.domain === 'string') {
      const domain = normaliseDomain(message.domain);
      const policy = await getManagedPolicy();
      if (typeof policy.categoryLookupApiUrl !== 'string' || !policy.categoryLookupApiUrl.trim()) return { blocked: false };
      const endpoint = new URL(policy.categoryLookupApiUrl.trim());
      if (endpoint.protocol !== 'https:') return { blocked: false };
      endpoint.searchParams.set('domain', domain);
      const response = await fetch(endpoint.href, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) return { blocked: false };
      const result = await response.json();
      return {
        blocked: result?.blocked === true,
        category: typeof result?.category === 'string' ? result.category.slice(0, 80) : '',
        reason: typeof result?.reason === 'string' ? result.reason.slice(0, 240) : ''
      };
    }
    if (message?.type === 'SET_ENABLED' && typeof message.enabled === 'boolean') {
      const policy = await getManagedPolicy();
      if (typeof policy.filteringEnabled === 'boolean') {
        throw new Error('Filtering is controlled by your school administrator.');
      }
      await chrome.storage.local.set({ clearwayEnabled: message.enabled });
      await applyCachedBlocklist();
      return getStatus();
    }
    throw new Error('Unsupported Clearway message.');
  })().then(sendResponse).catch((error) => sendResponse({ error: String(error.message || error) }));
  return true;
});

applyCachedBlocklist().catch(() => {});
