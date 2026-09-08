import { describe, expect, it } from 'vitest'
import { assertServiceable, Config } from '../src/config.ts'

/** Parse a hand-declared gateway through the production configuration schema. */
function gateway(compat: Record<string, unknown>, modelLevel = false): Config {
  return Config({
    providers: {
      'acme-gateway': {
        api: 'openai-completions',
        baseURL: 'https://acme.test',
        models: [{ id: 'm', ...(modelLevel ? { compat } : {}) }],
        ...(modelLevel ? {} : { compat }),
      },
    },
  })
}

describe('pi-ai catalog drift classification', () => {
  it.each(['chatTemplateKwargs', 'chatTemplateArgs'] as const)('accepts thinking.budget in %s', (field) => {
    const config = gateway({ [field]: { budget: { $var: 'thinking.budget' } } })
    expect(config.providers?.['acme-gateway']?.compat?.[field])
      .toEqual({ budget: { $var: 'thinking.budget' } })
    expect(() => { assertServiceable(config) }).not.toThrow()
    expect(() => gateway({ [field]: { budget: { $var: 'thinking.unknown' } } })).toThrow()
  })

  it.each([
    ['thinkingTokenBudgetField', 'thinking_budget'],
    ['vllmPriority', 1],
    ['supportsMaxOutputTokens', false],
    ['supportsMidConvoEffort', true],
    ['allowedFallbackModels', []],
  ] as const)('refuses withheld %s at route and model configuration sites', (field, value) => {
    for (const modelLevel of [false, true]) {
      expect(() => { assertServiceable(gateway({ [field]: value }, modelLevel)) })
        .toThrow(`compat "${field}", which is not configurable here`)
    }
  })
})
