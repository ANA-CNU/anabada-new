# Anabada design system

## 1. Atmosphere and identity

Preserve the existing community dashboard: bright surfaces, blue accents, compact rankings, and readable Korean content. Continuous exponent-4 squircle corners are the shared surface signature. This migration changes geometry only.

## 2. Color

`src/index.css` is the color source of truth. Preserve its background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart, and sidebar variables and their dark overrides. Existing page atmosphere, text treatments, controls, badges, charts, and score boards retain their visual effects. Only card and panel surface backgrounds replace gradients with the existing translucent single-color fill.

## 3. Typography

Preserve the existing system font stack and Tailwind type scale. Body, metadata, headings, and ranking numerals retain their current sizes, weights, line heights, and Korean wrapping behavior, except for the compact monthly-draw hierarchy: its title is 32px desktop / 24px mobile at weight 400; podium rank/name/stats are 28px (32px for first), 20px, and 14–15px at weight 400; compact rank/name/stats are 20px, 18px, and 14px at weight 400. Winner-card content is center-aligned, and names retain overflow wrapping.

## 4. Spacing and layout

Preserve the existing Tailwind spacing scale, responsive breakpoints, grids, flex sizing, and route layouts. SquircleSurface adds no layout wrapper. Scrollable panels use a separate inner scroll viewport; the surface itself must not own scrolling and an external focus ring simultaneously.

## 5. Components and corner taxonomy

| Token | Radius | Role |
| --- | --- | --- |
| compact | 10px | Small indicators and dense controls |
| control | 16px | Buttons, inputs, compact rows |
| surface | 28px | Cards, list rows, square icon holders |
| panel | 40px | Dialogs, sheets, larger panels |
| hero | 52px | Large featured surfaces |

The high-radius ladder above is the global corner contract: use the semantic token rather than compensating in individual components. Nested surfaces still choose the next smaller token where appropriate; check that their inset leaves a visibly coherent inner curve, and never make an inner surface rounder than its outer surface.

Use `SquircleSurface` from `@/components/ui/squircle`. Its default element is a div; `asChild` merges onto one semantic child, preserving its ref, events, ARIA, and data attributes. `radius` defaults to surface. `corners` supports all, left, right, top, bottom, and none; calendar range middles use none to remain square.

Use `ScoreReasonText` for score-history reasons wherever they are displayed: it preserves inherited compact text styling while rendering only `#<numeric problem id>` references as accessible external links with visible underline and keyboard focus.

Native CSS uses `corner-shape: squircle` and semantic radius variables. Unsupported browsers use `@lisse/core` 0.7.2 superellipse paths with exponent 4, explicitly avoiding Lisse's default Figma curve. `data-squircle-mode` reports native/fallback; `data-squircle-fallback` on the document root forces the fallback for browser QA. Our React SquircleSurface is the framework adapter over Lisse core. The upstream React package is not installed because its hook mutates data-state/data-slot and its wrapper changes layout. Shadow mask IDs use a module-local increasing counter, so they remain unique across mounted instances without requiring crypto.randomUUID on older Safari.

True circles (avatars, dots, spinners and circular glows), capsules (fully rounded pills), and geometry arrows are exceptions. Keep `rounded-full` only for these roles. Use `rounded-none` for intentionally square range middles. Any other radius exception requires a same-line `squircle-exception: <reason>` annotation reviewed with its consumer.

Nested surfaces choose the next smaller semantic radius where appropriate; the inner radius should approximate `max(0, outer radius - inset)`. Never increase a nested surface's radius beyond its outer surface. Prefer a square inner scroll viewport when it already sits within a shaped outer surface.

Page code must not import Lisse or write ordinary rounded utilities / inline borderRadius / CSS border-radius. The project adapter owns geometry. The non-React Kakao overlay adapter is the one approved additional Lisse consumer.

## 6. Motion and interaction

Keep existing hover, pressed, disabled, loading, and Radix open/closed states. Geometry never overwrites `data-state`. Monthly-draw cards use an outer, unclipped hover wrapper so their native and fallback shadow siblings scale together: only hover-capable fine pointers receive `transform: scale(1.03)` over 200ms, and `prefers-reduced-motion: reduce` disables both transform and transition. Resize updates are shared and frame-batched by Lisse. Respect the application's reduced-motion behavior.

## 7. Depth and surface effects

The monthly draw keeps the page background unboxed: its ranking cards sit directly on the existing atmosphere rather than inside a second panel. Those cards use the established `surface` squircle geometry and one `rgba(255,255,255,.045)` fill; medal distinction is limited to border and shadow. The shared flat gold crown raster is the only crown source, with CSS filters for silver and bronze variants.

Native borders, shadows, and focus rings remain CSS-owned. In fallback mode the element owns content and its clip path; Lisse draws borders and shadows in an unclipped SVG sibling on its parent. Border width is retained for layout, while only border paint and box-shadow are transferred. The adapter refreshes effects on focus, hover, state/class/style changes, and completed transitions.

Focus effects must be on the semantic focus target. Do not put `overflow-hidden` on its effect anchor or ancestors unless the focus target has sufficient inset. A parent that clips overflow must provide a separate interior viewport and room for focus indicators. Portalled overlays retain their Radix portal boundaries. Sibling effects copy the host transform, transform origin, opacity, and fixed positioning; active CSS animations refresh this coordinate system each frame. Prefer animating a containing element when possible.

A clip path also clips pseudo-element hit targets. Put expanded touch targets on an unclipped outer semantic control with a SquircleSurface visual child, or use actual padding instead of negative-inset pseudo elements.

## 8. Accessibility constraints and migration debt

Keyboard users must retain visible focus, semantic roles, label associations, tab order, and disabled behavior. Korean labels must remain readable at mobile/tablet/desktop widths. Decorative SVGs are hidden from assistive technology and pointer input.

Wave 1 intentionally reports existing corner usages with `npm run check:corners -- --baseline` (or `--report`). Wave 4 removes unapproved usages and enables the default strict check. Existing baseline lint failures are tracked by execution evidence, not waived as new design rules. Broad color, typography, performance, and dev-tool migrations are outside this geometry-only approved plan.
