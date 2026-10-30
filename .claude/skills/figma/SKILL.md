---
name: figma
description: How to use the Figma file without wasting tokens (the file key, the node map of screens and components, which tools to call, reading a frame once and keeping what you learn in a spec). Use whenever a task needs the design, a screen's layout, a component's states, or an update to the Figma file.
---

# The Figma file

File key `v2ZGLbGmzZ7032V9AI5vWM` (https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM). The node map is in **docs/design/figma-map.md**; component specs already extracted are in **docs/design/components.md**. Read those first: most tasks never need to open Figma.

Pages: Cover `0:1`, Release screens `2:2` (the original design, never edited), **First release `99:3537`** (copies changed to the first release on 30 October 2026, plus the join sheet `107:1747`, the refused join sheet `107:2042`, the invite page `108:1818`, the host menu `110:1846` and Report `110:2119`), Design tokens `2:3`. For a first-release screen, open its frame on First release, not the original; every frame id is in the map.

The Figma predates the docs. **Where they differ, the docs and decisions.md win** (onboarding.md#changes-to-the-figma lists the known differences; the First release page already applies the first release's). For components and tokens, **the code is the source of truth** now: `mobile/src/theme/tokens.json` and the gallery.

## Cheap first, expensive last

1. **docs/design/** (specs, the map): free.
2. **`get_screenshot`** of one frame, at `maxDimension` 800 to 1200: a few thousand tokens. Enough to see a layout.
3. **`get_design_context`** of one component or screen frame: 5,000 to 20,000 tokens. Exact sizes, paddings and tokens. Load the `figma-design-to-code` guidance first (the `/figma-design-to-code` skill, or the MCP resource `skill://figma/figma-design-to-code/SKILL.md`), and pass `skillNames`.
4. **`get_variable_defs`** on a frame: all the variables it uses.
5. **Never `get_metadata` on a page**: the screens page alone returns about 125,000 characters. Call it on a section's "Screens" frame, and parse saved output with a script.

Always `create_session` with the file key first and pass its `sessionId` on every call.

## Read once, keep it

What you learn from a frame goes into a spec (docs/design/screens/<screen>.md, or docs/design/components.md for a component), with the node id, so nobody reads that frame again. Asset URLs from Figma expire in 7 days: download what you need into `mobile/assets/` straight away.

## Translating Figma's code

`get_design_context` returns React and Tailwind with CSS variables (`bg-[var(--color-bg-raised,#20232b)]`). Translate to our theme classes (`bg-bg-raised`), our `Text` variants (Figma style "Title/M" is `variant="title-m"`) and our components (a Figma "Button" instance is our `Button`). Letter spacing in Figma is a percentage of the font size; tokens.json already holds it in points. Raw values with no variable (marked raw in the specs) become a token first.

## Editing the Figma

Only when a task asks (e.g. M0.9). Load the `figma-use` skill first; `use_figma` runs plugin code against the file. Describe each edit in the pull request.
