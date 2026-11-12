const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const ZOOM_LEVEL_3_KEY = 'zoom_level_3';
// The zoom level (i.e., the multiplier) the user last toggled to. On sites
// without a base zoom level, this is also the actual page zoom.
const TARGET_ZOOM_LEVEL_KEY = 'target_zoom_level';
// An object mapping domains (e.g., 'github.com') to their base zoom levels
const SITE_BASE_ZOOM_LEVELS_KEY = 'site_base_zoom_levels';

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
  const result = await chrome.storage.sync.get([
    ZOOM_LEVEL_1_KEY,
    ZOOM_LEVEL_2_KEY,
    ZOOM_LEVEL_3_KEY,
    TARGET_ZOOM_LEVEL_KEY,
    SITE_BASE_ZOOM_LEVELS_KEY,
  ]);

  return {
    zoomLevels: [
      result[ZOOM_LEVEL_1_KEY] || DEFAULT_ZOOM_LEVEL_1,
      result[ZOOM_LEVEL_2_KEY] || DEFAULT_ZOOM_LEVEL_2,
      result[ZOOM_LEVEL_3_KEY] || DEFAULT_ZOOM_LEVEL_3,
    ],
    targetZoomLevel: result[TARGET_ZOOM_LEVEL_KEY],
    siteBaseZoomLevels: result[SITE_BASE_ZOOM_LEVELS_KEY] || {},
  };
}

// Listen for extension icon clicks
chrome.action.onClicked.addListener(handleActionClick);

async function handleActionClick(tab) {
  console.log('--------- Clicked -----------');

  const settings = await loadSettings();
  const currentZoom = (await chrome.tabs.getZoom(tab.id)) * 100;
  const baseZoomLevel = getBaseZoomLevel(tab.url, settings.siteBaseZoomLevels);
  // Undo the base zoom level to find out which zoom level the tab is at
  const currentZoomLevel = (currentZoom / baseZoomLevel) * 100;

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

  await chrome.storage.sync.set({ [TARGET_ZOOM_LEVEL_KEY]: newZoomLevel });

  if (areNumbersClose(currentZoomLevel, newZoomLevel)) {
    console.log('Zoom level unchanged; no actions');
    return;
  }

  // Apply the new zoom level to all open tabs
  await setZoomLevelForAllTabs(newZoomLevel, settings.siteBaseZoomLevels);
}

async function setZoomLevelForAllTabs(zoomLevel, siteBaseZoomLevels) {
  console.log(`>> Setting zoom level for all tabs to ${zoomLevel}`);
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => setZoomLevelForTab(tab, zoomLevel, siteBaseZoomLevels)),
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

// Re-apply the zoom level to all tabs when the per-site base zoom levels
// change, so that the user sees the effect right away
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'sync' || !changes[SITE_BASE_ZOOM_LEVELS_KEY]) {
    return;
  }

  console.log('------- Site base zoom levels changed -------');
  const settings = await loadSettings();
  if (settings.targetZoomLevel !== undefined) {
    await setZoomLevelForAllTabs(
      settings.targetZoomLevel,
      settings.siteBaseZoomLevels,
    );
  }
});

async function setZoomToTargetLevelInGivenTab(tab) {
  const settings = await loadSettings();

  if (settings.targetZoomLevel === undefined) {
    console.log('No zoom level has been toggled to yet; no actions');
    return;
  }

  await setZoomLevelForTab(
    tab,
    settings.targetZoomLevel,
    settings.siteBaseZoomLevels,
  );
}

async function setZoomLevelForTab(tab, zoomLevel, siteBaseZoomLevels) {
  const baseZoomLevel = getBaseZoomLevel(tab.url, siteBaseZoomLevels);
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

// The base zoom level of the site that `url` belongs to. A listed domain also
// covers its subdomains, and the most specific domain wins.
//
// Note: `url` is only available for sites on the list, because the extension
// only has host permissions for those sites. For other sites, `url` is
// undefined, and the default base zoom level is used.
function getBaseZoomLevel(url, siteBaseZoomLevels) {
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

// The actual page zoom: the zoom level works as a multiplier of the site's
// base zoom level. For example, 90 (base) and 110 (zoom level) gives 99.
function computePageZoom(baseZoomLevel, zoomLevel) {
  const pageZoom = (baseZoomLevel * zoomLevel) / 100;
  return Math.min(Math.max(pageZoom, MIN_PAGE_ZOOM), MAX_PAGE_ZOOM);
}

function determineNewZoomLevel(
  currentZoom,
  zoomLevel1,
  zoomLevel2,
  zoomLevel3,
) {
  let numbers = [zoomLevel1, zoomLevel2, zoomLevel3].filter((num) => num > 0);

  if (numbers.length <= 1) {
    // there's no need to toggle
    return currentZoom;
  }

  numbers.sort(function (a, b) {
    return a - b;
  });

  if (numbers.length == 2) {
    let newZoomLevel = areNumbersClose(currentZoom, numbers[0])
      ? numbers[1]
      : numbers[0];

    return newZoomLevel;
  }

  let newZoomLevel;

  if (areNumbersClose(currentZoom, numbers[0])) {
    newZoomLevel = numbers[1];
  } else if (areNumbersClose(currentZoom, numbers[1])) {
    newZoomLevel = numbers[2];
  } else {
    newZoomLevel = numbers[0];
  }

  return newZoomLevel;
}

function areNumbersClose(a, b) {
  return Math.abs(a - b) < EPSILON;
}
