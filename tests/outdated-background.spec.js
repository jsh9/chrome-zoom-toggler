const { test, expect } = require('./fixtures');
const fs = require('fs');
const os = require('os');
const path = require('path');

// These tests use a copy of the extension whose background script is of an
// older version than its manifest.json, as when Chrome keeps running the
// previous version of it (see BACKGROUND_VERSION in background.js). It counts
// the reloads that it asks for, instead of reloading: in tests, a reloaded
// extension is not available until the browser restarts.
test.use({
  extensionPath: [
    async ({ extensionPath }, use) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-toggler-'));
      fs.cpSync(extensionPath, dir, { recursive: true });

      const backgroundPath = path.join(dir, 'background.js');
      const background = fs
        .readFileSync(backgroundPath, 'utf8')
        .replace(
          /^const BACKGROUND_VERSION = .*$/m,
          "const BACKGROUND_VERSION = '0.0.1';",
        );
      fs.writeFileSync(
        backgroundPath,
        'let reloads = 0;\n' +
          'chrome.runtime.reload = () => {\n  reloads++;\n};\n' +
          background,
      );

      await use(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
});

test('the background script reloads the extension when it starts', async ({
  ext,
}) => {
  const manifestVersion = await ext.evaluate(
    () => chrome.runtime.getManifest().version,
  );

  await expect.poll(() => ext.evaluate(() => reloads)).toBe(1);
  expect(await ext.getLocalStorage()).toEqual({
    reloaded_for_version: manifestVersion,
  });
});

test('the options page warns', async ({ ext }) => {
  const page = await ext.openOptions();

  await expect(page.locator('#outdatedWarning')).toBeVisible();
});
