# MZJ Showroom v42 — Centered Image Arrows Clean

Full clean rebuild of the showroom display/dashboard layer using the approved v42 presentation and the current MZJ vehicle + stock contracts as references.

## Vehicle identity
- Every screen document is independent: `showroom_screens/A1`, `showroom_screens/A2`, etc.
- The selected WordPress Post ID (`carId`) is the primary vehicle identity.
- The screen re-reads the exact vehicle by Post ID and verifies that the returned ID/URL did not change.
- Correct screen URLs are `/screen?id=A1`, `/screen?id=A2`, etc.
- Legacy malformed URLs such as `/screen?id/=A2` are accepted and normalized to `A2`.

## Vehicle page data
- Title, price, 1:1 gallery images, main specs, technical groups and the three feature groups are parsed from the exact MZJ single-vehicle page.
- Internal / external / safety feature lists are complete; there is no 8-item pagination or hidden slice.
- Long feature lists remain fully rendered inside a dedicated scrollable feature area.
- Main/technical duplicated scalar fields are removed from the technical view when the same value is already present in the main specs.

## Colors
- Available colors follow the current canonical NEXT/checkout color matrix exposed by the vehicle page.
- External colors include their displayed swatch/background and their exact color-gallery images.
- Internal colors include their displayed swatch/background.
- Dashboard color filtering uses those exact external color rows and images.

## Display design
- Square 1:1 image area with `object-fit: contain`.
- Large manual previous/next image arrows centered vertically on the left and right edges of the 1:1 vehicle image area, plus automatic image rotation.
- Compact price block.
- Visible available-color chips with name + swatch.
- Fixed “المواصفات الفنية” heading; technical content changes only when a technical tab is clicked.
- Interior / exterior / safety tabs use bold labels and change only when clicked.
- Dashboard-controlled logo, logo size/position and specification font size remain live across display pages.
- QR is generated from the exact selected vehicle permalink.

## Dashboard redesign
- Screen selector cards for A1–A10 with independent status/car labels.
- Searchable vehicle chooser.
- Exact selected-vehicle card, color control and image picker.
- Live iframe of the actual selected screen.
- Full vehicle inspector tabs: overview, technical, interior, exterior, safety, colors and images.
- Save affects only the currently selected screen document.

## Validation performed
- Node syntax checks for API, dashboard, screen and export scripts.
- Canonical parser fixture test with 25 interior, 12 exterior and 14 safety items (all retained).
- Canonical color-matrix fixture test with external/internal swatches and color-specific images.
