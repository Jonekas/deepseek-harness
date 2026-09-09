# Agent Note: Complete Sidebar Thread Lists

Status: implemented

English | [中文](2026-09-09-complete-sidebar-thread-lists.zh.md)

## Problem

A five-row cap hides threads behind repeated Show more gestures. Users requesting a complete thread list do not need a second collapse mechanism inside an already collapsible Workspace.

## Decision

Open Workspace groups render all eligible Session rows, including New Session, without count truncation or Show more/Show less controls. Whole-Workspace collapse, flat browsing, ordering, search limits, and the separate collapsible Settled section remain unchanged. Scrolling handles lists taller than the sidebar.

This partially supersedes the folding decision in [Workspace Sidebar Order and Folding](../feature/2026-08-11-workspace-sidebar-order-and-folding.md); its durable ordering and browser-local view ownership remain active. Session drag anchors use the complete rendered group, without hidden-remainder placement rules.

## Alternatives considered

**Keep a larger cap or persist Show more.** Both retain a second visibility state and still hide rows after a threshold or reset, contrary to the requested complete list.

**Remove whole-Workspace collapse too.** That removes independent grouping navigation which is not part of the row-count restriction.

## Consequences

Every eligible thread is directly reachable by scrolling. Large open Workspaces mount more rows and can push other groups below the viewport; users can still collapse those groups. Reintroducing a cap requires a new user requirement rather than a silent performance optimization. No Session data or Host API changes.

## Verification

Component regressions cover lists beyond five rows, New Session becoming non-blank, group reopen, search reveal, and drag ordering. The owning Web scenario asserts the complete list without overflow buttons; scrollbar coverage retains the shared scroll container and Settled placement. Browser acceptance requires an authorized existing browser context or an isolated test host.
