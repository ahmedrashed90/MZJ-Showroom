# MZJ Showroom v39 — Exact Vehicle / Page Data Clean

Clean rebuild of the dashboard-to-display vehicle binding.

## Core behavior
- Each display is locked to the selected vehicle by stable vehicle/post ID.
- The canonical car URL saved with that ID is the URL used by the QR code.
- The display title comes from the exact selected car page; no generic "سيارة المعرض" fallback is shown.
- Vehicle images are read only from the exact car gallery (`data-gallery-main` / `data-gallery-thumb`) and exact color image payloads. Related-car/page-wide images are not scraped.
- When the selected car changes, saved manual images/color selection from the old car are cleared before the new car is saved.
- Car-page data is read from the same structures rendered by the Panorama car plugin:
  - quick/main specifications
  - transmission group
  - engine/performance group
  - dimensions/weights group
  - interior features
  - exterior features
  - safety features
- Main specs are shown in full.
- Technical groups and long feature lists rotate automatically so all available data can be displayed.
- Duplicate specification concepts are removed from later groups if already present in main specs.
- Repeated feature text is deduplicated across interior/exterior/safety sections.
- Dashboard font-size controls and logo selection/size/position continue to apply live to display pages.
- `forceRefresh` performs a real re-read of the exact vehicle.

## Identity rule
There is no "closest" or similar-car fallback. If the requested ID cannot be found in the stock endpoint, `/api/read-car` returns an error instead of constructing a different vehicle.
