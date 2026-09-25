import type { GovernedEntities, RbacConfig } from '../types.js'

import { COLLECTION_OPERATIONS, GLOBAL_OPERATIONS, INTERNAL_SLUG_PREFIX } from './constants.js'

type AvailableSlugs = {
  collections: string[]
  globals: string[]
}

type ForcedSlugs = {
  collections: string[]
}

export const getGovernedEntities = (
  available: AvailableSlugs,
  options: RbacConfig,
  forced: ForcedSlugs,
): GovernedEntities => {
  const include = options.collections
    ? new Set<string>([...forced.collections, ...options.collections])
    : null
  const exclude = new Set<string>(options.excludeCollections ?? [])
  const excludeGlobals = new Set<string>(options.excludeGlobals ?? [])
  const globalsOption = options.globals ?? true
  const includeGlobals = Array.isArray(globalsOption) ? new Set<string>(globalsOption) : null
  const isPublic = (slug: string) => !slug.startsWith(INTERNAL_SLUG_PREFIX)

  const collections = [...new Set(available.collections)]
    .filter(isPublic)
    .filter((slug) => (include ? include.has(slug) : true))
    .filter((slug) => !exclude.has(slug))
    .map((slug) => ({ slug, operations: [...COLLECTION_OPERATIONS] }))

  const globals =
    globalsOption === false
      ? []
      : [...new Set(available.globals)]
          .filter(isPublic)
          .filter((slug) => (includeGlobals ? includeGlobals.has(slug) : true))
          .filter((slug) => !excludeGlobals.has(slug))
          .map((slug) => ({ slug, operations: [...GLOBAL_OPERATIONS] }))

  return { collections, globals }
}
