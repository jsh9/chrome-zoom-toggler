const { test, expect } = require('./fixtures');

test('a listed domain covers its subdomains, and the most specific one wins', async ({
  ext,
}) => {
  const siteBaseZoomLevels = { 'github.com': 90, 'gist.github.com': 120 };
  const urls = [
    'https://github.com/foo',
    'https://www.github.com/',
    'https://gist.github.com/foo',
    'https://a.gist.github.com/',
    'https://notgithub.com/',
    'https://github.com.example.org/',
    // The extension cannot see the URLs of tabs on sites without permissions
    undefined,
  ];

  const baseZoomLevels = await ext.evaluate(
    ({ urls, siteBaseZoomLevels }) =>
      urls.map((url) => getBaseZoomLevel(url, siteBaseZoomLevels)),
    { urls, siteBaseZoomLevels },
  );

  expect(baseZoomLevels).toEqual([90, 90, 120, 120, 100, 100, 100]);
});

async function saveSiteBaseZoomLevels(ext, lines) {
  const page = await ext.openOptions();
  await page.fill('#zoom1', '110');
  await page.fill('#zoom2', '125');
  await page.fill('#zoom3', '150');
  await page.fill('#siteBaseZoomLevels', lines.join('\n'));
  await page.click('button[type=submit]');
  await expect(page.locator('#status')).toHaveText('Settings saved.');
  await page.close();
}

test('zoom levels are multipliers of the base zoom levels of sites', async ({
  ext,
  server,
}) => {
  await saveSiteBaseZoomLevels(ext, [
    'a.localhost, 90',
    'deep.a.localhost, 150',
  ]);
  const listed = await ext.openTab(server.url('a.localhost'));
  const listedSubdomain = await ext.openTab(server.url('deep.a.localhost'));
  const notListed = await ext.openTab(server.url('b.localhost'));
  const noPermission = await ext.openTab(server.url());

  await ext.toggle(noPermission.tabId);

  await ext.expectZoom(listed.tabId, 99); // 90% x 110%
  await ext.expectZoom(listedSubdomain.tabId, 165); // 150% x 110%
  await ext.expectZoom(notListed.tabId, 110);
  await ext.expectZoom(noPermission.tabId, 110);

  // Toggling on a listed site takes its base zoom level into account to tell
  // which zoom level the tab is at
  await ext.toggle(listed.tabId);

  await ext.expectZoom(listed.tabId, 112.5); // 90% x 125%
  await ext.expectZoom(listedSubdomain.tabId, 187.5); // 150% x 125%
  await ext.expectZoom(notListed.tabId, 125);
  await ext.expectZoom(noPermission.tabId, 125);
});

test('new tabs and pages on listed sites get their base zoom levels', async ({
  ext,
  server,
}) => {
  await saveSiteBaseZoomLevels(ext, ['a.localhost, 90', 'b.localhost, 80']);
  const { tabId, page } = await ext.openTab(server.url());
  await ext.toggle(tabId); // To 110

  // A new tab
  const newTab = await ext.openTab(server.url('a.localhost'));
  await ext.expectZoom(newTab.tabId, 99); // 90% x 110%

  // Another site in an existing tab
  await page.goto(server.url('b.localhost'));
  await ext.expectZoom(tabId, 88); // 80% x 110%
});

test('changes to the per-site list take effect right away', async ({
  ext,
  server,
}) => {
  const { tabId } = await ext.openTab(server.url('a.localhost'));
  await ext.toggle(tabId);
  await ext.expectZoom(tabId, 110);

  await saveSiteBaseZoomLevels(ext, ['a.localhost, 50']);
  await ext.expectZoom(tabId, 55); // 50% x 110%

  await saveSiteBaseZoomLevels(ext, ['a.localhost, 80']);
  await ext.expectZoom(tabId, 88); // 80% x 110%
});

test('the page zoom stays within what the browser supports', async ({
  ext,
  server,
}) => {
  await saveSiteBaseZoomLevels(ext, ['a.localhost, 500', 'b.localhost, 25']);
  await ext.setSyncStorage({ zoom_level_1: 50 });
  const large = await ext.openTab(server.url('a.localhost'));
  const small = await ext.openTab(server.url('b.localhost'));

  await ext.toggle(large.tabId); // To 50

  await ext.expectZoom(large.tabId, 250); // 500% x 50%
  await ext.expectZoom(small.tabId, 25); // 25% x 50% = 12.5%, raised to 25%

  await ext.toggle(large.tabId); // To 125

  await ext.expectZoom(large.tabId, 500); // 500% x 125% = 625%, lowered to 500%
});
