# chrome-zoom-toggler

A Chrome and Edge extension to enable one-click toggling between two customizable page zoom levels.

## 1. Installation

Please install it in Chrome Web Store: https://chrome.google.com/webstore/detail/zoom-toggler/ckkgnmnpnkoppnfieodnojnphijckpbl


## 2. How to use

Once installed, click on the icon of the extension to cycle through the zoom levels (110%, 125%, and 150% by default). The new zoom level is applied to all tabs.

You can customize the zoom levels by right-clicking on the icon and go to Extension Options.  Enter your desired zoom levels in the pop-up page.

### Per-site base zoom levels

Some sites look too big or too small at the same zoom level as other sites. In Extension Options, you can give such sites their own base zoom levels, one site per line:

```
github.com 90
news.ycombinator.com 150
```

On a listed site, the zoom levels work as multipliers of the site's base zoom level. For example, with `github.com 90`, the zoom level 110% shows GitHub at 99% (90% × 110%), and 150% shows it at 135%. Sites that are not listed have a base zoom level of 100%, so they are shown at the zoom levels themselves.

A listed domain also covers its subdomains (e.g., `github.com` covers `gist.github.com`), and the most specific domain wins.

When you save the list, the browser asks for permission to access the listed sites. The extension only uses this permission to tell which tabs are on these sites; it does not read or change the pages. When you remove a site from the list, its permission is removed as well (unless the site overlaps with a site that is still listed, e.g., `github.com` and `gist.github.com`).
