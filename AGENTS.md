# Agent guidance

## Graphify (prefer this first)

This repo uses **Graphify**. A built graph lives under `graphify-out/` (especially `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md`).

**Before broad codebase exploration** (how X works, what calls Y, where Z lives, architecture / relationships):

1. Prefer `graphify query "<question>"` (or `graphify explain` / `graphify path`) over scanning many files with grep/glob/subagents.
2. You may also read focused sections of `graphify-out/GRAPH_REPORT.md` when that answers the question.
3. Only fall back to wide file search when Graphify has no useful hit, the graph looks stale, or the task needs exact current source text.
4. If the user asks to refresh the map, run `/graphify` / `graphify --update` as appropriate — don’t rebuild unless needed.

Goal: **save tokens** by asking the graph first instead of re-discovering the codebase every time.

## Dev log

After any meaningful change set (feature, fix, UX tweak, API behavior), append a short entry to **[DEV_LOG.md](./DEV_LOG.md)** (newest first): date · what · why/impact · key paths. Only log work that actually landed; do not invent history.

## Do not casually change UI/UX

Existing admin Control Center visuals are intentional product design. **Do not redesign, restyle, or “simplify” established patterns unless the user explicitly asks.**

When asked for responsive/compact work:
- Prefer layout tweaks (grid columns, padding, overflow) over inventing new chrome.
- Check git history / current screenshots before changing shared components.
- Preserve card borders, shadows, hover effects, and grouping that already exist.

## Admin UI

Admin surfaces under `/admin` must stay **mobile-first responsive** and **compact**, while keeping the established slate light/dark look.

### Established patterns (keep these)

- **Hub overview cards** (`AdminOverviewCard`): white `rounded-2xl` cards with icon, badge, title, arrow; hover lift/shadow/gradient. Hide **description** below `sm` and **badge/label** below `md`. Mobile hubs use `grid-cols-2`; `xl:grid-cols-3` when space allows. Put the primary **Workspace** card first when the hub has one.
- **Dashboard quick shortcuts**: same mobile `grid-cols-2` (then `xl:grid-cols-3`); hide shortcut descriptions below `sm`.
- **Metric cards** (`AdminMetricCard`): Albums / Published / Media are **separate individual cards** (border + white bg + shadow) in one `grid-cols-3` row — never merge into a single parent card unless explicitly requested.
- **Shell**: compact `AdminShell` / `AdminTopbar`; on mobile the control bar is **fixed at the bottom** for one-hand reach (desktop stays top); mobile menu via avatar sheet; **no mobile back button** unless requested.
- Prefer shared tokens in `modules/system/admin/settingsShared.js` and components under `components/admin/shared/*` before one-off styles.
- Avoid oversized `rounded-[28px]` admin cards and inventing new themes (no purple-on-white / cream-serif restyles).
- **No instructional helper copy.** Do not add “tap to open”, “switch sections”, “swipe to…”, or similar how-to lines. Labels, titles, and status text only. Put longer guidance in an existing `AdminHint` if it is already required — never as visible subtitle chrome.

### Responsive rules

- Design for ~375px; verify 375 / 768 / 1024.
- No page-level horizontal scroll. Wide tables may use `overflow-x-auto` + `min-w-0`.
- Touch targets ~44×44px for primary mobile controls.

### Gallery CMS

- Preserve Gallery’s mobile tabs, sticky actions, and sheets.
- Align density with admin tokens; do not replace the three-pane desktop CMS model.
- Keep Gallery compact: no extra helper sentences on workspace section cards, Drive picker rows, or import steps.
- **Album download only** — Public/admin gallery must not offer per-item media download; album ZIP is the supported path.
- **Web selection chrome** — When restyling selection actions on desktop/web, match the compact floating bar reference (count badge, album dropdown, icon actions) unless the user specifies otherwise.
