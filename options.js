const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const ZOOM_LEVEL_3_KEY = 'zoom_level_3';
const SITE_BASE_ZOOM_LEVELS_KEY = 'site_base_zoom_levels';

const MIN_BASE_ZOOM_LEVEL = 25;
const MAX_BASE_ZOOM_LEVEL = 500;
const STATUS_DISPLAY_MS = 2000;

let statusTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings and populate the form
  chrome.storage.sync.get(
    [
      ZOOM_LEVEL_1_KEY,
      ZOOM_LEVEL_2_KEY,
      ZOOM_LEVEL_3_KEY,
      SITE_BASE_ZOOM_LEVELS_KEY,
    ],
    (result) => {
      document.getElementById('zoom1').value = result[ZOOM_LEVEL_1_KEY] || '';
      document.getElementById('zoom2').value = result[ZOOM_LEVEL_2_KEY] || '';
      document.getElementById('zoom3').value = result[ZOOM_LEVEL_3_KEY] || '';
      document.getElementById('siteBaseZoomLevels').value =
        formatSiteBaseZoomLevels(result[SITE_BASE_ZOOM_LEVELS_KEY] || {});
    },
  );

  // Save the settings when the form is submitted
  document
    .getElementById('zoomForm')
    .addEventListener('submit', handleFormSubmit);
});

async function handleFormSubmit(event) {
  event.preventDefault();
  const zoom1 = parseInt(document.getElementById('zoom1').value);
  const zoom2 = parseInt(document.getElementById('zoom2').value);
  const zoom3 = parseInt(document.getElementById('zoom3').value);
  const textarea = document.getElementById('siteBaseZoomLevels');

  const { siteBaseZoomLevels, errors } = parseSiteBaseZoomLevels(
    textarea.value,
  );
  if (errors.length > 0) {
    showStatus('Nothing was saved:\n' + errors.join('\n'), true);
    return;
  }

  const domains = Object.keys(siteBaseZoomLevels);
  const origins = domains.map(toOriginPattern);

  try {
    // The browser only allows requesting permissions in direct response to a
    // user action (here, submitting the form), so this must be called before
    // any `await`.
    if (origins.length > 0) {
      await chrome.permissions.request({ origins });
    }

    const previous = await chrome.storage.sync.get(SITE_BASE_ZOOM_LEVELS_KEY);
    const previousDomains = Object.keys(
      previous[SITE_BASE_ZOOM_LEVELS_KEY] || {},
    );

    await chrome.storage.sync.set({
      [ZOOM_LEVEL_1_KEY]: zoom1,
      [ZOOM_LEVEL_2_KEY]: zoom2,
      [ZOOM_LEVEL_3_KEY]: zoom3,
      [SITE_BASE_ZOOM_LEVELS_KEY]: siteBaseZoomLevels,
    });

    await removeUnneededHostPermissions(previousDomains, domains);

    // Show the normalized list (e.g., URLs are turned into domains)
    textarea.value = formatSiteBaseZoomLevels(siteBaseZoomLevels);

    const hasPermissions =
      origins.length === 0 || (await chrome.permissions.contains({ origins }));
    if (hasPermissions) {
      showStatus('Settings saved.');
    } else {
      showStatus(
        'Settings saved. However, the base zoom levels will not take effect ' +
          'without permission to access the listed sites. Click "Save" ' +
          'again to grant it.',
        true,
      );
    }
  } catch (error) {
    showStatus(`Failed to save settings: ${error.message}`, true);
  }
}

// Parse the text in the textarea, which has one "domain base_zoom_level" pair
// per line, into an object mapping domains to base zoom levels
function parseSiteBaseZoomLevels(text) {
  const siteBaseZoomLevels = {};
  const errors = [];

  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') {
      return;
    }

    const lineNumber = index + 1;
    const match = line.match(/^(\S+?)[\s:,=]+(\d+(?:\.\d+)?)\s*%?$/);
    if (!match) {
      errors.push(
        `Line ${lineNumber}: expected "domain base_zoom_level" ` +
          '(e.g., "github.com 90")',
      );
      return;
    }

    const domain = normalizeDomain(match[1]);
    const baseZoomLevel = Number(match[2]);

    if (domain === null) {
      errors.push(`Line ${lineNumber}: "${match[1]}" is not a valid domain`);
    } else if (
      baseZoomLevel < MIN_BASE_ZOOM_LEVEL ||
      baseZoomLevel > MAX_BASE_ZOOM_LEVEL
    ) {
      errors.push(
        `Line ${lineNumber}: the base zoom level must be between ` +
          `${MIN_BASE_ZOOM_LEVEL} and ${MAX_BASE_ZOOM_LEVEL}`,
      );
    } else if (domain in siteBaseZoomLevels) {
      errors.push(`Line ${lineNumber}: "${domain}" is listed more than once`);
    } else {
      siteBaseZoomLevels[domain] = baseZoomLevel;
    }
  });

  return { siteBaseZoomLevels, errors };
}

function formatSiteBaseZoomLevels(siteBaseZoomLevels) {
  return Object.entries(siteBaseZoomLevels)
    .map(([domain, baseZoomLevel]) => `${domain} ${baseZoomLevel}`)
    .join('\n');
}

// Turn user input such as "GitHub.com", "*.github.com", or
// "https://github.com/foo" into a plain domain ("github.com"). Returns null if
// the input is not a valid domain.
function normalizeDomain(input) {
  const withoutScheme = input
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\*\./, '');

  let hostname;
  try {
    hostname = new URL('http://' + withoutScheme).hostname;
  } catch {
    return null;
  }

  const isValidHostname = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(hostname);
  return isValidHostname ? hostname : null;
}

// The host permission pattern that covers a domain and its subdomains
function toOriginPattern(domain) {
  const isIpAddress = /^\d+(\.\d+){3}$/.test(domain);
  return isIpAddress ? `*://${domain}/*` : `*://*.${domain}/*`;
}

// Give up host permissions for domains that were removed from the list.
// Domains that overlap with a listed domain (e.g., a subdomain of it) are kept,
// in case the browser regards their permissions as one and the same.
async function removeUnneededHostPermissions(previousDomains, currentDomains) {
  const areRelated = (a, b) =>
    a === b || a.endsWith('.' + b) || b.endsWith('.' + a);

  const unneededOrigins = previousDomains
    .filter((prev) => !currentDomains.some((curr) => areRelated(prev, curr)))
    .map(toOriginPattern);

  if (unneededOrigins.length > 0) {
    await chrome.permissions.remove({ origins: unneededOrigins });
  }
}

function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'error' : '';

  clearTimeout(statusTimer);
  if (!isError) {
    statusTimer = setTimeout(() => {
      status.textContent = '';
    }, STATUS_DISPLAY_MS);
  }
}
