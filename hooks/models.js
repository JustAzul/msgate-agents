import { baseModelOf } from './agents.js'

// Which of a provider's models become agent types of their own. Pure: it reads
// the catalog the engine hands over and decides, and touches nothing else.
// What counts as a model worth a type is the provider's policy, so each
// provider has its own and the rest of the plugin never looks inside one.

const CODEX_SLUG = /^gpt-(\d+)(?:\.(\d+))?-([a-z][a-z0-9]*)$/
const CODEX_MIN_MAJOR = 6
// The visibility of a model the provider itself does not offer.
const CODEX_HIDDEN = 'hide'

// The bases that get a variant per model, and the families each one leaves out;
// the rest of the types stay on the model they were written for.
const CODEX_BASES = [
  { base: 'second-opinion', leavesOut: ['luna'] },
  { base: 'adhoc', leavesOut: [] },
]

function slugOf(id) {
  const match = typeof id === 'string' ? CODEX_SLUG.exec(id) : null
  return match === null ? null : { major: Number(match[1]), minor: Number(match[2] ?? 0), family: match[3] }
}

function variantName(base, id) {
  return base + '-' + id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

function isNewer(a, b) {
  return a.major !== b.major ? a.major > b.major : a.minor > b.minor
}

// newestPerFamily keeps, in catalog order, the models whose version no other
// model of their family beats.
function newestPerFamily(entries) {
  const newest = new Map()
  for (const entry of entries) {
    const held = newest.get(entry.slug.family)
    if (held === undefined || isNewer(entry.slug, held.slug)) newest.set(entry.slug.family, entry)
  }
  return entries.filter((entry) => newest.get(entry.slug.family) === entry)
}

function codexVariants(models) {
  const entries = models
    .filter((model) => model.visibility !== CODEX_HIDDEN)
    .map((model) => ({ model, slug: slugOf(model.id) }))
    .filter((entry) => entry.slug !== null && entry.slug.major >= CODEX_MIN_MAJOR)
  const newest = newestPerFamily(entries)
  return CODEX_BASES.flatMap(({ base, leavesOut }) =>
    newest
      .filter((entry) => !leavesOut.includes(entry.slug.family) && entry.model.id !== baseModelOf(base))
      .map((entry) => ({ base, name: variantName(base, entry.model.id), model: entry.model.id, purpose: base })),
  )
}

// The policy of each provider, by the name the catalog carries.
const POLICIES = { codex: codexVariants }

function isModel(value) {
  return typeof value === 'object' && value !== null && typeof value.id === 'string'
}

// modelVariants turns a catalog, `{ provider, models: [{ id, name, visibility }] }`,
// into the agent types to add: `{ base, name, model, purpose }`. A catalog of
// another shape is refused; a provider with no policy, or a model entry with no
// id, adds nothing.
export function modelVariants(catalog) {
  const isCatalog = typeof catalog === 'object' && catalog !== null && typeof catalog.provider === 'string' && Array.isArray(catalog.models)
  if (!isCatalog) throw new TypeError('the model catalog is not { provider, models: [...] }')
  if (!Object.hasOwn(POLICIES, catalog.provider)) return []
  return POLICIES[catalog.provider](catalog.models.filter(isModel))
}
