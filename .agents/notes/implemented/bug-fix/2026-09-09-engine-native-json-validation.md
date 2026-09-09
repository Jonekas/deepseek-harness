# Agent Note: Engine-native JSON validation

Status: implemented

English | [中文](2026-09-09-engine-native-json-validation.zh.md)

## Problem

Native function source formatting differs between JavaScript engines. Comparing an intrinsic constructor with a literal containing V8's formatting rejects ordinary Firefox objects. Assistant-stream expansion then rejects valid history, leaving the chat empty despite successful history requests.

## Decision

The [JSON validator](../../../../packages/util/values/src/index.ts) compares each candidate constructor's native source with the corresponding current-engine `Object` or `Array` constructor. Constructor-name and prototype-identity checks remain required. Cross-realm acceptance does not depend on V8's whitespace.

## Alternatives considered

**Normalize native-source whitespace.** Comparing with the current engine's constructor avoids defining a separate normalization rule while preserving exact-source comparison within that engine.

**Relax plain-container validation.** Removing constructor checks admits forged prototypes; engine compatibility does not require weakening that rejection.

## Consequences

Firefox history can pass the same lossless JSON checks as Chromium without changing stored sessions, RPC data, or authentication. The helper still assumes trusted same-process JavaScript intrinsics; this is not a new hostile-code isolation mechanism.

## Testing

The [JSON regression](../../../../packages/core/session/tests/json.spec.ts) covers multiline native representations for local and foreign-realm containers while retaining forged-constructor rejection. Live browser verification covers Firefox and Chromium initial history plus backward pagination. Node-only browser testing cannot substitute for exercising a second JavaScript engine.
