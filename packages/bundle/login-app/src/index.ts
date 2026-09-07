/**
 * @deepseek-ai/dsh-login-app — the terminal surface of the authorization seam.
 *
 * `ctx.authorization` owns the conversation with the human but ships no
 * surface, and every other shipped app is either a model runner or a browser
 * host, so a provider that registers a flow (pi-ai's Claude Pro/Max and Codex
 * OAuth logins) has nowhere to be signed in from. This runner is that place:
 * it renders one attempt's notices and questions on the terminal, then exits.
 *
 * It stores nothing itself. The flow commits the grant through the credential
 * store mounted by the profile, which is the same document every other profile
 * reads, so signing in here is what makes the route usable in the Web GUI.
 *
 * @module @deepseek-ai/dsh-login-app
 */

import { createInterface } from 'node:readline/promises'
import type { Interface as ReadlineInterface } from 'node:readline/promises'
import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { AppExit } from '@deepseek-ai/dsh-cmdline'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {
  AuthorizationEntry, AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization'
// The empty type imports carry the Context merges this runner reads through:
// the authorization service it drives, and the loader it awaits before asking
// which flows exist.
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/cordis-plugin-loader'

/** Stable Cordis plugin name. */
export const name = 'login-runner'

/** The seam this surface drives, and the command line naming which flow to run. */
export const inject = ['authorization', 'cmdlineArgs']

/**
 * The record scope every flow this surface can run writes under. Flows are
 * addressed by credential key, but a person signing in names a provider route
 * ("anthropic"), so the scope completes the key on their behalf.
 */
const PI_AI_SCOPE = 'llm-pi-ai'

/** The process streams this runner writes to; tests substitute captures. */
export const internals: { stdout: { write(chunk: string): unknown } } = { stdout: process.stdout }

/** Print one line to the runner's output stream. */
function line(text = ''): void {
  internals.stdout.write(`${text}\n`)
}

/**
 * Render one flow's notice. A device grant carries the page and the code
 * separately because the human needs both at once, so both get their own line
 * rather than being folded into the message.
 * @param notice - what the running flow reported.
 */
function renderNotice(notice: AuthorizationNotice): void {
  line(notice.message)
  if (notice.url !== undefined) line(`  ${notice.url}`)
  if (notice.code !== undefined) line(`  code: ${notice.code}`)
}

/**
 * The question text for one prompt, options included so a `select` can be
 * answered by typing an id.
 * @param prompt - what the flow asked.
 * @returns the text to put on the terminal.
 */
function questionText(prompt: AuthorizationPrompt): string {
  if (prompt.kind !== 'select') return `${prompt.message} `
  const options = prompt.options.map(option => `  ${option.id}  ${option.label}`).join('\n')
  return `${prompt.message}\n${options}\n> `
}

/**
 * The terminal interaction for one attempt.
 *
 * A prompt's own signal is honoured separately from the attempt's: the Claude
 * flow races a pasted code against its loopback callback, and the losing
 * question has to stop waiting on stdin when the browser wins. That withdrawal
 * rejects rather than answering, and deliberately not as a decline — the human
 * never said no.
 * @param readline - the terminal interface, created once per attempt.
 * @returns the interaction to hand to `authorization.begin`.
 */
function terminalInteraction(readline: ReadlineInterface): AuthorizationInteraction {
  return {
    notify: renderNotice,
    async prompt(prompt) {
      const answer = await readline.question(
        questionText(prompt),
        prompt.signal === undefined ? {} : { signal: prompt.signal },
      )
      return answer.trim()
    },
  }
}

/** Print every registered flow, so a bare invocation says what can be signed into. */
function listFlows(entries: readonly AuthorizationEntry[]): void {
  if (entries.length === 0) {
    line('No sign-in is available: this profile mounts no plugin that registers an authorization flow.')
    return
  }
  line('Sign in to one of these with `dsh --profile login <provider>`:')
  line()
  for (const entry of entries) {
    const methods = entry.methods.map(method => method.id).join(', ')
    line(`  ${entry.key.slice(entry.key.indexOf('/') + 1).padEnd(20)} ${entry.label}  [${methods}]`)
  }
}

/**
 * Run one attempt and request the matching exit code.
 * @param ctx - plugin context carrying the authorization seam.
 * @param provider - the provider route to sign in to, or undefined to list.
 * @param method - the method id to run, or undefined for the flow's first.
 * @param exit - the launcher's bounded exit request.
 */
async function run(
  ctx: Context,
  provider: string | undefined,
  method: string | undefined,
  exit: AppExit,
): Promise<void> {
  // Loader siblings mount concurrently: the provider plugin that registers the
  // flow may still be arriving, and an early `list()` would report nothing.
  await ctx.get('loader')?.await()
  const entries = ctx.authorization.list()
  if (provider === undefined) {
    listFlows(entries)
    exit(0)
    return
  }
  let key: CredentialKey
  try {
    key = credentialKey(PI_AI_SCOPE, provider)
  } catch {
    line(`"${provider}" is not a provider route this surface can address.`)
    listFlows(entries)
    exit(1)
    return
  }
  const entry = ctx.authorization.describe(key)
  if (entry === undefined) {
    line(`Nothing registers a sign-in for "${provider}".`)
    line()
    listFlows(entries)
    exit(1)
    return
  }
  line(`Signing in to ${entry.label}.`)
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const outcome = await ctx.authorization.begin({
      key,
      ...method === undefined ? {} : { method },
      interaction: terminalInteraction(readline),
    })
    line(outcome.status === 'authorized'
      ? `Signed in. The credential is stored as "${key}" and refreshes itself.`
      : 'Sign-in cancelled; nothing was stored.')
    exit(outcome.status === 'authorized' ? 0 : 1)
  } finally {
    readline.close()
  }
}

/**
 * This surface's command: which flow to run, and how.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function loginCommand(): Command {
  return new Command()
    .name('dsh --profile login')
    .description('Sign in to a provider through its registered authorization flow, then exit.')
    .helpOption('-h, --help', 'show this help')
    .argument('[provider]', 'the provider route to sign in to; omit to list what is available')
    .option('-m, --method <id>', 'which of the flow\'s methods to run (default: its first)')
    .addHelpText('after', `
Examples:
  dsh --profile login                  list every registered sign-in
  dsh --profile login anthropic        sign in to Claude Pro/Max
  dsh --profile login openai-codex     sign in to ChatGPT Codex
`)
}

/**
 * Mount the terminal sign-in surface.
 * @param ctx - plugin context carrying the authorization seam, the command line, and the launcher's exit request.
 */
export function apply(ctx: Context): void {
  // Read through the global service store, not the property proxy: appExit is
  // an optional host value, never an injected dependency.
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('login-runner: the launcher must provide ctx.appExit before the tree mounts')
  }
  const program = loginCommand()
  program.action(() => {
    const [provider] = program.args
    const method = program.opts<{ method?: string }>().method
    void run(ctx, provider, method, exit).catch((error: unknown) => {
      line(`dsh: ${error instanceof Error ? error.message : String(error)}`)
      exit(1)
    })
  })
  parseCmdline(ctx, program)
}
