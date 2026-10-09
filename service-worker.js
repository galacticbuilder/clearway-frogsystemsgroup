'use strict';

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/galacticbuilder/clearway-frogsystemsgroup/main/blocklist.json';
const REFRESH_ALARM = 'clearway-blocklist-refresh';
const RULE_ID_BASE = 1000;
const MAX_DOMAINS = 5000;
const BLOCKED_PAGE = 'blocked.html';

const NON_DOCUMENT_TYPES = [
  'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
];

function validateBlocklist(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.domains)) {
    throw new Error('Unsupported or invalid blocklist schema.');
  }
  if (payload.domains.length > MAX_DOMAINS) {
    throw new Error('Blocklist exceeds the current safety limit of ' + MAX_DOMAINS + ' domains.');
  }

  const domains = [...new Set(payload.domains.map((entry) => {
    if (typeof entry !== 'string') throw new Error('Every domain must be a string.');
    const domain = entry.trim().toLowerCase().replace(/\.$/, '');
    if (!domain || domain.length > 253 || domain.includes('://') ||
        domain.includes('/') || domain.includes('*') || domain.includes(':') ||
        domain.includes(' ') || domain.startsWith('.') || domain.endsWith('.')) {
      throw new Error('Invalid domain entry: ' + entry);
    }
    const labels = domain.split('.');
    if (labels.length < 2 || labels.some((label) =>
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error('Invalid domain entry: ' + entry);
    }
    return domain;
  }))];

  return {
    schemaVersion: 1,
    version: String(payload.version || 'unversioned').slice(0, 80),
    updatedAt: String(payload.updatedAt || ''),
    domains
  };
}

async function getStatus() {
  const stored = await chrome.storage.local.get([
    'clearwayEnabled', 'blocklistVersion', 'blocklistUpdatedAt',
    'lastRefreshAttempt', 'lastRefreshError', 'blockedDomainCount'
  ]);
  return {
    enabled: stored.clearwayEnabled !== false,
    version: stored.blocklistVersion || 'Not downloaded',
    updatedAt: stored.blocklistUpdatedAt || null,
    lastRefreshAttempt: stored.lastRefreshAttempt || null,
    error: stored.lastRefreshError || null,
    domainCount: stored.blockedDomainCount || 0
  };
}

async function installRules(domains, enabled) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id);
  const addRules = [];

  if (enabled) {
    domains.forEach((domain, index) => {
      const filter = '||' + domain + '^';
      const base = RULE_ID_BASE + (index * 2);
      addRules.push({
        id: base,
        priority: 2,
        action: { type: 'redirect', redirect: { extensionPath: '/' + BLOCKED_PAGE } },
        condition: { urlFilter: filter, resourceTypes: ['main_frame'] }
      });
      addRules.push({
        id: base + 1,
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: filter, resourceTypes: NON_DOCUMENT_TYPES }
      });
    });
  }

  // Replace rules as one operation so the browser never sees a partially
  // applied new list. Leave the old rules untouched if validation fails.
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function applyCachedBlocklist() {
  const stored = await chrome.storage.local.get(['blocklist', 'clearwayEnabled']);
  const list = stored.blocklist ? validateBlocklist(stored.blocklist) : { domains: [] };
  await installRules(list.domains, stored.clearwayEnabled !== false);
}

async function refreshBlocklist() {
  await chrome.storage.local.set({ lastRefreshAttempt: new Date().toISOString(), lastRefreshError: null });
  try {
    const response = await fetch(BLOCKLIST_URL, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Blocklist server returned HTTP ' + response.status + '.');
    const payload = validateBlocklist(await response.json());

    // Apply rules before replacing the last-known-good cached list.
    const settings = await chrome.storage.local.get(['clearwayEnabled']);
    await installRules(payload.domains, settings.clearwayEnabled !== false);
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
    // Preserve and continue enforcing the last known good list.
    try { await applyCachedBlocklist(); } catch (_) { /* No valid cached list yet. */ }
    return { success: false, error: String(error && error.message || error) };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ clearwayEnabled: true });
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_STATUS') return getStatus();
    if (message?.type === 'REFRESH_BLOCKLIST') return refreshBlocklist();
    if (message?.type === 'SET_ENABLED' && typeof message.enabled === 'boolean') {
      const current = await chrome.storage.local.get(['blocklist']);
      const list = current.blocklist ? validateBlocklist(current.blocklist) : { domains: [] };
      await chrome.storage.local.set({ clearwayEnabled: message.enabled });
      await installRules(list.domains, message.enabled);
      return getStatus();
    }
    throw new Error('Unsupported Clearway message.');
  })().then(sendResponse).catch((error) => sendResponse({ error: String(error.message || error) }));
  return true;
});

// Restore cached enforcement whenever the service worker wakes.
applyCachedBlocklist().catch(() => {});
