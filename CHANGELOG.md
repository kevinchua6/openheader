# Changelog

All notable changes to OpenHeader are documented in this file.

## [1.1.0] - 2026-07-02

### Added
- Block URLs: optionally block requests matching a regex, per profile, taking priority over header modifications.
- Import support for ModHeader export files, in addition to OpenHeader's own format.
- Per-browser manifest generation at build time (`build.js` + `manifest.base.json`), so Chrome gets a service worker background and Firefox gets background scripts from a single source manifest.

### Changed
- Refreshed the color palette and general UI polish (darker green, less washed-out pause button, card styling).
- Updated the README to reflect the current feature set.

### Fixed
- Removed an unsafe `innerHTML` assignment in the popup in favor of safe DOM construction.

## [1.0.1] - previous release

### Added
- Firefox compatibility.
- Tab URL filters with friendlier, auto-populated patterns (no more manually escaping dots).

### Changed
- Renamed the extension to OpenHeader.
- Removed unneeded extension permissions.

### Fixed
- Missing `data_collection_permissions` manifest property.
- Unique ID generation error.
- Everything now grays out while paused, making the paused state easier to notice.
