repo: xevrion/breakscale
branch: main

## Last sync
date: 2026-09-07T02:44:07Z

### Updated in this project
- Replaced the Twitter/Design.md token set in `IVR Builder v3.dc.html` with Breakscale's warm-paper system (ground `#faf7f3`, surfaces lighter than ground, cool-leaning ink, indigo accent, warm shadows) plus its dark theme.
- Adopted the six-step type scale (11/12/14/16/22/34), three weights (450/550/650), 4px spacing and the 6/8/10/14 radius scale; every number now renders mono with `tabular-nums`.
- Rebuilt IVR node identity on Breakscale's per-kind trio rule — one hue per node type, L and C fixed per role in OKLCH — so all 13 kinds carry equal visual weight.
- Added the live metrics strip under the canvas, a resizable inspector panel and a shortcuts sheet.

## Screen map
| Screen / part | Built from |
| --- | --- |
| Token set, light + dark themes | `src/index.css` (`:root`, `:root[data-theme='dark']`) |
| Type scale, spacing, radii, motion | `src/index.css` (foundation layer comment block) |
| Per-kind node colour trio (fill/line/stroke/ink) | `src/index.css` (per-kind colour system, `[data-kind]` mapping) |
| Status text vs mark split (warn = bronze) | `src/index.css` (semantic metric states) |
| Button bevel (lit top edge, shaded underside) | `src/index.css` (`--bevel`, `--bevel-under`, `--bevel-on-accent`) |
| Theme switch behaviour | `src/theme/applyTheme.ts` |
| Metrics strip (hero readout + secondary stats) | `src/components/Metrics.tsx`, `Metrics.css` |
| Resizable inspector panel | `src/components/PanelResizer.tsx` |
| Shortcuts sheet | `src/components/Shortcuts.tsx` |
| Palette chips coloured by kind | `src/components/Palette.tsx` |

## Notes
- Not adopted: Caveat handwriting font, annotation tone palette, glossary tooltip content.
- `commit:` omitted — only a tree hash was resolved this turn, not a commit sha.
