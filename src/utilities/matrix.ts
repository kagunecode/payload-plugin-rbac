import type {
  EntityType,
  GovernedEntities,
  OperationGrants,
  PermissionMatrix,
  RbacOperation,
} from '../types.js'

export const emptyMatrix = (): PermissionMatrix => ({ collections: {}, globals: {} })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseMatrixInput = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const sanitizeMatrix = (value: unknown, entities: GovernedEntities): PermissionMatrix => {
  const input = parseMatrixInput(value)
  const result = emptyMatrix()

  if (!isRecord(input)) {
    return result
  }

  for (const type of ['collections', 'globals'] as EntityType[]) {
    const section = input[type]

    if (!isRecord(section)) {
      continue
    }

    for (const entity of entities[type]) {
      const grants = section[entity.slug]

      if (!isRecord(grants)) {
        continue
      }

      const sanitized: OperationGrants = {}

      for (const operation of entity.operations) {
        if (grants[operation] === true) {
          sanitized[operation] = true
        }
      }

      if (Object.keys(sanitized).length > 0) {
        result[type][entity.slug] = sanitized
      }
    }
  }

  return result
}

export const mergeMatrices = (matrices: PermissionMatrix[]): PermissionMatrix => {
  const result = emptyMatrix()

  for (const matrix of matrices) {
    for (const type of ['collections', 'globals'] as EntityType[]) {
      for (const [slug, grants] of Object.entries(matrix[type] ?? {})) {
        const target = (result[type][slug] ??= {})

        for (const [operation, granted] of Object.entries(grants ?? {})) {
          if (granted === true) {
            target[operation as RbacOperation] = true
          }
        }
      }
    }
  }

  return result
}

export const isGranted = (
  matrix: PermissionMatrix,
  type: EntityType,
  slug: string,
  operation: RbacOperation,
): boolean => matrix[type]?.[slug]?.[operation] === true

export const listGrants = (
  matrix: PermissionMatrix,
): Array<{ operation: RbacOperation; slug: string; type: EntityType }> => {
  const result: Array<{ operation: RbacOperation; slug: string; type: EntityType }> = []

  for (const type of ['collections', 'globals'] as EntityType[]) {
    for (const [slug, grants] of Object.entries(matrix[type] ?? {})) {
      for (const [operation, granted] of Object.entries(grants ?? {})) {
        if (granted === true) {
          result.push({ slug, type, operation: operation as RbacOperation })
        }
      }
    }
  }

  return result
}

export const isSubsetOf = (candidate: PermissionMatrix, reference: PermissionMatrix): boolean =>
  listGrants(candidate).every(({ slug, type, operation }) =>
    isGranted(reference, type, slug, operation),
  )

export const diffGrants = (
  before: PermissionMatrix,
  after: PermissionMatrix,
): Array<{ operation: RbacOperation; slug: string; type: EntityType }> => {
  const beforeGrants = listGrants(before)
  const afterGrants = listGrants(after)
  const key = (grant: { operation: RbacOperation; slug: string; type: EntityType }) =>
    `${grant.type}:${grant.slug}:${grant.operation}`
  const beforeKeys = new Set(beforeGrants.map(key))
  const afterKeys = new Set(afterGrants.map(key))

  return [
    ...afterGrants.filter((grant) => !beforeKeys.has(key(grant))),
    ...beforeGrants.filter((grant) => !afterKeys.has(key(grant))),
  ]
}
