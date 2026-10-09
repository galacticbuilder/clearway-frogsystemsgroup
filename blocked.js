'use strict';

const destination = document.getElementById('destination');
try {
  const current = new URL(window.location.href);
  const candidate = current.searchParams.get('url');
  if (candidate) {
    const parsed = new URL(candidate);
    destination.textContent = parsed.hostname;
  } else {
    destination.textContent = 'Restricted by your organisation’s policy';
  }
} catch (_) {
  destination.textContent = 'Restricted by your organisation’s policy';
}

document.getElementById('back-button').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.location.assign('https://www.google.com/');
});
