# Agent Note: Settled sessions — a reversible archive with its own sidebar section

Status: implemented

English | [中文](2026-09-07-settled-sessions.zh.md)

## Problem

The registry-global archive set was a one-way door. `WorkspaceRegistry.archiveSession` had no inverse anywhere — not in the registry, the `workspace` Remote namespace, the Client Workspace Controller, or the browser — while the durable design already assumed one: an archived session keeps its `sessionIds` slot precisely so its position can be restored. Archiving also hid the row from every surface, so the only way to reach an archived session was content search, and `UiWorkspaceService` cleared the selection whenever the current session was a member of the set, which made an archived session impossible to keep open.

That left no way to say "I am not working on this right now" about a session. A long-running operator accumulates dozens of sessions per workspace, and the ones in flight are indistinguishable from the ones finished months ago.

## Decision

The archive set becomes the durable backing of a reversible, user-facing **Settled** state. The stored vocabulary stays `archived` — the domain field, the RPC value, and the snapshot key are unchanged, so no migration and no format bump — while every product-visible string reads Settle / Unsettle / Settled.

- **`WorkspaceRegistry.restoreSession`** removes one id from `archivedSessionIds` under the same `enqueueOperation` chain slot that serializes archiving. Set membership is the only precondition: an id in the set was proven known when it was archived, so restore performs no session lookup and cannot fail on a persistence-listing fault; an id outside the set resolves without writing. This asymmetry with `archiveSession` is deliberate — a storage fault must never strand a settled session.
- **`workspace/restoreSession`** carries it over the Remote namespace with its own `WorkspaceRestoreSessionRequest` and the shared `WorkspaceArchiveValue` reply, so both directions install a complete Host-confirmed set. `ClientWorkspaceModel.restoreSession` and `WorkspaceController.restoreSession` mirror the archive path exactly.
- **`deriveSettled`** in ui-workspace projects the set into rows, newest-first, excluding blank placeholders, subagent-born sessions, and ids the list projection has not delivered. It is disjoint from `deriveGroups` and `deriveFlat` by construction, since those exclude the same set.
- **The Settled section** renders below the scrolling list inside the sidebar's list seat, not inside it, so setting sessions aside costs the active list no height. It is collapsed by default, capped at a third of the column with its own scroll, and absent entirely when nothing is settled. Its expansion rides `groupExpansion` under the reserved `SETTLED_GROUP_KEY`; a new top-level store field would have read `undefined` from every persisted store written before it existed, because rehydration replaces state wholesale.
- **Settling is refused while a session is working** — a running turn, a waiting approval/plan-review/question, or a running subagent descendant disables the menu row rather than hiding live work behind a collapsed section.
- **Resuming a settled session unsettles it.** `UiWorkspaceService` watches the list projection and restores any archived session whose `updatedAt` advances, which the projection moves only on a user-authored durable message. Drafting, renaming, and subagent activity therefore leave a session settled; sending into it does not.
- **Settling the open session still clears the selection, but membership alone no longer does.** The policy now reads the transition — the id must be absent from the previously observed set — and only compares once the Workspace stream reports `phase: 'ready'`, since a pending snapshot reports an empty set for lack of data. This is what lets a settled session be opened from the section and stay open.

Coverage: registry restore semantics and its persistence-fault independence, controller and model round-trips including the `archived` follow increment, the derivation's ordering and exclusions, row-level refusal and the Settle/Unsettle swap, and browser-level settle → section → open → unsettle flows plus the search exclusion. `pnpm run test:gui` covers the client and host GUI packages.

## Alternatives considered

- **A separate `settled` state beside the archive set.** Rejected: two durable notions of "hidden from the list" would need reconciling in every derivation and in the navigation policy, and the archive set already carried the retained-position guarantee this feature needs. Archiving was one-way by omission, not by design.
- **Renaming `archived` to `settled` through the stack.** Rejected for now: it touches the durable domain field, the zod schema, the RPC value, the follow increment, and every consumer, for a vocabulary change that locale copy already delivers. Internal matching stays on the stable key; only the dictionaries speak Settled.
- **Unsettling on the first keystroke.** Rejected: a draft is not a resumption, and the list projection does not move `updatedAt` for one. Submission is the signal that the operator picked the thread back up.
- **Auto-unsettling when the row is opened.** Rejected: reading a settled session is exactly the case the section exists to serve. Opening it changes nothing until a message is sent.
- **Rendering the section inside the scrolling list.** Rejected: the section would then compete with the active list for height and scroll away from the bottom edge, where an infrequently used drawer belongs.
- **Keeping the startup clear-on-membership behavior.** It was the shipped behavior and had a test; it is incompatible with an openable settled row, because the clear would race the open on the next snapshot. The test now describes the transition rule instead.

## Consequences

- Archiving is no longer terminal, so the archive set is now a working surface rather than a graveyard: anything that grows it should expect the operator to come back through the Settled section.
- The selection policy depends on the Workspace stream's readiness. A consumer that publishes archive membership before a complete baseline would reintroduce the false settle-transition this change guards against.
- Restore is deliberately not exposed on `UiWorkspace`: it carries no navigation policy, so the browser reaches `ctx.workspaces` directly, while archiving keeps its selection-clearing wrapper.
- A settled session that a *subagent* or a schedule advances stays settled, because only user-authored durable messages move `updatedAt`. If scheduled work should surface its session, that is a separate decision about the same signal.
