'use strict';

// Page-level category/API checks are best-effort after navigation. They are not
// a substitute for DNS/gateway enforcement, because the page can begin loading first.
(async function clearwayPageFilter() {
  if (window.top !== window) return;

  let managed = {};
  let local = {};
  try { managed = await chrome.storage.managed.get(null); } catch (_) {}
  try { local = await chrome.storage.local.get(['clearwayEnabled']); } catch (_) {}

  if (managed.filteringEnabled === false ||
      (typeof managed.filteringEnabled !== 'boolean' && local.clearwayEnabled === false)) return;

  const enabledCategories = new Set((Array.isArray(managed.enabledCategories) ? managed.enabledCategories : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase()));

  let restriction = null;
  const apiEndpoint = typeof managed.categoryLookupApiUrl === 'string' ? managed.categoryLookupApiUrl.trim() : '';
  if (apiEndpoint && enabledCategories.size) {
    try {
      const endpoint = new URL(apiEndpoint);
      if (endpoint.protocol === 'https:') {
        const result = await chrome.runtime.sendMessage({ type: 'CATEGORY_LOOKUP', domain: location.hostname });
        const category = typeof result?.category === 'string' ? result.category.trim() : '';
        if (result?.blocked === true && category && enabledCategories.has(category.toLowerCase())) {
          restriction = {
            category,
            reason: typeof result.reason === 'string' && result.reason.trim()
              ? result.reason.slice(0, 240)
              : 'The organisation’s category lookup service restricted this domain.'
          };
        }
      }
    } catch (_) {
      // Fail open if the configured lookup service is unavailable.
    }
  }

  if (!restriction && managed.enablePageKeywordBlocking === true) {
    const terms = Array.isArray(managed.pageKeywords)
      ? managed.pageKeywords.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().toLocaleLowerCase())
      : [];
    const categoryEntries = Array.isArray(managed.categoryKeywords) ? managed.categoryKeywords : [];
    for (const entry of categoryEntries) {
      if (typeof entry !== 'string') continue;
      const separator = entry.indexOf('|');
      if (separator < 1) continue;
      const category = entry.slice(0, separator).trim().toLowerCase();
      const term = entry.slice(separator + 1).trim().toLocaleLowerCase();
      if (enabledCategories.has(category) && term.length >= 3) terms.push(term);
    }
    const uniqueTerms = [...new Set(terms)].slice(0, 200);
    if (uniqueTerms.length) {
      const pageText = [
        document.title || '',
        location.href || '',
        ...Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).slice(0, 40).map((node) => node.innerText || ''),
        (document.body?.innerText || '').slice(0, 5000)
      ].join('\n').toLocaleLowerCase();
      const matched = uniqueTerms.find((term) => pageText.includes(term));
      if (matched) restriction = { category: 'Keyword rule', reason: 'This page matched a keyword configured by your organisation.' };
    }
  }

  if (!restriction || document.getElementById('clearway-page-restriction')) return;

  const overlay = document.createElement('div');
  overlay.id = 'clearway-page-restriction';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'clearway-title');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', background: '#f3f6f5',
    color: '#20352b', display: 'grid', placeItems: 'center', padding: '24px',
    fontFamily: '"Segoe UI", Arial, sans-serif'
  });

  const card = document.createElement('section');
  Object.assign(card.style, {
    width: 'min(100%, 620px)', boxSizing: 'border-box', background: '#fff',
    border: '1px solid #dce5e1', borderRadius: '10px', padding: 'clamp(24px, 5vw, 42px)',
    boxShadow: '0 8px 30px rgba(22,54,40,.045)'
  });

  const brand = document.createElement('div');
  brand.textContent = 'ClearWay  |  ' + (managed.organizationName || 'FrogSystems Group');
  Object.assign(brand.style, { fontSize: '16px', fontWeight: '700', marginBottom: '28px', color: '#155d48' });

  const heading = document.createElement('h1');
  heading.id = 'clearway-title';
  heading.textContent = 'This page has been restricted';
  Object.assign(heading.style, { fontSize: '28px', lineHeight: '1.2', margin: '0 0 12px', color: '#18352a' });

  const detail = document.createElement('p');
  detail.textContent = 'Category: ' + restriction.category;
  Object.assign(detail.style, { fontSize: '13px', fontWeight: '700', color: '#315e4b' });

  const description = document.createElement('p');
  description.textContent = restriction.reason;
  Object.assign(description.style, { fontSize: '15px', lineHeight: '1.6', color: '#52645a' });

  const note = document.createElement('p');
  note.textContent = 'If this page is needed for learning, ask your teacher or IT support team to review the restriction.';
  Object.assign(note.style, { fontSize: '13px', lineHeight: '1.6', color: '#52645a' });

  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Go back';
  Object.assign(back.style, { border: '0', borderRadius: '5px', background: '#155d48', color: '#fff', padding: '12px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' });
  back.addEventListener('click', () => history.length > 1 ? history.back() : overlay.remove());

  card.append(brand, heading, detail, description, note, back);
  overlay.append(card);
  document.documentElement.append(overlay);
})();
