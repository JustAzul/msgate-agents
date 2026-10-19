import { expect, test } from 'claude-code/testing'
import { modelVariants } from '../hooks/models.js'

const listed = (...ids: string[]) => ids.map((id) => ({ id, name: id, visibility: 'list' }))
const catalog = (models: any[], provider = 'codex') => ({ provider, models })
const namesOf = (variants: any[]) => variants.map((v) => v.name)
const adhocNames = (variants: any[]) => namesOf(variants.filter((v) => v.base === 'adhoc'))

test('a model becomes an adhoc variant only when its id is gpt-<version>-<family> with version 6 or above', () => {
  const variants = modelVariants(catalog(listed('gpt-5.6-terra', 'gpt-6-astra', 'gpt-6.1-nova', 'gpt-7-aster', 'o3', 'gpt-6', 'gpt-6-', 'GPT-6-big', 'gpt-6.1.2-x')))

  expect(adhocNames(variants)).toEqual(['adhoc-gpt-6-astra', 'adhoc-gpt-6-1-nova', 'adhoc-gpt-7-aster'])
  expect(variants.filter((v) => v.base === 'adhoc')[1]).toEqual({ base: 'adhoc', name: 'adhoc-gpt-6-1-nova', model: 'gpt-6.1-nova', purpose: 'adhoc' })
})

test('of each family only the newest version gets a variant', () => {
  const variants = modelVariants(catalog(listed('gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.10-sol', 'gpt-6.2-sol')))

  expect(adhocNames(variants)).toEqual(['adhoc-gpt-6-astra', 'adhoc-gpt-6-10-sol'])
})

test('a hidden model gets no variant and does not shadow an older listed model of its family', () => {
  const models = [
    { id: 'gpt-6-astra', name: 'a', visibility: 'list' },
    { id: 'gpt-6.1-astra', name: 'a', visibility: 'hide' },
    { id: 'gpt-6-hidden', name: 'h', visibility: 'hide' },
  ]

  expect(adhocNames(modelVariants(catalog(models)))).toEqual(['adhoc-gpt-6-astra'])
})

test('the acceptance catalog yields second-opinion for gpt-6-astra and adhoc for the newest of each family, and nothing for the rest', () => {
  const models = [
    ...listed('gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'),
    { id: 'gpt-reserve', name: 'r', visibility: 'hide' },
    { id: 'codex-auto-review', name: 'c', visibility: 'hide' },
    { id: 'gpt-6-hidden', name: 'h', visibility: 'hide' },
  ]

  expect(namesOf(modelVariants(catalog(models)))).toEqual([
    'second-opinion-gpt-6-astra',
    'adhoc-gpt-6-1-sol',
    'adhoc-gpt-6-astra',
    'adhoc-gpt-6-luna',
  ])
})

test('another provider has no model policy and gets no variant', () => {
  expect(modelVariants(catalog(listed('gpt-6-astra'), 'other'))).toEqual([])
})

test('a catalog that is not { provider, models: [...] } is refused, and an entry with no usable id is passed over', () => {
  for (const bad of [null, undefined, 'x', [], {}, { provider: 'codex' }, { provider: 'codex', models: 'gpt-6-astra' }, { models: [] }]) {
    expect(() => modelVariants(bad as any)).toThrow('model catalog')
  }
  const models = [null, 'gpt-6-astra', { name: 'no id' }, { id: 7 }, ...listed('gpt-6-astra')]
  expect(adhocNames(modelVariants(catalog(models)))).toEqual(['adhoc-gpt-6-astra'])
})
