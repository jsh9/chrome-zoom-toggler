const { test, expect } = require('./fixtures');

// Save the options with the given base zoom level of this computer ('' to
// clear it) and, optionally, per-site list
async function saveOptions(ext, { computerBaseZoomLevel, siteLines = [] }) {
  const page = await ext.openOptions();
  await page.fill('#zoom1', '110');
  await page.fill('#zoom2', '125');
  await page.fill('#zoom3', '150');
  await page.fill('#computerBaseZoomLevel', computerBaseZoomLevel);
  await page.fill('#siteBaseZoomLevels', siteLines.join('\n'));
  await page.click('button[type=submit]');
  await expect(page.locator('#status')).toHaveText('Settings saved.');
  await page.close();
}

test('the base zoom level of a page is that of this computer times that of the site', async ({
  ext,
}) => {
  const results = await ext.evaluate(async () => {
    const settings = {
      computerBaseZoomLevel: 80,
      siteBaseZoomLevels: { 'github.com': 90 },
    };
    return {
      listedSite: getBaseZoomLevel('https://github.com/', settings),
      unlistedSite: getBaseZoomLevel('https://example.org/', settings),
      noPermission: getBaseZoomLevel(undefined, settings),
      defaultComputerBase: (await loadSettings()).computerBaseZoomLevel,
    };
  });

  expect(results).toEqual({
    listedSite: 72, // 80% x 90%
    unlistedSite: 80,
    noPermission: 80,
    defaultComputerBase: 100,
  });
});

test('the base zoom level of this computer is saved only on this computer', async ({
  ext,
}) => {
  await saveOptions(ext, { computerBaseZoomLevel: '87.5' });

  // `chrome.storage.local` is not synced across computers
  expect(await ext.getLocalStorage()).toEqual({
    computer_base_zoom_level: 87.5,
  });
  expect(await ext.getSyncStorage()).not.toHaveProperty(
    'computer_base_zoom_level',
  );
});

test('the options page shows the saved base zoom level of this computer', async ({
  ext,
}) => {
  let page = await ext.openOptions();
  const input = page.locator('#computerBaseZoomLevel');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', '100');
  await page.close();

  await ext.setLocalStorage({ computer_base_zoom_level: 87.5 });
  page = await ext.openOptions();
  await expect(page.locator('#computerBaseZoomLevel')).toHaveValue('87.5');
});

test('clearing the base zoom level of this computer removes it', async ({
  ext,
}) => {
  await ext.setLocalStorage({ computer_base_zoom_level: 80 });

  await saveOptions(ext, { computerBaseZoomLevel: '' });

  expect(await ext.getLocalStorage()).toEqual({});
});

test('a base zoom level of this computer out of range is not saved', async ({
  ext,
}) => {
  await ext.setLocalStorage({ computer_base_zoom_level: 80 });
  const page = await ext.openOptions();
  await page.fill('#zoom1', '110');
  await page.fill('#zoom2', '125');
  await page.fill('#zoom3', '150');

  for (const value of ['24', '501']) {
    await page.fill('#computerBaseZoomLevel', value);
    await page.click('button[type=submit]');

    // The browser's form validation stops the form from being submitted
    await expect(page.locator('#computerBaseZoomLevel:invalid')).toHaveCount(1);
    expect(await ext.getLocalStorage()).toEqual({
      computer_base_zoom_level: 80,
    });
  }
});

