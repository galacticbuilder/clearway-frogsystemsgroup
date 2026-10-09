'use strict';

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/galacticbuilder/clearway-frogsystemsgroup/main/blocklist.json';
const REFRESH_ALARM = 'clearway-blocklist-refresh';
const RULE_ID_DOMAIN = 1000;
const RULE_ID_URL = 10000;
const RULE_ID_KEYWORD = 16000;
const RULE_ID_ALLOW = 22000;
const MAX_DOMAINS = 3000;
const MAX_URL_FILTERS = 1000;
const MAX_KEYWORDS = 500;
const BLOCKED_PAGE = 'blocked.html';
const GAME_DOMAINS = ['roblox.com', 'poki.com', 'crazygames.com'];
const YOUTUBE_DOMAINS = ['youtube.com'];

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
    'lastRefreshAttempt', 'lastRefreshError', 'blockedDomainCount'
  ]);
  const policy = await getManagedPolicy();
  const enabled = typeof policy.filteringEnabled === 'boolean'
    ? policy.filteringEnabled
    : stored.clearwayEnabled !== false;
  return {
    enabled,
    managed: typeof policy.filteringEnabled === 'boolean',
    blockYouTube: policy.blockYouTube === true,
    blockGames: policy.blockGames === true,
    version: stored.blocklistVersion || 'Not downloaded',
    updatedAt: stored.blocklistUpdatedAt || null,
    lastRefreshAttempt: stored.lastRefreshAttempt || null,
    error: stored.lastRefreshError || null,
    domainCount: stored.blockedDomainCount || 0
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

async function installRules(blocklist, policy) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const enabled = policy.filteringEnabled !== false && policy.__enabled !== false;
  const rules = [];

  if (enabled) {
    // Administrator-defined rules take precedence if the central list is at its size limit.
    const blockedDomains = new Set(normaliseDomainList(policy.blockDomains || []));
    if (policy.blockYouTube === true) YOUTUBE_DOMAINS.forEach((domain) => blockedDomains.add(domain));
    if (policy.blockGames === true) GAME_DOMAINS.forEach((domain) => blockedDomains.add(domain));
    blocklist.domains.forEach((domain) => blockedDomains.add(domain));

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
    rules.push(...urlFilterRules(keywordFilters(policy.blockedUrlKeywords), RULE_ID_KEYWORD));

    const allowDomains = normaliseDomainList(policy.allowDomains || [], 1000);
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
      lastRefreshError: null
    });
    return { success: true, version: payload.version, domainCount: payload.domains.length };
  } catch (error) {
    await chrome.storage.local.set({ lastRefreshError: String(error && error.message || error) });
    try { await applyCachedBlocklist(); } catch (_) {}
    return { success: false, error: String(error && error.message || error) };
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
