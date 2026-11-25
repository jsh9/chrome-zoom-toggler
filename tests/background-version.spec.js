const { test, expect } = require('./fixtures');

// After an update, Chrome can keep running the previous version of the
// background script (see BACKGROUND_VERSION in background.js). These tests
// check how the extension notices that.

test('the version of the background script is the one in manifest.json', async ({
  ext,
}) => {
  const versions = await ext.evaluate(() => ({
    background: BACKGROUND_VERSION,
    manifest: chrome.runtime.getManifest().version,
  }));

  expect(versions.background).toBe(versions.manifest);
});

test('the options page shows no warning when the background script is up to date', async ({
  ext,
}) => {
  const page = await ext.openOptions();

  const response = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'get_background_version' }),
  );
  expect(response).toEqual({
    version: await ext.evaluate(() => chrome.runtime.getManifest().version),
  });
  expect(await page.evaluate(() => warnIfBackgroundIsOutdated())).toBe(false);
  await expect(page.locator('#outdatedWarning')).toBeHidden();
});

for (const [name, sendMessage] of [
  [
    'does not answer (as before 0.0.10)',
    () =>
      Promise.reject(
        new Error(
          'Could not establish connection. Receiving end does not exist.',
        ),
      ),
  ],
  ['is of an older version', () => Promise.resolve({ version: '0.0.1' })],
]) {
  test(`the options page warns when the background script ${name}`, async ({
    ext,
    context,
  }) => {
    const page = await context.newPage();
    // Before the page's own scripts run, as if the background script were old
    await page.addInitScript(`chrome.runtime.sendMessage = ${sendMessage};`);
    await page.goto(`chrome-extension://${ext.id}/options.html`);

    const warning = page.locator('#outdatedWarning');
    await expect(warning).toBeVisible();
    const version = await page.evaluate(
      () => chrome.runtime.getManifest().version,
    );
    await expect(warning).toContainText(
      `Zoom Toggler was updated to version ${version}, but Chrome is still ` +
        'running an older version of it in the background.',
    );

    // The button opens the extensions page, where it can be turned off and on
    const [extensionsPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#openExtensionsPage'),
    ]);
    await expect(extensionsPage).toHaveURL(`chrome://extensions/?id=${ext.id}`);
  });
}

// Runs reloadIfOutdated() in the background script as if its version were
// older than the one in manifest.json, and counts the reloads it asks for
async function runReloadIfOutdated(ext, { manifestVersion, times }) {
  return ext.evaluate(
    async ({ manifestVersion, times }) => {
      const realGetManifest = chrome.runtime.getManifest;
      const realReload = chrome.runtime.reload;
      let reloads = 0;
      chrome.runtime.getManifest = () => ({
        ...realGetManifest(),
        version: manifestVersion,
      });
      chrome.runtime.reload = () => {
        reloads++;
      };

      try {
        for (let i = 0; i < times; i++) {
          await reloadIfOutdated();
        }
      } finally {
        chrome.runtime.getManifest = realGetManifest;
        chrome.runtime.reload = realReload;
      }
      return reloads;
    },
    { manifestVersion, times },
  );
}

test('an out-of-date background script reloads the extension once per version', async ({
  ext,
}) => {
  // E.g., Chrome restarting it again and again
  expect(
    await runReloadIfOutdated(ext, { manifestVersion: '99.0', times: 3 }),
  ).toBe(1);
  expect(await ext.getLocalStorage()).toEqual({ reloaded_for_version: '99.0' });

  // Once more for the next version
  expect(
    await runReloadIfOutdated(ext, { manifestVersion: '99.1', times: 2 }),
  ).toBe(1);
  expect(await ext.getLocalStorage()).toEqual({ reloaded_for_version: '99.1' });
});

test('an up-to-date background script does not reload the extension', async ({
  ext,
}) => {
  const manifestVersion = await ext.evaluate(
    () => chrome.runtime.getManifest().version,
  );

  expect(await runReloadIfOutdated(ext, { manifestVersion, times: 2 })).toBe(0);
  expect(await ext.getLocalStorage()).toEqual({});
});
