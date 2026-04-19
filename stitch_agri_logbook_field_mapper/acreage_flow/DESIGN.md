# Design System Strategy: The Precision Pastoral

## 1. Overview & Creative North Star
The "Creative North Star" for this design system is **The Precision Pastoral**. 

Traditional farm management software often feels cluttered and "heavy," bogged down by legacy data tables and rigid, gray-on-gray grids. We are moving in the opposite direction. This system is a high-end editorial approach to utility. It treats agricultural data with the same reverence as a luxury timepiece or a premium architecture journal. 

By leveraging intentional asymmetry, expansive white space ("Air"), and a sophisticated tonal layering system, we transform "tools" into "experiences." We break the "template" look by avoiding repetitive box-shadows and instead using **Tonal Islands**—distinct areas defined by subtle background shifts rather than harsh lines.

## 2. Colors & The Surface Philosophy
While the palette is grounded in the greens of the field and the ambers of the harvest, its application must be surgical.

### The "No-Line" Rule
Explicitly prohibit the use of 1px solid borders to define major sections. Standard "box" layouts are forbidden. Instead, boundaries must be defined by shifts in background tokens. 
*   **Base:** Start with `surface` (#f9f9ff).
*   **Sectioning:** Use `surface_container_low` (#f0f3ff) for large structural areas (like a sidebar or a content tray).
*   **Definition:** Use `surface_container_lowest` (#ffffff) for the actual cards or interactive zones to create a "lifted" feel without a shadow.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
1.  **Level 0 (Canvas):** `surface`
2.  **Level 1 (Section):** `surface_container_low`
3.  **Level 2 (Active Element):** `surface_container_lowest`
4.  **Level 3 (Popovers):** `surface_bright` with a glass effect.

### The "Glass & Gradient" Rule
To elevate the system from "clean" to "premium," use **Glassmorphism** for floating elements (modals, tooltips, or mobile navigation bars). Use `surface_container_lowest` at 80% opacity with a 12px backdrop blur. 
*   **Signature Textures:** For primary CTA buttons or "Verified" hero states, do not use flat green. Use a subtle linear gradient from `primary` (#006c49) to `primary_container` (#10b981) at a 135-degree angle. This adds a "jewel-toned" depth that feels high-end.

## 3. Typography: The Editorial Scale
We use **Inter** to achieve a "functional tool" feel, but we apply it with an editorial hierarchy.

*   **Display & Headline:** Use `display-md` and `headline-lg` sparingly to celebrate high-level data (e.g., Total Acreage Yield). These should be tracked slightly tighter (-0.02em) to look like a premium magazine header.
*   **Body:** `body-md` is your workhorse. Ensure a line height of at least 1.5 to maintain the "airy" feel.
*   **Labels:** Use `label-md` in all-caps with +0.05em letter spacing for metadata (e.g., "SOIL PH" or "LAST INSPECTED") to provide an authoritative, technical aesthetic.

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than traditional structural lines.

*   **The Layering Principle:** Avoid shadows on static cards. A `surface_container_lowest` card sitting on a `surface_container_low` background provides enough contrast.
*   **Ambient Shadows:** For floating elements (menus, modals), use a custom shadow: `0px 12px 32px -4px rgba(21, 28, 39, 0.06)`. Note the color: we are using a tint of `on_surface` (#151c27) rather than pure black, ensuring the shadow feels like a natural part of the atmosphere.
*   **The "Ghost Border" Fallback:** If accessibility requires a border (e.g., high-contrast mode or input focus), use the `outline_variant` token at 20% opacity. Never use 100% opaque borders for decorative containment.

## 5. Components

### Cards & Lists
*   **Rule:** Forbid divider lines. 
*   **Implementation:** Separate list items using vertical white space (16px or 24px). For card groupings, use a `surface_container_low` background "wrapper" around `surface_container_lowest` cards.

### Buttons
*   **Primary:** Gradient of `primary` to `primary_container`. 12px corner radius.
*   **Secondary:** Ghost style. No background, `on_surface` text, and an `outline_variant` ghost border (20% opacity).
*   **Status Chips:** Use `primary_fixed` for "Verified," `secondary_fixed` for "Needs Review," and `tertiary_fixed` for "Conflicts." Text should always be the corresponding `on_fixed` variant for maximum legibility.

### Input Fields
*   Use `surface_container_lowest` with a subtle 1px `outline_variant` (20% opacity). On focus, the border should transition to `primary` (#006c49) and a 4px soft glow using the `primary_fixed` color at 30% opacity.

### Specific Agricultural Components
*   **Yield Gauges:** Use a "Thin Stroke" aesthetic. A large circular track in `surface_variant` with a `primary` gradient progress bar.
*   **Field Health Map:** Overlays should use the **Glassmorphism** rule to ensure the satellite imagery remains visible beneath the data modules.

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Align high-level stats to the left and secondary actions to the far right, leaving a "void" in the center to reduce cognitive load.
*   **Use Tonal Shifts:** If a screen feels flat, change the background of a section to `surface_container_low` instead of adding a border.
*   **Prioritize Readability:** In "Tool-like" views, use `body-sm` for secondary data to keep the interface compact but legible.

### Don't:
*   **No "Box-in-a-Box":** Avoid nesting a card with a shadow inside another card with a shadow. 
*   **No Default Grays:** Never use #808080 or #333333. Always use the provided `on_surface_variant` or `outline` tokens, which are tinted to match the system's blue-green undertones.
*   **No Crowding:** If you think a section needs more information, it probably needs more white space instead. Let the data breathe.