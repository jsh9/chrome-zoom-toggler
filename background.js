// The version of this script, which must be the same as in manifest.json (a
// test checks this). After an update, Chrome can keep running the previous
// version of this script with the new manifest.json (it happened when
// updating from 0.0.8 to 0.0.9), and then new features do not work. Comparing
// the two versions tells whether this script is out of date.
const BACKGROUND_VERSION = '0.0.10';
const GET_BACKGROUND_VERSION_MESSAGE = 'get_background_version';
// The version of manifest.json for which the extension was last reloaded
// because this script was out of date, so that it is reloaded only once
const RELOADED_FOR_VERSION_KEY = 'reloaded_for_version';

const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const ZOOM_LEVEL_3_KEY = 'zoom_level_3';
// The zoom level (i.e., the multiplier) the user last toggled to. The page zoom
// is this times the base zoom levels of this computer and the site.
const TARGET_ZOOM_LEVEL_KEY = 'target_zoom_level';
// An object mapping domains (e.g., 'github.com') to their base zoom levels
const SITE_BASE_ZOOM_LEVELS_KEY = 'site_base_zoom_levels';
// The base zoom level of this computer. Unlike the other settings, it is kept
// in `chrome.storage.local`, which is not synced across computers, so that
// each computer (e.g., one with a large high-resolution monitor and one with a
// small laptop screen) can have its own value.
const COMPUTER_BASE_ZOOM_LEVEL_KEY = 'computer_base_zoom_level';

const DEFAULT_ZOOM_LEVEL_1 = 110;
const DEFAULT_ZOOM_LEVEL_2 = 125;
const DEFAULT_ZOOM_LEVEL_3 = 150;
const DEFAULT_BASE_ZOOM_LEVEL = 100;

// The range of page zoom that Chrome supports
const MIN_PAGE_ZOOM = 25;
const MAX_PAGE_ZOOM = 500;

const EPSILON = 0.001;

// Settings are read from storage on every event (rather than cached in
// variables) because the service worker can be restarted at any time, and an
// event can arrive before a cache would have been populated.
async function loadSettings() {
  const [result, localResult] = await Promise.all([
    chrome.storage.sync.get([
      ZOOM_LEVEL_1_KEY,
      ZOOM_LEVEL_2_KEY,
      ZOOM_LEVEL_3_KEY,
      TARGET_ZOOM_LEVEL_KEY,
      SITE_BASE_ZOOM_LEVELS_KEY,
    ]),
    chrome.storage.local.get(COMPUTER_BASE_ZOOM_LEVEL_KEY),
  ]);

  return {
    zoomLevels: [
      result[ZOOM_LEVEL_1_KEY] || DEFAULT_ZOOM_LEVEL_1,
      result[ZOOM_LEVEL_2_KEY] || DEFAULT_ZOOM_LEVEL_2,
      result[ZOOM_LEVEL_3_KEY] || DEFAULT_ZOOM_LEVEL_3,
    ],
    targetZoomLevel: toPositiveNumber(result[TARGET_ZOOM_LEVEL_KEY]),
    siteBaseZoomLevels: result[SITE_BASE_ZOOM_LEVELS_KEY] || {},
    computerBaseZoomLevel:
      toPositiveNumber(localResult[COMPUTER_BASE_ZOOM_LEVEL_KEY]) ??
      DEFAULT_BASE_ZOOM_LEVEL,
  };
}

// `value` if it is a positive number, or undefined (e.g., if it is not set)
function toPositiveNumber(value) {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

// Tell the options page which version of this script is running, so that it
// can warn when this script is out of date
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === GET_BACKGROUND_VERSION_MESSAGE) {
    sendResponse({ version: BACKGROUND_VERSION });
  }
});

reloadIfOutdated().catch((error) => {
  console.log('Cannot check the version of this script:', error.message);
});

// If Chrome runs this script with a newer manifest.json, reload the extension.
// That makes Chrome use the new script, at the latest after the browser
// restarts. This happens only once per version, so it cannot loop.
async function reloadIfOutdated() {
  const manifestVersion = chrome.runtime.getManifest().version;
  if (manifestVersion === BACKGROUND_VERSION) {
    return;
  }

  const result = await chrome.storage.local.get(RELOADED_FOR_VERSION_KEY);
  if (result[RELOADED_FOR_VERSION_KEY] === manifestVersion) {
    console.log(
      `This script (${BACKGROUND_VERSION}) is still older than the ` +
        `extension (${manifestVersion}), even after reloading`,
    );
    return;
  }

  console.log(
    `This script (${BACKGROUND_VERSION}) is older than the extension ` +
      `(${manifestVersion}); reloading the extension`,
  );
  await chrome.storage.local.set({
    [RELOADED_FOR_VERSION_KEY]: manifestVersion,
  });
  chrome.runtime.reload();
}

