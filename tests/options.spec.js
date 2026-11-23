const { test, expect } = require('./fixtures');

test('shows the saved settings', async ({ ext }) => {
  await ext.setSyncStorage({
    zoom_level_1: 105,
    zoom_level_2: 130,
    zoom_level_3: -1,
    site_base_zoom_levels: { 'a.localhost': 90, 'b.localhost': 75.5 },
  });

  const page = await ext.openOptions();

  await expect(page.locator('#zoom1')).toHaveValue('105');
  await expect(page.locator('#zoom2')).toHaveValue('130');
  await expect(page.locator('#zoom3')).toHaveValue('-1');
  await expect(page.locator('#siteBaseZoomLevels')).toHaveValue(
    'a.localhost, 90\nb.localhost, 75.5',
  );
});

test('saves the zoom levels', async ({ ext }) => {
  const page = await ext.openOptions();

  await page.fill('#zoom1', '105');
  await page.fill('#zoom2', '130');
  await page.fill('#zoom3', '-1');
  await page.click('button[type=submit]');

  await expect(page.locator('#status')).toHaveText('Settings saved.');
  expect(await ext.getSyncStorage()).toEqual({
    zoom_level_1: 105,
    zoom_level_2: 130,
    zoom_level_3: -1,
    site_base_zoom_levels: {},
  });
});

test('saves the per-site base zoom levels in a normalized form', async ({
  ext,
}) => {
  const page = await ext.openOptions();

  await page.fill('#zoom1', '110');
  await page.fill('#zoom2', '125');
  await page.fill('#zoom3', '150');
  await page.fill(
    '#siteBaseZoomLevels',
    [
      'https://A.localhost/some/path 90',
      '',
      '  *.b.localhost: 110%  ',
      'c.localhost=75.5',
    ].join('\n'),
  );
  await page.click('button[type=submit]');

  await expect(page.locator('#status')).toHaveText('Settings saved.');
  const storage = await ext.getSyncStorage();
  expect(storage.site_base_zoom_levels).toEqual({
    'a.localhost': 90,
    'b.localhost': 110,
    'c.localhost': 75.5,
  });
  await expect(page.locator('#siteBaseZoomLevels')).toHaveValue(
    'a.localhost, 90\nb.localhost, 110\nc.localhost, 75.5',
  );
});

test('saves nothing if the per-site list has errors', async ({ ext }) => {
  const savedSettings = {
    zoom_level_1: 110,
    zoom_level_2: 125,
    zoom_level_3: 150,
    site_base_zoom_levels: { 'a.localhost': 90 },
  };
  await ext.setSyncStorage(savedSettings);
  const page = await ext.openOptions();

  await page.fill('#zoom1', '105');
  await page.fill(
    '#siteBaseZoomLevels',
    [
      'not a valid line',
      'b.localhost, 10',
      'c.localhost, 90',
      'c.localhost, 95',
      'not_valid.localhost, 90',
    ].join('\n'),
  );
  await page.click('button[type=submit]');

  const status = page.locator('#status');
  await expect(status).toHaveText(
    [
      'Nothing was saved:',
      'Line 1: expected "domain, base_zoom_level" (e.g., "github.com, 90")',
      'Line 2: the base zoom level must be between 25 and 500',
      'Line 4: "c.localhost" is listed more than once',
      'Line 5: "not_valid.localhost" is not a valid domain',
    ].join('\n'),
  );
  await expect(status).toHaveClass('error');
  expect(await ext.getSyncStorage()).toEqual(savedSettings);
});

test('does not save zoom levels out of range', async ({ ext }) => {
  const page = await ext.openOptions();

  await page.fill('#zoom1', '110');
  await page.fill('#zoom2', '125');
  await page.fill('#zoom3', '501');
  await page.click('button[type=submit]');

  // The browser's form validation stops the form from being submitted
  await expect(page.locator('#zoom3:invalid')).toHaveCount(1);
  expect(await ext.getSyncStorage()).toEqual({});
});

test('gives up host permissions for sites removed from the list', async ({
  ext,
}) => {
  await ext.setSyncStorage({
    zoom_level_1: 110,
    zoom_level_2: 125,
    zoom_level_3: 150,
    site_base_zoom_levels: {
      'a.localhost': 90,
      'deep.b.localhost': 80,
      'c.localhost': 70,
    },
  });
  const page = await ext.openOptions();

  // Permissions granted by the manifest (see fixtures.js) cannot be given up,
  // so record what the page asks to give up instead
  await page.evaluate(() => {
    window.removedOrigins = [];
    chrome.permissions.remove = async ({ origins }) => {
      window.removedOrigins.push(...origins);
      return true;
    };
  });

  // Sites related to a site that is still listed (as its subdomain or parent
  // domain) keep their permissions
  await page.fill(
    '#siteBaseZoomLevels',
    'deep.a.localhost, 90\nb.localhost, 80',
  );
  await page.click('button[type=submit]');

  await expect(page.locator('#status')).toHaveText('Settings saved.');
  expect(await page.evaluate(() => window.removedOrigins)).toEqual([
    '*://*.c.localhost/*',
  ]);
});
