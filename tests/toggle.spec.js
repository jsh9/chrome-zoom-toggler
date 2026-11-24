const { test, expect } = require('./fixtures');

test('the toolbar button is wired to the toggle handler', async ({ ext }) => {
  const isRegistered = await ext.evaluate(() =>
    chrome.action.onClicked.hasListener(handleActionClick),
  );
  expect(isRegistered).toBe(true);
});

test('cycles through the default zoom levels', async ({ ext, server }) => {
  const { tabId } = await ext.openTab(server.url());
  await ext.expectZoom(tabId, 100);

  for (const expected of [110, 125, 150, 110]) {
    await ext.toggle(tabId);
    await ext.expectZoom(tabId, expected);
  }

  const storage = await ext.getSyncStorage();
  expect(storage.target_zoom_level).toBe(110);
});

test('applies the new zoom level to all open tabs', async ({ ext, server }) => {
  const tab1 = await ext.openTab(server.url());
  const tab2 = await ext.openTab(server.url('a.localhost'));

  await ext.toggle(tab1.tabId);

  await ext.expectZoom(tab1.tabId, 110);
  await ext.expectZoom(tab2.tabId, 110);
});

test('applies the current zoom level to new pages', async ({ ext, server }) => {
  const { tabId, page } = await ext.openTab(server.url());
  await ext.toggle(tabId);
  await ext.expectZoom(tabId, 110);

  // A new tab
  const newTab = await ext.openTab(server.url('a.localhost'));
  await ext.expectZoom(newTab.tabId, 110);

  // Another site in an existing tab
  await page.goto(server.url('b.localhost'));
  await ext.expectZoom(tabId, 110);
});

test('uses the zoom levels set in the options', async ({ ext, server }) => {
  // In any order
  await ext.setSyncStorage({
    zoom_level_1: 175,
    zoom_level_2: 90,
    zoom_level_3: 100,
  });
  const { tabId } = await ext.openTab(server.url());

  // The first toggle goes to the lowest zoom level, even though the page is at
  // 100, which is also one of the zoom levels
  for (const expected of [90, 100, 175, 90]) {
    await ext.toggle(tabId);
    await ext.expectZoom(tabId, expected);
  }
});

test('toggles between 2 zoom levels if the 3rd one is -1', async ({
  ext,
  server,
}) => {
  await ext.setSyncStorage({
    zoom_level_1: 120,
    zoom_level_2: 80,
    zoom_level_3: -1,
  });
  const { tabId } = await ext.openTab(server.url());

  for (const expected of [80, 120, 80]) {
    await ext.toggle(tabId);
    await ext.expectZoom(tabId, expected);
  }
});

test('toggles through a repeated zoom level once', async ({ ext, server }) => {
  await ext.setSyncStorage({
    zoom_level_1: 110,
    zoom_level_2: 150,
    zoom_level_3: 110,
  });
  const { tabId } = await ext.openTab(server.url());

  for (const expected of [110, 150, 110]) {
    await ext.toggle(tabId);
    await ext.expectZoom(tabId, expected);
  }
});

test('does nothing with only 1 zoom level', async ({ ext, server }) => {
  await ext.setSyncStorage({
    zoom_level_1: 130,
    zoom_level_2: -1,
    zoom_level_3: 130,
  });
  const { tabId } = await ext.openTab(server.url());

  await ext.toggle(tabId);

  expect(await ext.getZoom(tabId)).toBeCloseTo(100, 5);
  // So that new tabs are not zoomed either
  let storage = await ext.getSyncStorage();
  expect(storage).not.toHaveProperty('target_zoom_level');

  // Also when a zoom level was stored before (e.g., when there were more
  // zoom levels), and the tab was zoomed by hand
  await ext.setSyncStorage({ target_zoom_level: 110 });
  await ext.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1.5), tabId);

  await ext.toggle(tabId);

  expect(await ext.getZoom(tabId)).toBeCloseTo(150, 5);
  storage = await ext.getSyncStorage();
  expect(storage.target_zoom_level).toBe(110);
});

test('ignores a stored zoom level that is not a positive number', async ({
  ext,
  server,
}) => {
  const { tabId } = await ext.openTab(server.url());
  await ext.setSyncStorage({ target_zoom_level: null });

  // What happens when a tab is created or updated
  await ext.evaluate(
    async (tabId) =>
      setZoomToTargetLevelInGivenTab(await chrome.tabs.get(tabId)),
    tabId,
  );

  expect(await ext.getZoom(tabId)).toBeCloseTo(100, 5);
});
