'use strict';

const $ = (id) => document.getElementById(id);
const refreshButton = $('refresh');
const enabledToggle = $('enabled');

function formatDate(value) {
  if (!value) return 'Not yet downloaded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function showError(message) {
  $('message').textContent = message || '';
}

function render(status) {
  if (!status || status.error && !('enabled' in status)) {
    showError(status?.error || 'Could not read Clearway status.');
    return;
  }
  enabledToggle.checked = status.enabled !== false;
  enabledToggle.disabled = status.managed === true;
  enabledToggle.title = status.managed ? 'Managed by your school administrator' : 'Enable or pause filtering';
  $('filter-state').textContent = status.managed ? (status.enabled === false ? 'Disabled by administrator' : 'Managed by administrator') : (status.enabled === false ? 'Paused' : 'Active');
  $('status-dot').className = 'status-dot ' + (status.enabled === false ? 'off' : 'on');
  $('domain-count').textContent = Number(status.domainCount || 0).toLocaleString();
  $('version').textContent = status.version || 'Not downloaded';
  if (status.managed && (status.blockYouTube || status.blockGames)) {
    $('message').textContent = 'School policy: ' + [status.blockYouTube ? 'YouTube' : '', status.blockGames ? 'game sites' : ''].filter(Boolean).join(' and ') + ' restrictions enabled.';
  }
  $('updated').textContent = formatDate(status.updatedAt);
  if (status.error) showError('Update failed: ' + status.error + '. The last saved list remains in use.');
  else showError('');
}

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function loadStatus() {
  try { render(await send({ type: 'GET_STATUS' })); }
  catch (_) { showError('Could not connect to the Clearway service worker. Try reloading the extension.'); }
}

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Updating…';
  showError('');
  try {
    const result = await send({ type: 'REFRESH_BLOCKLIST' });
    if (result?.success === false) showError('Update failed: ' + result.error + '. The last saved list remains in use.');
    else if (result?.error) showError(result.error);
    await loadStatus();
  } catch (error) {
    showError(String(error.message || error));
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Update blocklist';
  }
});

enabledToggle.addEventListener('change', async () => {
  enabledToggle.disabled = true;
  try {
    const result = await send({ type: 'SET_ENABLED', enabled: enabledToggle.checked });
    if (result?.error) showError(result.error);
    else render(result);
  } catch (error) {
    showError(String(error.message || error));
    enabledToggle.checked = !enabledToggle.checked;
  } finally {
    enabledToggle.disabled = false;
  }
});

loadStatus();
