---
description: "The dsh terminal sign-in bundle: run one registered authorization flow from a terminal and exit; for users signing a provider subscription into the harness."
kind: "package-reference"
---

# @deepseek-ai/dsh-login-app

## Summary

`@deepseek-ai/dsh-login-app` is the terminal surface of the authorization seam. `ctx.authorization` owns the conversation that obtains a credential configuration cannot supply, and `@deepseek-ai/dsh-llm-pi-ai` registers one flow per installed provider that ships a login — but every other shipped app is a model runner or a browser host, so nothing in the box could start an attempt. This bundle mounts the seam over `dsh-base` and renders one attempt on the terminal: it prints the flow's notices, asks its questions on stdin, and exits with the outcome. It stores nothing itself; the flow commits the grant through the profile's credential store, which is the same document every other profile reads.

## Use this package

Create a profile whose `dsh.profile.bundles` are `@deepseek-ai/dsh-base` and this package, then run it.

```sh
dsh --profile login                  # list every registered sign-in
dsh --profile login anthropic        # sign in to Claude Pro/Max
dsh --profile login openai-codex     # sign in to ChatGPT Codex
dsh --profile login anthropic -m api-key   # run a named method instead of the flow's first
```

A provider argument names a pi-ai route, which this surface completes into the `llm-pi-ai/<route>` credential key. An unknown route, or one no flow claims, prints the available list and exits non-zero.

### What a sign-in produces

The provider library writes the grant — refresh token included — through `ctx.credentials`, so `$DSH_HOME/.credentials.yaml` gains one record and later requests refresh it under the store's cross-process lock. Making the route usable is then a settings change, not another login: add the route under the `llm-pi-ai:` section with no `apiKeyEnv`, and the stored sign-in authenticates it.

### Cancelling

Ctrl-C ends the process. A flow that races a pasted code against its own loopback callback withdraws the losing question through the prompt's signal, so the terminal stops waiting on stdin as soon as the browser completes the exchange.

## Known Limitations and Deferred Work

- **One attempt per invocation** — the runner signs in to exactly one provider and exits; signing in to several means running it several times.
- **No browser is opened** — the flow's URL is printed for the human to open, which is what keeps the surface usable over SSH.
- **Terminal only** — the Web GUI has no sign-in control; adding one means a Remote namespace over the same seam, which this bundle deliberately does not provide.
