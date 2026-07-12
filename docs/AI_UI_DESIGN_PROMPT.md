# AI Gist Desktop UI Design Prompt

Use this document as a mandatory system prompt whenever creating or modifying AI Gist desktop or desktop-Web UI.

## Product intent

AI Gist is a local-first productivity tool. Its interface should feel calm, precise, durable, and easy to scan. Daily prompt use is more important than frequent editing or debugging. Keep complexity inside the implementation, not in the visible interface.

The desktop design language is **tinted surfaces with restrained boundary borders and no persistent shadows**. Do not introduce a second visual language.

## Required visual system

- Use `design-tokens.json` through the generated CSS variables. Never introduce page-local theme palettes.
- Page canvas: `var(--surface-body)`.
- Primary panel: `var(--surface-primary)` with `1px solid var(--border-default)` when it defines a distinct region.
- Nested or grouped content: prefer `var(--surface-secondary)` plus spacing or a separator. Add another enclosing border only when the nested region is independently actionable or needs a clear boundary.
- Selected surface: `var(--surface-tertiary)` without adding or strengthening a border. Selection is state, not a new container.
- Hover: normally change surface color. Strengthen a structural card border only when that card is itself the interaction target. Do not lift cards or add shadows.
- Shadows are allowed only for modals, drawers, dropdowns, popovers, tooltips, or active drag feedback. Use `--shadow-overlay` or `--shadow-popover`.
- Body text is 14px. Supporting text is 12–13px and never below 12px.
- Typography roles are fixed: body/control/menu/table cells 14px, labels and supporting copy 13px, metadata/captions 12px, section titles 16–18px, page titles 22px. Do not invent intermediate sizes.
- Desktop page padding is `--page-padding` (20px), ordinary content padding is `--content-padding` (16px), compact groups use `--compact-padding` (12px), and sibling sections use `--section-gap` (16px).
- Control radius is `--radius-control` (6px), panel/image radius is `--radius-panel` / `--radius-image` (8px), modal radius is `--radius-modal` (10px).
- Menu and control icons are 16px. Navigation icons may be 18–20px. Decorative empty-state icons may be larger.
- Primary color is reserved for primary actions, focus, links, and true status. Selection should normally use neutral surfaces and borders.

## Component rules

### Structural surfaces

- Prefer bordered Naive UI `NCard` for content groups.
- Use `.ui-surface` for custom structural containers and `.ui-surface-muted` for nested groups.
- Structural containers that define a region must not use transparent backgrounds. Avoid framing a child when its parent border already defines the same scope.
- Toolbars use `.ui-toolbar` or the same secondary surface plus border.

### Buttons and menus

- Use Naive UI buttons instead of custom button CSS whenever possible.
- One primary action per local context. Secondary actions use `secondary`, `tertiary`, or `quaternary` according to importance.
- Destructive actions use `type="error"`; require confirmation for irreversible data changes.
- Dropdown option icons must render through `NIcon` at 16px. A dropdown with only one action should be replaced by a direct icon button with a tooltip.

### Navigation and selection

- Selected rows, cards, tabs, and navigation items use a neutral tinted surface and, where useful, stronger text weight. They do not gain a selection border.
- Do not add horizontal padding or item margins to a collapsible `NMenu`: its `collapsed-width`, icon size, and internal 8px inset already determine the icon geometry. Apply only vertical spacing outside that calculation.
- Naive UI Menu paints hover and selection through `.n-menu-item-content::before`; configure these states with Menu theme overrides and do not add a second background to `.n-menu-item-content`.
- The desktop shell keeps ordinary interface copy unselectable with body-level `user-select: none` to prevent accidental selection. Native inputs, textareas, selects, contenteditable regions, and Naive UI's native input elements must explicitly retain `user-select: text`, focus, caret, and selection behavior.
- Do not use large blue blocks, gradients, glowing borders, scale animations, or “AI-style” selection treatments.
- Preserve the user’s current view when opening global create/edit/detail workflows.

### Cards, tables, and forms

- Cards use a visible border and no constant shadow. Hover may strengthen the border and change the background.
- Tables use a secondary-color header, primary-color rows, visible separators, and neutral hover.
- Form sections should be bordered panels. Do not remove borders from embedded editors.
- Keep labels concise, align related controls, and maintain 14px control text.

### Modals and overlays

- Reuse `CommonModal` or the established full-workspace modal shells.
- When using a raw `NModal` without a preset, its first rendered child must be a `div` or Naive UI `NCard`. Do not use semantic elements such as `section`, `main`, `article`, or `aside` as the modal content root: Naive UI 2.41's focus trap locates custom modal content by its rendered `DIV` root, and another tag can make editable controls immediately lose focus.
- Modal surfaces use `--surface-primary`, `--border-default`, `--radius-modal`, and `--shadow-overlay`.
- Modal headers and footers use `--surface-secondary` with a separator border.
- Protect unsaved edits before closing or changing workflow.

## Forbidden patterns

- New `--app-*`, `--text-color-*`, `--border-color-*`, or `--code-color` variables.
- Hard-coded light/dark theme colors in desktop components.
- Arbitrary border-radius or box-shadow values.
- Persistent shadows on cards, settings panels, tables, toolbars, or navigation.
- Structural `NCard` components with `bordered="false"`.
- Raw SVG menu icons without a sized `NIcon` wrapper.
- Page-local visual systems that override the shared tokens.

## Implementation checklist

Before editing:

1. Identify whether the element is canvas, primary panel, nested panel, control, or overlay.
2. Reuse a Naive UI component or shared semantic surface before writing custom CSS.
3. Verify both light and dark tokens will work without a page-specific media query.

Before finishing:

1. Check borders, surfaces, radii, icon sizes, typography, hover, focus, selected, disabled, loading, empty, error, and destructive states.
2. Test at 1024px, 1440px, and 1920px desktop widths.
3. Ensure global dialogs do not force a view change and unsaved-change protection still works.
4. Run ESLint, TypeScript, the design-system contract test, the full test suite, and both renderer/Web builds.

## Mobile boundary

Ionic mobile pages keep their native information architecture. They may reuse canonical color, typography, and radius tokens, but desktop Naive UI layout rules must not be imposed on Ionic components.
