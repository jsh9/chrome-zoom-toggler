const { test: base, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// The extension can only see the URLs of tabs on sites that it has host
// permissions for, and the options page asks for these permissions when the
// per-site list is saved. Tests cannot click the browser's permission prompt,
// so the extension under test is a copy whose manifest grants the permissions
// for `localhost` and its subdomains up front. Asking for permissions that are
// already granted succeeds without a prompt.
//
// Chromium resolves `localhost` and its subdomains (e.g., `a.localhost`) to the
// loopback address without DNS, so tests use them as different sites, all
// served by the test server. Tabs on `127.0.0.1` stand for sites that the
// extension has no host permissions for.
const GRANTED_HOST_PERMISSION = '*://*.localhost/*';
const NO_PERMISSION_HOST = '127.0.0.1';

const test = base.extend({
  extensionPath: [
    async ({}, use) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-toggler-'));
      for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (entry.isFile()) {
          fs.copyFileSync(
            path.join(REPO_ROOT, entry.name),
            path.join(dir, entry.name),
          );
        }
      }

      const manifestPath = path.join(dir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.host_permissions = [GRANTED_HOST_PERMISSION];
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      await use(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],

  // A web server that serves a test page on any host name that resolves to it
  server: [
    async ({}, use) => {
      const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<p>Test page</p>');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      await use({
        url: (host = NO_PERMISSION_HOST) => `http://${host}:${port}/`,
      });

      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    { scope: 'worker' },
  ],

  // Each test gets a new browser profile, so settings do not leak between
  // tests
  context: async ({ extensionPath }, use) => {
    const context = await chromium.launchPersistentContext('', {
      // Unlike the default headless shell, the full Chromium can load
      // extensions in headless mode
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  ext: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    await use(new ExtensionHelper(context, serviceWorker));
  },
});

class ExtensionHelper {
  constructor(context, serviceWorker) {
    this.context = context;
    this.serviceWorker = serviceWorker;
    this.id = new URL(serviceWorker.url()).host;
  }

  // Run `fn` in the extension's service worker, where the `chrome` APIs and
  // the functions in background.js are available
  evaluate(fn, arg) {
    return this.serviceWorker.evaluate(fn, arg);
  }

  // Open `url` in a new tab. Tabs are referred to by their IDs, because the
  // extension cannot see the URLs of tabs on sites without host permissions.
  async openTab(url) {
    const [page, tabId] = await Promise.all([
      this.context.waitForEvent('page'),
      this.evaluate(async (url) => (await chrome.tabs.create({ url })).id, url),
    ]);
    await page.waitForLoadState();
    return { page, tabId };
  }

  // The page zoom of the tab, in percent
  getZoom(tabId) {
    return this.evaluate(
      async (tabId) => (await chrome.tabs.getZoom(tabId)) * 100,
      tabId,
    );
  }

  // Wait until the page zoom of the tab becomes `expected` (in percent)
  async expectZoom(tabId, expected) {
    await expect.poll(() => this.getZoom(tabId)).toBeCloseTo(expected, 5);
  }

  // Do what clicking the extension's toolbar button in the tab does.
  // Playwright cannot click the browser's toolbar, so the click handler is
  // called directly. (That it is registered is tested separately.)
  async toggle(tabId) {
    await this.evaluate(
      async (tabId) => handleActionClick(await chrome.tabs.get(tabId)),
      tabId,
    );
  }

  getSyncStorage() {
    return this.evaluate(() => chrome.storage.sync.get(null));
  }

  setSyncStorage(items) {
    return this.evaluate((items) => chrome.storage.sync.set(items), items);
  }

  // Open the options page, and wait until it has filled in the form with the
  // saved settings
  async openOptions() {
    const page = await this.context.newPage();
    await page.goto(`chrome-extension://${this.id}/options.html`);

    // The page reads the settings when it loads. Storage requests from a page
    // are answered in order, so once a later request is answered, the page
    // has received the settings (and filled in the form in the same callback).
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.sync.get(null, () =>
            chrome.storage.local.get(null, resolve),
          ),
        ),
    );
    return page;
  }
}

module.exports = { test, expect };
