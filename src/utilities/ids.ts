export type ID = number | string

type RelationValue = { id?: ID | null } | ID | null | undefined

export const toId = (value: RelationValue): ID | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object') {
    return value.id ?? null
  }

  return value
}

export const hasId = (list: ID[], id: ID): boolean =>
  list.some((candidate) => String(candidate) === String(id))

export const toIds = (value: unknown): ID[] => {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const result: ID[] = []

  for (const item of list) {
    const id = toId(item as RelationValue)

    if (id !== null && id !== '' && !hasId(result, id)) {
      result.push(id)
    }
  }

  return result
}

export const sameIds = (a: ID[], b: ID[]): boolean =>
  a.length === b.length && a.every((id) => hasId(b, id))
