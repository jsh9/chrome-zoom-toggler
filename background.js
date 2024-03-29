const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const ZOOM_LEVEL_3_KEY = 'zoom_level_3';
const TARGET_ZOOM_LEVEL_KEY = 'target_zoom_level';
const EPSILON = 0.001;

let zoomLevel1 = 110;
let zoomLevel2 = 125;
let zoomLevel3 = 150;

// Load initial zoom levels
chrome.storage.sync.get(
  [ZOOM_LEVEL_1_KEY, ZOOM_LEVEL_2_KEY, ZOOM_LEVEL_3_KEY],
  (result) => {
    zoomLevel1 = result[ZOOM_LEVEL_1_KEY] || zoomLevel1;
    zoomLevel2 = result[ZOOM_LEVEL_2_KEY] || zoomLevel2;
    zoomLevel3 = result[ZOOM_LEVEL_3_KEY] || zoomLevel3;

    console.log(
      'User-specified zoom levels:',
      zoomLevel1,
      zoomLevel2,
      zoomLevel3,
    );
  },
);

// Listen for storage changes to update zoom levels
chrome.storage.onChanged.addListener((changes) => {
  if (changes[ZOOM_LEVEL_1_KEY]) {
    zoomLevel1 = changes[ZOOM_LEVEL_1_KEY].newValue || zoomLevel1;
  }
  if (changes[ZOOM_LEVEL_2_KEY]) {
    zoomLevel2 = changes[ZOOM_LEVEL_2_KEY].newValue || zoomLevel2;
  }
  if (changes[ZOOM_LEVEL_3_KEY]) {
    zoomLevel3 = changes[ZOOM_LEVEL_3_KEY].newValue || zoomLevel3;
  }
});

// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
  console.log('--------- Clicked -----------');

  // Retrieve the current zoom level of the active tab
  chrome.tabs.getZoom(tab.id, (currentZoomRaw) => {
    let currentZoom = currentZoomRaw * 100;
    console.log('Current zoom level:', currentZoom);
    console.log(
      `User-specified zoom levels: (${zoomLevel1}, ${zoomLevel2}, ${zoomLevel3})`,
    );

    // Toggle between the three user-defined zoom levels
    let newZoom = determineNewZoomLevel(
      currentZoom,
      zoomLevel1,
      zoomLevel2,
      zoomLevel3,
    );

    // Apply the new zoom level to all open tabs
    setZoomLevelForAllTabs(currentZoom, newZoom);
    chrome.storage.sync.set({ [TARGET_ZOOM_LEVEL_KEY]: newZoom });
  });
});

// Function to set the zoom level for all open tabs
function setZoomLevelForAllTabs(currentZoom, targetZoom) {
  console.log(
    '>> Setting zoom level for all tabs from ' +
      `${currentZoom} to ${targetZoom}`,
  );
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!areNumbersClose(currentZoom, targetZoom)) {
        chrome.tabs.setZoom(tab.id, targetZoom / 100);
      }
    });
  });
}

// Apply the stored zoom level to all new tabs when they are created
chrome.tabs.onCreated.addListener((tab) => {
  console.log('------- New tab created -------');
  setZoomToTargetLevelInGivenTab(tab.id);
});

// Apply the stored zoom level to all updated tabs when they are refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log('------- Tab refreshed -------');
  setZoomToTargetLevelInGivenTab(tabId);
});

function setZoomToTargetLevelInGivenTab(tabId) {
  chrome.tabs.getZoom(tabId, (currentZoomRaw) => {
    chrome.storage.sync.get(TARGET_ZOOM_LEVEL_KEY, (result) => {
      let targetZoom = result[TARGET_ZOOM_LEVEL_KEY];
      let currentZoom = currentZoomRaw * 100;

      console.log('>> Setting zoom level for current tab');
      console.log(
        `   Current zoom: ${currentZoom}; target zoom: ${targetZoom}`,
      );

      if (areNumbersClose(currentZoom, targetZoom)) {
        console.log('Two zoom levels are close enough; no actions');
      } else {
        console.log(`   Setting current zoom level to ${targetZoom}`);
        chrome.tabs.setZoom(tabId, targetZoom / 100);
      }
    });
  });
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
