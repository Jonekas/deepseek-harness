# Agent Note: Session deletion — retained removal with a subagent cascade

Status: implemented

English | [中文](2026-09-07-session-deletion.zh.md)

## Problem

Nothing in the harness could delete a Session. `SessionPersistence` exposed create, open, flush, stat, and list; the Workspace registry could hide a Session behind its archive set but never drop it; and the browser offered rename, fork, and settle. A Session the operator was certain they would never need again stayed on disk forever, and the only recourse was finding its directory by hand.

Settling made this sharper rather than softer: once threads can be set aside, the set-aside pile is exactly where finished work accumulates, and some of it is worth removing outright.

## Decision

Deletion is a first-class Session operation from the row menu, behind a destructive-styled confirmation, and it removes the stored log rather than hiding it.

- **`SessionPersistence.delete(id)`** joins the capability seam: afterwards `stat` reports the Session absent, `list` omits it, and `open` raises not-found. The contract permits a backend to retain the removed bytes out of band but promises nothing about their lifetime, so callers must treat a resolved delete as permanent.
- **The JSONL backend deletes by renaming** the Session's directory into a reserved `_trash` area under the root. One atomic rename inside a single root means a Session is either addressable or retained, never the half-erased state a recursive remove can leave behind. `projectKey` always wraps its slug in `--`, so the reserved name cannot collide with a project directory; listing skips it by name, without which every deleted Session would reappear as a project.
- **Retention is a recovery affordance, not a feature.** A configurable `trashRetentionDays` (default 30) bounds it, and each delete opportunistically discards expired entries. An entry whose name this build cannot parse is never reclaimed — an operator's own copy is not the backend's to delete.
- **Write ownership is claimed for the rename**, which both rejects a delete under a live writer with `SessionAlreadyOwnedError` and stops one opening mid-move.
- **Subagent descendants travel with the parent.** They are Sessions with their own logs that no surface lists once their parent is gone, so leaving them would leak unreachable data forever. Lineage is read from stored headers, so descendants that were never live in this process are included, and a malformed cycle cannot spin the walk.
- **Fork children never travel.** A fork copies the events it inherited into its own artifact, so deleting either side leaves the other complete. A surviving header may name a parent that no longer exists, which readers already tolerate.
- **The whole set is refused before any of it is touched** when the Session or a descendant is running; a partially deleted lineage is worse than a refused one.
- **`ApiSessionAgentController` now retains the `AgentHandle`s it creates.** It previously took `.agent` and dropped the disposer, so a Session opened in the browser stayed live for the process's whole life with no way to release it — and persistence refuses to delete under a live writer. `releaseSession` is the one consumer.
- **`WorkspaceRegistry.forgetSession`** drops the accounting slot and archive-set membership together. Unlike archiving it never consults persistence: the caller is removing the Session, so a listing that no longer names it is expected rather than a fault.
- **The browser confirms first.** The dialog names the Session, states that subagent sessions go with it and forks are kept, and says the action cannot be undone from the app. A refusal stays on the dialog where the operator can act on it, unlike the console-only diagnostics the non-destructive row verbs use.

Coverage: persistence removal, absence reporting, refusal under a live writer, retention placement, purge windows, and the fork-survival property; the confirmation gate, refusal surfacing, and the disabled verbs on a working row.

## Alternatives considered

- **Permanent removal with no retention.** The operator's words were "removed completely", and this was the first choice offered. Rejected in favour of retention because new deletion code is exactly where a bug is unrecoverable, and a rename into `_trash` costs nothing while making every mistake in the first release recoverable by hand.
- **A recursive remove of the Session directory.** Rejected: `rm -rf` has no atomic point. A failure midway leaves a directory that still looks like a Session but no longer parses, which is worse than either outcome the rename produces.
- **Refusing to delete a live Session instead of releasing it.** Rejected once the api layer was found to keep every opened Session live forever: the rule would have meant a Session could never be deleted in the run that opened it.
- **Leaving subagent children in place.** Rejected: no surface lists them once the parent is gone, so they would accumulate unreachably. The dialog states the cascade instead of hiding it.
- **A GUI "Empty trash" control.** Deferred, not rejected. Age-based purging needs no surface and satisfies "purge separately"; an explicit control is a small addition if retention ever needs to be reclaimed on demand.
- **Deleting fork children with the parent.** Rejected on the evidence: a fork child is a complete, independently useful Session that the sidebar lists as a top-level row, and its log does not depend on its parent's.

## Consequences

- Deletion is the first operation in the harness that destroys durable Session data. The retention window is what makes that safe to ship, so shortening `trashRetentionDays` to `0` removes the safety net and should be a deliberate deployment choice.
- Retained bytes still occupy disk for the window. An operator reclaiming space immediately must empty `_trash` by hand.
- `ApiSessionAgentController` holding teardown capabilities changes Agent lifetime: releasing a Session now genuinely unwinds its scoped world. Any future consumer of `releaseSession` inherits that.
- A Session deleted while another process holds its write lock is refused only within this process's tracker; cross-process contention surfaces as the rename's own filesystem error rather than a typed refusal.
