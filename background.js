const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const TARGET_ZOOM_LEVEL_KEY = 'target_zoom_level';
const EPSILON = 0.001;

let zoomLevel1 = 110;
let zoomLevel2 = 150;

// Load initial zoom levels
chrome.storage.sync.get([ZOOM_LEVEL_1_KEY, ZOOM_LEVEL_2_KEY], (result) => {
  zoomLevel1 = result[ZOOM_LEVEL_1_KEY] || 110;
  zoomLevel2 = result[ZOOM_LEVEL_2_KEY] || 150;

  console.log('User-specified zoom levels:', zoomLevel1, zoomLevel2);
});

// Listen for storage changes to update zoom levels
chrome.storage.onChanged.addListener((changes) => {
  if (changes[ZOOM_LEVEL_1_KEY]) {
    zoomLevel1 = changes[ZOOM_LEVEL_1_KEY].newValue || 110;
  }
  if (changes[ZOOM_LEVEL_2_KEY]) {
    zoomLevel2 = changes[ZOOM_LEVEL_2_KEY].newValue || 150;
  }
});

// Listen for extension icon clicks
chrome.browserAction.onClicked.addListener((tab) => {
  // Retrieve the current zoom level of the active tab
  chrome.tabs.getZoom(tab.id, (currentZoom) => {
    let currentZoomPct = currentZoom * 100;
    console.log('Current zoom level:', currentZoomPct);
    console.log('zoomLevel1:', zoomLevel1);
    console.log('zoomLevel2:', zoomLevel2);

    // Toggle between the two user-defined zoom levels
    let newZoomLevel = determineNewZoomLevel(
      currentZoomPct,
      zoomLevel1,
      zoomLevel2,
    );

    console.log('Setting zoom level to:', newZoomLevel);

    // Apply the new zoom level to all open tabs
    setZoomLevelForAllTabs(newZoomLevel);
    chrome.storage.sync.set({ [TARGET_ZOOM_LEVEL_KEY]: newZoomLevel });
  });
});

// Function to set the zoom level for all open tabs
function setZoomLevelForAllTabs(zoomLevel) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.setZoom(tab.id, zoomLevel / 100);
    });
  });
}

// Apply the stored zoom level to all new tabs when they are created
chrome.tabs.onCreated.addListener((tab) => {
  setZoomToTargetLevel(tab.id);
});

// Apply the stored zoom level to all updated tabs when they are refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    setZoomToTargetLevel(tabId);
  }
});


function setZoomToTargetLevel(tabId) {
  chrome.tabs.getZoom(tabId, () => {
    chrome.storage.sync.get(TARGET_ZOOM_LEVEL_KEY, (result) => {
      let targetZoomLevel = result[TARGET_ZOOM_LEVEL_KEY];
      chrome.tabs.setZoom(tabId, targetZoomLevel / 100);
    });
  });
}


function determineNewZoomLevel(currentZoomPct, zoomLevel1, zoomLevel2) {
  let newZoomLevel = areNumbersClose(currentZoomPct, zoomLevel1)
    ? zoomLevel2
    : zoomLevel1;

  return newZoomLevel;
}


function areNumbersClose(a, b) {
  return Math.abs(a - b) < EPSILON;
}