// Listen for extension icon clicks
chrome.action.onClicked.addListener(handleActionClick);

async function handleActionClick(tab) {
  console.log('--------- Clicked -----------');

  const settings = await loadSettings();
  const currentZoom = (await chrome.tabs.getZoom(tab.id)) * 100;
  const baseZoomLevel = getBaseZoomLevel(tab.url, settings);
  const currentZoomLevel = getCurrentZoomLevel(
    currentZoom,
    baseZoomLevel,
    settings.targetZoomLevel,
  );

  console.log(
    `Current zoom: ${currentZoom}; base zoom level: ${baseZoomLevel}; ` +
      `current zoom level: ${currentZoomLevel}`,
  );
  console.log('User-specified zoom levels:', settings.zoomLevels);

  // Toggle between the user-defined zoom levels
  const newZoomLevel = determineNewZoomLevel(
    currentZoomLevel,
    ...settings.zoomLevels,
  );

  if (newZoomLevel === null) {
    console.log('Fewer than 2 zoom levels to toggle between; no actions');
    return;
  }

  await chrome.storage.sync.set({ [TARGET_ZOOM_LEVEL_KEY]: newZoomLevel });

  // Apply the new zoom level to all open tabs
  await setZoomLevelForAllTabs(newZoomLevel, settings);
}

// The zoom level that the tab is at (i.e., its page zoom without its base zoom
// level), or null if it is not known
function getCurrentZoomLevel(currentZoom, baseZoomLevel, targetZoomLevel) {
  // Before the first toggle, the page zoom says nothing about the zoom level.
  // For example, with a base zoom level of 80, an unzoomed page (100%) would
  // seem to be at the zoom level 125.
  if (targetZoomLevel === undefined) {
    return null;
  }

  // If the page zoom had to be raised or lowered to what the browser supports
  // (e.g., from 600% to 500%), undoing the base zoom level would give a wrong
  // zoom level. So a tab at the page zoom of the target zoom level is regarded
  // as being at the target zoom level.
  if (
    areNumbersClose(
      currentZoom,
      computePageZoom(baseZoomLevel, targetZoomLevel),
    )
  ) {
    return targetZoomLevel;
  }

  return (currentZoom / baseZoomLevel) * 100;
}

async function setZoomLevelForAllTabs(zoomLevel, settings) {
  console.log(`>> Setting zoom level for all tabs to ${zoomLevel}`);
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => setZoomLevelForTab(tab, zoomLevel, settings)),
  );
}

// Apply the stored zoom level to all new tabs when they are created
chrome.tabs.onCreated.addListener((tab) => {
  console.log('------- New tab created -------');
  setZoomToTargetLevelInGivenTab(tab);
});

// Apply the stored zoom level to all updated tabs when they are refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log('------- Tab refreshed -------');
  setZoomToTargetLevelInGivenTab(tab);
});

// Re-apply the zoom level to all tabs when the base zoom levels (of this
// computer or of sites) change, so that the user sees the effect right away
chrome.storage.onChanged.addListener((changes, areaName) => {
  const haveBaseZoomLevelsChanged =
    (areaName === 'sync' && changes[SITE_BASE_ZOOM_LEVELS_KEY]) ||
    (areaName === 'local' && changes[COMPUTER_BASE_ZOOM_LEVEL_KEY]);

  if (haveBaseZoomLevelsChanged) {
    console.log('------- Base zoom levels changed -------');
    reapplyZoomLevelToAllTabs();
  }
});

let reapplyQueue = Promise.resolve();

// Saving the options can change both base zoom levels at once, which triggers
// two re-applications. They run one after the other (each with freshly loaded
// settings), so that one with outdated settings cannot finish last.
function reapplyZoomLevelToAllTabs() {
  reapplyQueue = reapplyQueue
    .then(async () => {
      const settings = await loadSettings();
      if (settings.targetZoomLevel !== undefined) {
        await setZoomLevelForAllTabs(settings.targetZoomLevel, settings);
      }
    })
    .catch((error) => {
      console.log('Cannot re-apply the zoom level:', error.message);
    });
}

