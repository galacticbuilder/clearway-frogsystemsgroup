'use strict';

// Best-effort content classification. This is not a security boundary: pages
// can change after inspection, and DOM text checks can produce false positives.
(async function clearwayPageFilter() {
  if (window.top !== window) return;

  let managed = {};
  try { managed = await chrome.storage.managed.get(null); } catch (_) {}

  if (managed.filteringEnabled === false || managed.enablePageKeywordBlocking !== true) return;
  const terms = Array.isArray(managed.pageKeywords)
    ? managed.pageKeywords.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().toLocaleLowerCase()).slice(0, 100)
    : [];
  if (!terms.length) return;

  const pageText = [
    document.title || '',
    location.href || '',
    ...Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).slice(0, 40).map((node) => node.innerText || ''),
    (document.body?.innerText || '').slice(0, 5000)
  ].join('\n').toLocaleLowerCase();

  const matched = terms.find((term) => pageText.includes(term));
  if (!matched || document.getElementById('clearway-page-restriction')) return;

  const overlay = document.createElement('div');
  overlay.id = 'clearway-page-restriction';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'clearway-title');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', background: '#f3f6f4',
    color: '#20352b', display: 'grid', placeItems: 'center', padding: '24px',
    fontFamily: 'Arial, Helvetica, sans-serif'
  });

  const card = document.createElement('section');
  Object.assign(card.style, {
    width: 'min(100%, 560px)', boxSizing: 'border-box', background: '#fff',
    border: '1px solid #dce5df', borderRadius: '14px', padding: '36px',
    boxShadow: '0 12px 36px rgba(23,53,39,.07)'
  });

  const brand = document.createElement('div');
  brand.textContent = 'Clearway  |  FrogSystems Group';
  Object.assign(brand.style, { fontSize: '16px', fontWeight: '700', marginBottom: '28px', color: '#176b4b' });

  const heading = document.createElement('h1');
  heading.id = 'clearway-title';
  heading.textContent = 'This page may be restricted';
  Object.assign(heading.style, { fontSize: '28px', lineHeight: '1.2', margin: '0 0 12px' });

  const description = document.createElement('p');
  description.textContent = 'Clearway matched this page against a keyword configured by your organisation.';
  Object.assign(description.style, { fontSize: '15px', lineHeight: '1.6', color: '#52645a' });

  const note = document.createElement('p');
  note.textContent = 'If this page is needed for learning, ask your teacher or school IT team to review the filtering policy.';
  Object.assign(note.style, { fontSize: '13px', lineHeight: '1.6', color: '#52645a' });

  card.append(brand, heading, description, note);
  overlay.append(card);
  document.documentElement.append(overlay);
})();
