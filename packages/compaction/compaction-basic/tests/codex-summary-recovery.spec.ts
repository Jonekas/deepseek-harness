import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import { createUserMessage, LlmAdapter, LlmError, CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { mapStopReason } from '@deepseek-ai/dsh-llm-pi-ai/src/stream.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

/** External responses are fixtures; Codex terminal classification stays real. */
class CodexSummaryAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider, id: model, name: model, context: { contextWindow: 272_000 },
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      throw new LlmError('provider confirmed context overflow', CONTEXT_WINDOW_EXCEEDED_CODE)
    }
    const summary = options.purpose === 'compaction'
    const text = summary ? 'RECOVERED CHECKPOINT' : 'continued after compaction'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield {
      type: 'finish',
      reason: mapStopReason({
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-6-astra',
        content: [{ type: 'text', text }],
        stopReason: 'stop',
        timestamp: 0,
        usage: {
          input: summary ? 7_016 : 100,
          cacheRead: summary ? 392_000 : 0,
          output: 20,
          cacheWrite: 0,
          totalTokens: summary ? 399_036 : 120,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }, 272_000),
    }
  }
}

describe('Codex successful summary above catalog capacity', () => {
  it('lands the checkpoint and retries the original step instead of failing compaction', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(TokenMeter)
    const adapter = new CodexSummaryAdapter()
    ctx.llm.registerAdapter(['openai-codex'], adapter)
    await ctx.plugin(BasicCompactionEngine, {
      thresholdRatio: 1,
      retainTokens: 100,
      maxTokens: 8_192,
      compactionRetries: 0,
      maxOverflowRetries: 1,
    })

    try {
      const seed = Session.create(SessionId('codex-summary-history'))
      seed.append('turn/start', { turn: 1 })
      seed.append('user/message', createUserMessage({
        content: [{ type: 'text', text: `OLD HISTORY SENTINEL ${'historical detail '.repeat(500)}` }],
        source: { kind: 'user' },
      }), { surfaceOp: 'append' })
      seed.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      const { agent } = await ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId('codex-summary-recovery'),
        seed: seed.snapshotEvents(),
        agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra' },
      })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'continue from history' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expect(adapter.requests).toHaveLength(3)
      expect(adapter.requests[1]?.purpose).toBe('compaction')
      expect(JSON.stringify(adapter.requests[1]?.messages)).toContain('OLD HISTORY SENTINEL')
      expect(JSON.stringify(adapter.requests[2]?.messages)).toContain('RECOVERED CHECKPOINT')
      expect(JSON.stringify(adapter.requests[2]?.messages)).not.toContain('OLD HISTORY SENTINEL')
      const events = agent.session.snapshotEvents()
      expect(events.filter(event => event.type === 'step/start')).toHaveLength(1)
      const compactionEnds = events.filter(event => event.type === 'compaction/end')
      expect(compactionEnds).toHaveLength(1)
      expect(compactionEnds[0]?.data.error).toBeUndefined()
      expect(events.filter(event =>
        event.type === 'compaction/start'
        || event.type === 'compaction/summary'
        || event.type === 'compaction/end'
        || event.type === 'turn/end',
      ).map(event => event.type === 'turn/end'
        ? { type: event.type, reason: event.data.reason }
        : { type: event.type })).toMatchInlineSnapshot(`
          [
            {
              "reason": {
                "kind": "completed",
              },
              "type": "turn/end",
            },
            {
              "type": "compaction/start",
            },
            {
              "type": "compaction/summary",
            },
            {
              "type": "compaction/end",
            },
            {
              "reason": {
                "kind": "completed",
              },
              "type": "turn/end",
            },
          ]
        `)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
