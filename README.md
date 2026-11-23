# chrome-zoom-toggler

A Chrome and Edge extension to enable one-click toggling between two customizable page zoom levels.

## 1. Installation

Please install it in Chrome Web Store: https://chrome.google.com/webstore/detail/zoom-toggler/ckkgnmnpnkoppnfieodnojnphijckpbl


## 2. How to use

Once installed, click on the icon of the extension to cycle through the zoom levels (110%, 125%, and 150% by default). The new zoom level is applied to all tabs.

You can customize the zoom levels by right-clicking on the icon and go to Extension Options.  Enter your desired zoom levels in the pop-up page.

### Base zoom level of this computer

If you use the extension on several computers with different screens (e.g., a large high-resolution monitor at work and a small laptop screen at home), you can give each computer its own base zoom level in Extension Options.

The zoom levels work as multipliers of this base zoom level. For example, with a base zoom level of 80, the zoom level 125% shows pages at 100% (80% × 125%). If it is left empty, the base zoom level is 100%, so pages are shown at the zoom levels themselves.

Unlike the other settings, which Chrome syncs to all computers signed into the same account, this setting is stored only on the current computer (in [`chrome.storage.local`](https://developer.chrome.com/docs/extensions/reference/api/storage)). So you can set the zoom levels once and have them synced, while each computer keeps its own base zoom level. Note that the setting is removed when you uninstall the extension.

### Per-site base zoom levels

Some sites look too big or too small at the same zoom level as other sites. In Extension Options, you can give such sites their own base zoom levels, one site per line, as `domain, base_zoom_level`:

```
github.com, 90
news.ycombinator.com, 150
```

On a listed site, the zoom levels work as multipliers of the site's base zoom level. For example, with `github.com, 90`, the zoom level 110% shows GitHub at 99% (90% × 110%), and 150% shows it at 135%. Sites that are not listed have a base zoom level of 100%, so they are shown at the zoom levels themselves.

If the computer also has a base zoom level, both apply. For example, with a base zoom level of 80 for the computer and `github.com, 90`, the zoom level 125% shows GitHub at 90% (80% × 90% × 125%).

A listed domain also covers its subdomains (e.g., `github.com` covers `gist.github.com`), and the most specific domain wins. So whether to include `www.` matters: `nytimes.com` covers the whole site, including `www.nytimes.com` and `cooking.nytimes.com`, while `www.nytimes.com` only covers `www.nytimes.com`. To cover a whole site, leave out `www.`.

When you save the list, the browser asks for permission to access the listed sites. The extension only uses this permission to tell which tabs are on these sites; it does not read or change the pages. When you remove a site from the list, its permission is removed as well (unless the site overlaps with a site that is still listed, e.g., `github.com` and `gist.github.com`).
