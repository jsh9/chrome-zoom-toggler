# Changelog

## [0.0.9] - 2026-11-23

### Added

- Base zoom level of this computer: in Extension Options, set a base zoom
  level that only applies to the current computer. The zoom levels become
  multipliers of it (e.g., 80% × 125% = 100%), together with per-site base
  zoom levels (e.g., 80% × 90% × 125% = 90%). It is stored in
  `chrome.storage.local`, so unlike the other settings, it is not synced
  across computers. If it is left empty, it is 100%, so the behavior is the
  same as before.

### Changed

- The first click (before any zoom level has been toggled to) goes to the
  lowest zoom level. Before, it depended on the page zoom: e.g., on a site
  with a base zoom level of 80%, an unzoomed page (100%) seemed to be at the
  zoom level 125%, so the first click went to 150%.
- With fewer than 2 different zoom levels, clicking does nothing. Before, it
  stored the current zoom level of the page, which then applied to new tabs
  (and was synced to other computers).
- The warning about missing permissions on the options page now says that
  it is about the per-site base zoom levels.
- The extension's description says that it toggles between up to 3 zoom
  levels (not 2), and mentions the base zoom levels.

### Fixed

- Toggling no longer gets stuck when a page zoom has to be raised or lowered
  to what the browser supports (25% to 500%), e.g., 400% × 150% = 600%,
  shown at 500%.
- Toggling no longer gets stuck when 2 of the zoom levels are the same (e.g.,
  110, 110, and 150).

## [0.0.8] - 2026-11-13

### Added

- Per-site base zoom levels: in Extension Options, list sites as
  `domain, base_zoom_level` (e.g., `github.com, 90`), one per line. On a listed
  site, the zoom levels become multipliers of its base zoom level (e.g., 90% ×
  110% = 99%). Unlisted sites have a base zoom level of 100%, so they behave
  as before.
- A listed domain also covers its subdomains, and the most specific domain
  wins.
- When saving the list, the extension asks for permission to access only the
  listed sites, and gives up the permission for sites removed from the list.

### Fixed

- Settings are read from storage on every event, so they are correct right
  after the background service worker restarts.
- Tab updates no longer try to set an invalid zoom before the first toggle.

## [0.0.7] - 2023-11-27

### Added

- Option to toggle between only 2 zoom levels (use -1 as the 3rd level).

## [0.0.6] - 2023-11-18

### Added

- A 3rd zoom level.

## [0.0.5] - 2023-05-10

### Removed

- The unnecessary `tabs` permission.

## [0.0.4] - 2023-05-05

### Changed

- Set the zoom level before a page finishes loading.

## [0.0.3] - 2023-04-24

### Changed

- Removed redundant zooming and added logging.

## [0.0.2] - 2023-04-22

### Changed

- Migrated to Manifest V3.

## [0.0.1] - 2023-04-22

- Initial release.
