# Agent Note: Mobile Single-View Shell

Status: implemented

English | [中文](2026-09-09-mobile-single-view-shell.zh.md)

## Problem

The shell was three columns at every width. On a phone the collapsed 56px rail took width the reading column needed, the session list was unreachable without expanding a rail over the conversation, and the composer's trailing group — injected usage chips plus the model trigger — was `flex: none`, so its intrinsic width pushed the send control past the card's right edge. The same overflow appeared on a desktop window narrowed below roughly 750px. The transcript's content width also had an absolute 680px floor, so it stopped describing the column it sat in once the column was narrower than that.

## Decision

`MOBILE_MAX_WIDTH` (768px, the deepsuite MD breakpoint) is the width at or below which `AppFrame` stops being a column layout. The three occupants keep their tree positions and stay mounted; the sidebar and centre share one full-width grid cell, and the layout store's `mobileView` (`'list' | 'chat'`) decides which is visible. `visibility`, not `display`, hides the inactive view, so scroll offsets and drafts survive the switch. Below the breakpoint the right column can never take a track, the drag handles are not rendered, and the sidebar is never asked for its rail.

The frame owns the return path, because the list is no longer on screen beside the conversation: a 44px back bar carrying the session title renders in the conversation view only. Two signals open that view. Opening a *different* session is the navigation gesture, observed through `sessions.current`; the selection restored with the session list is recorded as the baseline instead, so a reload lands on the list. Re-picking the session that is already current changes no id, so a capture-phase click on the sidebar column treats a hit inside `[role="treeitem"][aria-selected]` — a session row, as distinct from a workspace group's `aria-expanded` row — as the same gesture.

The composer's `.trailing` group shrinks and wraps internally instead of refusing to, and `--dsh-chat-content-width`'s floor yields to a column narrower than itself.

Below the breakpoint the transcript is the scarce resource, so every other band pays for its height. The conversation header drops its breadcrumbs — squeezed they ellipsize to a single character, and the shell's own bar names the session — and tightens its padding, tab gap, and tab underline. The composer tightens its card gap and control-row padding and drops the docked draft to a one-line floor. The model trigger takes its icon-only form outright rather than waiting for the 360px container cut, because between the two cuts its full name fits the row but pushes the remaining controls onto another line. The stats strip under the composer is hidden: both pills ellipsize past their first word there. The back bar itself is one 40px touch row.

## Alternatives considered

**An overlay drawer over the conversation.** It keeps the conversation mounted and visible, but a phone reading a full-width transcript gains nothing from a half-covered list, and the drawer needs the same trigger control the back bar provides.

**A back control inside the conversation header.** The header's left seats are declared and occupied (`conversation.session.header.lineage`), and a floating control would sit over the breadcrumbs. Owning a bar in the frame keeps the change inside one package and recovers the session title the header drops at that width.

**Switching views on every `sessions.current` change, with no click signal.** It cannot see a re-pick of the current session, which strands the reader on the list.

**Fixing only the composer overflow.** It leaves the rail and the unreachable list, which is the phone complaint rather than a rendering defect.

**Leaving the phone chrome at its desktop density.** A single-view frame that spends 41% of a 844px screen on bars, header, composer, and a stats strip has not actually given the transcript the screen; the switch to one view is what makes the density question worth answering.

## Consequences

A frame narrow enough to refuse a normal right panel is now a mobile frame: above the breakpoint the collapsed rail always leaves the 300px a panel needs, so `canShow: false` is reached through the mobile floor rather than through `computeColumns`. The eligibility boundary the regressions pin moved from 756px to the breakpoint. `mobileView` survives crossing the breakpoint in either direction, so a desktop window resized down twice returns to the view its reader left. The click signal reads an ARIA relationship across packages; session rows losing `aria-selected` would degrade re-pick only, leaving ordinary session switching intact.

`ui-layout` now declares `@deepseek-ai/dsh-client-ui-primitives` as a development dependency for the back control's chevron; the package is a module-graph baseline external, so no request is added.

The density pass moves four packages' phone presentation together, so a change to one of those bands has to consider the others: on a 390x844 viewport the chrome fell from about 350px to 245px, and the visible transcript grew from roughly 490px to 600px. Two readings move behind a tap rather than disappearing — the model name (title and accessible name unchanged) and the composer's turn/token stats. The stats strip is hidden by the CSS rule alone, so `.root:has([data-composer-stats])` still sees it and the composer keeps its tightened bottom clearance.

## Verification

`ui-layout` component regressions cover the collapsed presentation and its owner params, restoration of the columns above the breakpoint, the restored-selection baseline against a `pending` then `ready` session list, the re-pick click against both row kinds, the bar's title and fallback, and the return to the list. The store regression pins the default view and that geometry actions never rewrite it. `pnpm run test:gui` is green, and the frame was exercised in a browser at 390/430px and at 769–1440px against a second `dsh web` instance, measuring the resulting band heights rather than reading them off a screenshot.
