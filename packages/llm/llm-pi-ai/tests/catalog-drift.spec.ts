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

  // `thinkingTokenBudgetField`, `vllmPriority`, and `supportsMaxOutputTokens` were withheld
  // locally while this fork carried pi-ai ahead of the catalog that classified them; 0.1.5-alpha.1
  // offers all three, so only the vendor-owned Anthropic fields stay unconfigurable.
  it.each([
    ['supportsMidConvoEffort', true],
    ['allowedFallbackModels', []],
  ] as const)('refuses withheld %s at route and model configuration sites', (field, value) => {
    for (const modelLevel of [false, true]) {
      expect(() => { assertServiceable(gateway({ [field]: value }, modelLevel)) })
        .toThrow(`compat "${field}", which is not configurable here`)
    }
  })
})
