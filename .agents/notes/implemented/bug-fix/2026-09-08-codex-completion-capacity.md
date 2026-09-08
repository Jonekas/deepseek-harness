# Agent Note: Preserve completed Codex responses above catalog capacity

Status: implemented

English | [中文](2026-09-08-codex-completion-capacity.zh.md)

## Problem

The pi-ai silent-overflow heuristic converts a successful `stop` into a context error when reported input plus cached input exceeds catalog capacity. Codex can return completed answers above that estimate. Rejecting those answers also rejects compaction summaries, leaving a long session unable to reduce its history despite successful provider responses.

## Decision

The pi-ai adapter omits the capacity argument to overflow classification only for `openai-codex-responses` messages ending in `stop`. Provider-declared errors, zero-output length overflow, and other protocols retain their existing classification. Empty Codex stops remain `EMPTY_RESPONSE` failures under the [empty completion policy](2026-07-24-empty-model-response-is-retryable.md).

[Exact-route capacity and compaction policy](../architecture/2026-07-20-routed-model-context-and-compaction-policy.md) remain unchanged: catalog metadata still drives proactive compaction. A successful request is not proof of a route's maximum supported context, so the fix does not increase configured capacity or rewrite stored sessions.

The installed pi-ai compatibility fields remain exhaustively classified so the adapter can be rebuilt against its declared dependency. `thinking.budget` joins the existing chat-template placeholders. `thinkingTokenBudgetField`, `vllmPriority`, `supportsMaxOutputTokens`, `supportsMidConvoEffort`, and `allowedFallbackModels` are withheld from generic configuration while installed catalog values remain inherited; no new provider control is enabled by default.

## Alternatives considered

**Raise the catalog limit.** A public API model limit does not establish the Codex subscription route's entitlement. Raising a guessed limit also leaves successful completion classification dependent on future catalog drift.

**Remove usage-based overflow detection globally.** Other protocols rely on the heuristic for silent truncation. The exception belongs to the protocol whose completed responses provide contrary evidence.

**Change compaction or the agent loop.** Both consume adapter finish reasons. Correctly classifying successful summaries permits existing compaction replacement and retry without introducing provider-specific logic there.

## Consequences

Completed Codex content can enter durable history and successful summaries can reduce it. Genuine provider rejection remains recoverable through the existing overflow path. The conservative catalog capacity may trigger early compaction; this change does not claim that every oversized request will succeed or detect silent server-side truncation from usage alone.

Regression coverage uses a completed Codex response with 399,016 input tokens against a 272,000-token catalog capacity, including cached usage, and preserves explicit overflow, empty-response, and zero-output length failures.
