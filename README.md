# MZJ Showroom v44 — Kiosk Image Compatibility Clean

This build is based on v43 and focuses on kiosk/physical-screen image compatibility.

## v44 changes
- Display images are loaded through the same-origin image proxy first.
- The proxy converts supported source formats (including WebP/AVIF) to standard JPEG using `sharp`.
- HTTP/mixed-content source image URLs are fetched server-side and returned over the showroom HTTPS origin.
- Direct original URL is retained only as a fallback if proxy conversion fails.
- Arrow sizes are responsive with `clamp()` instead of a fixed 62px size, reducing apparent zoom on lower-resolution / scaled kiosk browsers.
- Optional diagnostics: open `/screen?id=A1&debug=1` to show Screen ID, image count, viewport, DPR, viewport scale, and current source URL.
- No changes to vehicle ID, specifications, colors, QR, or per-screen independence logic.

## Deployment
`sharp` was added to dependencies and will be installed by the deployment platform.
