'use strict';

const params = new URLSearchParams(window.location.search);
const destination = document.getElementById('destination');
const category = document.getElementById('category');
const reason = document.getElementById('reason');
const supportLink = document.getElementById('support-link');
const organisation = document.getElementById('organisation');
const backHint = document.getElementById('back-hint');

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch (_) {
    return null;
  }
}

const requestedUrl = params.get('url');
const parsedUrl = requestedUrl ? safeHttpUrl(requestedUrl) : null;
destination.textContent = parsedUrl ? parsedUrl.hostname : 'Restricted by your organisation’s policy';

const categoryName = (params.get('category') || '').trim().slice(0, 80);
if (categoryName) {
  category.replaceChildren();
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = categoryName;
  category.appendChild(pill);
}

const reasonText = (params.get('reason') || '').trim().slice(0, 240);
if (reasonText) reason.textContent = reasonText;

const orgName = (params.get('org') || '').trim().slice(0, 120);
if (orgName) organisation.textContent = orgName + ' · ClearWay by FrogSystems Group';

const supportUrl = safeHttpUrl(params.get('support') || '');
if (supportUrl) {
  supportLink.href = supportUrl.href;
  supportLink.hidden = false;
}

document.getElementById('back-button').addEventListener('click', () => {
  if (history.length > 1) {
    history.back();
  } else {
    backHint.textContent = 'Use your browser’s Back button, or close this tab to return to your previous work.';
  }
});
