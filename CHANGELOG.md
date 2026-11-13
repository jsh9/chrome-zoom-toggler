# Changelog

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
