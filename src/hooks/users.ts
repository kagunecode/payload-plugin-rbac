import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionSlug,
  PayloadRequest,
} from 'payload'

import { APIError } from 'payload'

import type { SanitizedRbacConfig } from '../types.js'
import type { ID } from '../utilities/ids.js'

import { isGovernedUser, resolvePermissions } from '../access/resolvePermissions.js'
import { isBypassed } from '../utilities/bypass.js'
import { getRbacRuntime } from '../utilities/getRbacConfig.js'
import { hasId, sameIds, toIds } from '../utilities/ids.js'
import { isSubsetOf, sanitizeMatrix } from '../utilities/matrix.js'
import {
  countSuperAdmins,
  ensureSuperAdminRole,
  findSuperAdminRoleIds,
} from '../utilities/superAdmin.js'

const assertCanChangeRoles = async (
  req: PayloadRequest,
  config: SanitizedRbacConfig,
  changedRoleIds: ID[],
): Promise<void> => {
  if (changedRoleIds.length === 0) {
    return
  }

  const permissions = await resolvePermissions(req)

  if (permissions.isSuperAdmin) {
    return
  }

  const { entities } = getRbacRuntime(req.payload)
  const { docs } = await req.payload.find({
    collection: config.rolesSlug as CollectionSlug,
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: { id: { in: changedRoleIds } },
  })

  for (const role of docs as unknown as Array<{
    isSuperAdmin?: boolean
    name?: string
    permissions?: unknown
  }>) {
    if (role.isSuperAdmin) {
      throw new APIError('Only a Super Admin can assign or remove the Super Admin role.', 403)
    }

    if (!isSubsetOf(sanitizeMatrix(role.permissions, entities), permissions.grants)) {
      throw new APIError(
        `You cannot assign or remove the "${role.name ?? 'unknown'}" role because it grants permissions you do not have.`,
        403,
      )
    }
  }
}

const assertNotTouchingSuperAdmin = async (
  req: PayloadRequest,
  config: SanitizedRbacConfig,
  targetRoleIds: ID[],
): Promise<void> => {
  const permissions = await resolvePermissions(req)

  if (permissions.isSuperAdmin) {
    return
  }

  const superAdminRoleIds = await findSuperAdminRoleIds({ payload: req.payload, req })

  if (targetRoleIds.some((id) => hasId(superAdminRoleIds, id))) {
    throw new APIError('Only a Super Admin can modify or delete a Super Admin user.', 403)
  }
}

export const usersBeforeChange =
  (config: SanitizedRbacConfig): CollectionBeforeChangeHook =>
  async ({ context, data, operation, originalDoc, req }) => {
    if (operation === 'create') {
      const { docs } = await req.payload.find({
        collection: config.usersCollection as CollectionSlug,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        req,
        select: {},
      })

      if (docs.length === 0) {
        const superAdminRoleId = await ensureSuperAdminRole({ payload: req.payload, req })
        data[config.rolesFieldName] = toIds([
          ...toIds(data[config.rolesFieldName]),
          superAdminRoleId,
        ])
        return data
      }
    }

    if (isBypassed(req, context)) {
      return data
    }

    const governed = isGovernedUser(req.user, config)
    const previousRoleIds = toIds(originalDoc?.[config.rolesFieldName])

    if (governed && operation === 'update') {
      await assertNotTouchingSuperAdmin(req, config, previousRoleIds)
    }

    if (data[config.rolesFieldName] === undefined) {
      return data
    }

    const nextRoleIds = toIds(data[config.rolesFieldName])

    if (sameIds(previousRoleIds, nextRoleIds)) {
      return data
    }

    if (governed) {
      await assertCanChangeRoles(req, config, [
        ...nextRoleIds.filter((id) => !hasId(previousRoleIds, id)),
        ...previousRoleIds.filter((id) => !hasId(nextRoleIds, id)),
      ])
    }

    if (operation === 'update' && originalDoc) {
      const superAdminRoleIds = await findSuperAdminRoleIds({ payload: req.payload, req })
      const losesSuperAdmin =
        previousRoleIds.some((id) => hasId(superAdminRoleIds, id)) &&
        !nextRoleIds.some((id) => hasId(superAdminRoleIds, id))

      if (
        losesSuperAdmin &&
        (await countSuperAdmins({ excludeUserId: originalDoc.id, payload: req.payload, req })) === 0
      ) {
        throw new APIError('At least one user must keep the Super Admin role.', 400)
      }
    }

    return data
  }

export const usersBeforeDelete =
  (config: SanitizedRbacConfig): CollectionBeforeDeleteHook =>
  async ({ id, context, req }) => {
    if (isBypassed(req, context)) {
      return
    }

    const target = await req.payload.findByID({
      id,
      collection: config.usersCollection as CollectionSlug,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })

    if (!target) {
      return
    }

    const targetRoleIds = toIds(
      (target as unknown as Record<string, unknown>)[config.rolesFieldName],
    )

    if (isGovernedUser(req.user, config)) {
      await assertNotTouchingSuperAdmin(req, config, targetRoleIds)
    }

    const superAdminRoleIds = await findSuperAdminRoleIds({ payload: req.payload, req })

    if (
      targetRoleIds.some((roleId) => hasId(superAdminRoleIds, roleId)) &&
      (await countSuperAdmins({ excludeUserId: id, payload: req.payload, req })) === 0
    ) {
      throw new APIError('The last Super Admin cannot be deleted.', 400)
    }
  }