test('zoom levels are multipliers of the base zoom levels of this computer and sites', async ({
  ext,
  server,
}) => {
  await saveOptions(ext, {
    computerBaseZoomLevel: '80',
    siteLines: ['a.localhost, 90'],
  });
  const listed = await ext.openTab(server.url('a.localhost'));
  const notListed = await ext.openTab(server.url('b.localhost'));
  // The base zoom level of this computer needs no permissions
  const noPermission = await ext.openTab(server.url());

  // An unzoomed page (100%) is at the zoom level 125 here (100% / 80%), so
  // the first toggle goes to the next one
  await ext.toggle(noPermission.tabId); // To 150

  await ext.expectZoom(listed.tabId, 108); // 80% x 90% x 150%
  await ext.expectZoom(notListed.tabId, 120); // 80% x 150%
  await ext.expectZoom(noPermission.tabId, 120);

  // Toggling takes both base zoom levels into account to tell which zoom
  // level the tab is at
  await ext.toggle(listed.tabId); // To 110

  await ext.expectZoom(listed.tabId, 79.2); // 80% x 90% x 110%
  await ext.expectZoom(notListed.tabId, 88); // 80% x 110%
  await ext.expectZoom(noPermission.tabId, 88);

  await ext.toggle(notListed.tabId); // To 125

  await ext.expectZoom(listed.tabId, 90); // 80% x 90% x 125%
  await ext.expectZoom(notListed.tabId, 100); // 80% x 125%
  await ext.expectZoom(noPermission.tabId, 100);
});

test('new tabs get the base zoom level of this computer', async ({
  ext,
  server,
}) => {
  await ext.setLocalStorage({ computer_base_zoom_level: 50 });
  const { tabId } = await ext.openTab(server.url());
  await ext.toggle(tabId); // To 110
  await ext.expectZoom(tabId, 55); // 50% x 110%

  const newTab = await ext.openTab(server.url('a.localhost'));
  await ext.expectZoom(newTab.tabId, 55);
});

test('changes to the base zoom level of this computer take effect right away', async ({
  ext,
  server,
}) => {
  const { tabId } = await ext.openTab(server.url());
  await ext.toggle(tabId); // To 110
  await ext.expectZoom(tabId, 110);

  await saveOptions(ext, { computerBaseZoomLevel: '50' });
  await ext.expectZoom(tabId, 55); // 50% x 110%

  await saveOptions(ext, { computerBaseZoomLevel: '' });
  await ext.expectZoom(tabId, 110);
});

test('changing both base zoom levels at once takes effect right away', async ({
  ext,
  server,
}) => {
  const { tabId } = await ext.openTab(server.url('a.localhost'));
  await ext.toggle(tabId); // To 110
  await ext.expectZoom(tabId, 110);

  // Each change triggers its own re-application of the zoom level; the one
  // that ends last must use both new values
  await saveOptions(ext, {
    computerBaseZoomLevel: '80',
    siteLines: ['a.localhost, 50'],
  });

  await ext.expectZoom(tabId, 44); // 80% x 50% x 110%
});

test('re-applications of the zoom level run one after the other', async ({
  ext,
  server,
}) => {
  const { tabId } = await ext.openTab(server.url());
  await ext.toggle(tabId); // To 110
  await ext.expectZoom(tabId, 110);

  // Make the 1st of 2 re-applications read outdated settings and finish
  // late. If they ran at the same time, it would finish last and win.
  await ext.evaluate(async () => {
    const realLoadSettings = loadSettings;
    const realSetZoomLevelForAllTabs = setZoomLevelForAllTabs;
    let calls = 0;
    let finished = 0;

    self.loadSettings = async () => {
      const call = ++calls;
      const settings = await realLoadSettings();
      if (call === 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ...settings, computerBaseZoomLevel: 50 };
      }
      return { ...settings, computerBaseZoomLevel: 80 };
    };
    self.setZoomLevelForAllTabs = async (...args) => {
      await realSetZoomLevelForAllTabs(...args);
      finished++;
    };

    try {
      reapplyZoomLevelToAllTabs();
      reapplyZoomLevelToAllTabs();
      while (finished < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      self.loadSettings = realLoadSettings;
      self.setZoomLevelForAllTabs = realSetZoomLevelForAllTabs;
    }
  });

  expect(await ext.getZoom(tabId)).toBeCloseTo(88, 5); // 80% x 110%
});
