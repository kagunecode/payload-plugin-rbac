import type { CollectionSlug, PayloadRequest, TypedUser } from 'payload'

import type { PermissionMatrix, ResolvedPermissions, SanitizedRbacConfig } from '../types.js'
import type { ID } from '../utilities/ids.js'

import { RBAC_CONTEXT_KEY } from '../utilities/constants.js'
import { getRbacRuntime } from '../utilities/getRbacConfig.js'
import { toIds } from '../utilities/ids.js'
import { emptyMatrix, mergeMatrices, sanitizeMatrix } from '../utilities/matrix.js'

type CachedPermissions = {
  permissions: ResolvedPermissions
  signature: string
}

export const noPermissions = (): ResolvedPermissions => ({
  grants: emptyMatrix(),
  hasRoles: false,
  isSuperAdmin: false,
})

export const isGovernedUser = (
  user: null | TypedUser | undefined,
  config: SanitizedRbacConfig,
): user is TypedUser => !!user && user.collection === config.usersCollection

export const getUserRoleIds = (user: TypedUser, config: SanitizedRbacConfig): ID[] =>
  toIds((user as unknown as Record<string, unknown>)[config.rolesFieldName])

export const resolvePermissions = async (req: PayloadRequest): Promise<ResolvedPermissions> => {
  const { config, entities } = getRbacRuntime(req.payload)
  const user = req.user

  if (!isGovernedUser(user, config)) {
    return noPermissions()
  }

  const roleIds = getUserRoleIds(user, config)
  const signature = `${String(user.id)}:${roleIds.join(',')}`
  const context = (req.context ??= {})
  const cached = context[RBAC_CONTEXT_KEY] as CachedPermissions | undefined

  if (cached && cached.signature === signature) {
    return cached.permissions
  }

  let permissions = noPermissions()

  if (roleIds.length > 0) {
    const { docs } = await req.payload.find({
      collection: config.rolesSlug as CollectionSlug,
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req,
      where: { id: { in: roleIds } },
    })

    const roles = docs as unknown as Array<{ isSuperAdmin?: boolean; permissions?: unknown }>

    permissions = {
      grants: mergeMatrices(
        roles.map((role): PermissionMatrix => sanitizeMatrix(role.permissions, entities)),
      ),
      hasRoles: roles.length > 0,
      isSuperAdmin: roles.some((role) => role.isSuperAdmin === true),
    }
  }

  context[RBAC_CONTEXT_KEY] = { permissions, signature } satisfies CachedPermissions

  return permissions
}