async function setZoomToTargetLevelInGivenTab(tab) {
  const settings = await loadSettings();

  if (settings.targetZoomLevel === undefined) {
    console.log('No zoom level has been toggled to yet; no actions');
    return;
  }

  await setZoomLevelForTab(tab, settings.targetZoomLevel, settings);
}

async function setZoomLevelForTab(tab, zoomLevel, settings) {
  const baseZoomLevel = getBaseZoomLevel(tab.url, settings);
  const targetZoom = computePageZoom(baseZoomLevel, zoomLevel);

  try {
    const currentZoom = (await chrome.tabs.getZoom(tab.id)) * 100;

    console.log(
      `>> Tab ${tab.id}: current zoom: ${currentZoom}; ` +
        `base zoom level: ${baseZoomLevel}; target zoom: ${targetZoom}`,
    );

    if (areNumbersClose(currentZoom, targetZoom)) {
      console.log('   Two zoom levels are close enough; no actions');
    } else {
      console.log(`   Setting zoom to ${targetZoom}`);
      await chrome.tabs.setZoom(tab.id, targetZoom / 100);
    }
  } catch (error) {
    // E.g., the tab has been closed, or it is a page that cannot be zoomed
    console.log(`   Cannot set zoom for tab ${tab.id}:`, error.message);
  }
}

// The base zoom level of the page at `url`: the base zoom level of this
// computer times that of the site. For example, 80 (computer) and 90 (site)
// gives 72.
function getBaseZoomLevel(url, settings) {
  const siteBaseZoomLevel = getSiteBaseZoomLevel(
    url,
    settings.siteBaseZoomLevels,
  );
  return (settings.computerBaseZoomLevel * siteBaseZoomLevel) / 100;
}

// The base zoom level of the site that `url` belongs to. A listed domain also
// covers its subdomains, and the most specific domain wins.
//
// Note: `url` is only available for sites on the list, because the extension
// only has host permissions for those sites. For other sites, `url` is
// undefined, and the default base zoom level is used.
function getSiteBaseZoomLevel(url, siteBaseZoomLevels) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return DEFAULT_BASE_ZOOM_LEVEL;
  }

  let bestMatch = null;
  for (const domain of Object.keys(siteBaseZoomLevels)) {
    const isMatch = hostname === domain || hostname.endsWith('.' + domain);
    if (isMatch && (bestMatch === null || domain.length > bestMatch.length)) {
      bestMatch = domain;
    }
  }

  return bestMatch === null
    ? DEFAULT_BASE_ZOOM_LEVEL
    : siteBaseZoomLevels[bestMatch];
}

// The actual page zoom: the zoom level works as a multiplier of the page's
// base zoom level. For example, 90 (base) and 110 (zoom level) gives 99.
function computePageZoom(baseZoomLevel, zoomLevel) {
  const pageZoom = (baseZoomLevel * zoomLevel) / 100;
  return Math.min(Math.max(pageZoom, MIN_PAGE_ZOOM), MAX_PAGE_ZOOM);
}

// The zoom level to toggle to from `currentZoomLevel` (null if not known), or
// null if there are fewer than 2 zoom levels to toggle between
function determineNewZoomLevel(
  currentZoomLevel,
  zoomLevel1,
  zoomLevel2,
  zoomLevel3,
) {
  // Zoom levels of -1 are not used, and a repeated zoom level counts once
  let numbers = [
    ...new Set([zoomLevel1, zoomLevel2, zoomLevel3].filter((num) => num > 0)),
  ];

  if (numbers.length <= 1) {
    // there's nothing to toggle between
    return null;
  }

  numbers.sort(function (a, b) {
    return a - b;
  });

  if (currentZoomLevel === null) {
    // Start from the lowest zoom level
    return numbers[0];
  }

  if (numbers.length == 2) {
    let newZoomLevel = areNumbersClose(currentZoomLevel, numbers[0])
      ? numbers[1]
      : numbers[0];

    return newZoomLevel;
  }

  let newZoomLevel;

  if (areNumbersClose(currentZoomLevel, numbers[0])) {
    newZoomLevel = numbers[1];
  } else if (areNumbersClose(currentZoomLevel, numbers[1])) {
    newZoomLevel = numbers[2];
  } else {
    newZoomLevel = numbers[0];
  }

  return newZoomLevel;
}

function areNumbersClose(a, b) {
  return Math.abs(a - b) < EPSILON;
}
