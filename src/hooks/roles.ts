import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'

import { APIError } from 'payload'

import type { GovernedEntities, SanitizedRbacConfig } from '../types.js'

import { isGovernedUser, resolvePermissions } from '../access/resolvePermissions.js'
import { isBypassed } from '../utilities/bypass.js'
import { diffGrants, emptyMatrix, isGranted, sanitizeMatrix } from '../utilities/matrix.js'

export const rolesBeforeValidate =
  (entities: GovernedEntities): CollectionBeforeValidateHook =>
  ({ data, originalDoc }) => {
    if (!data) {
      return data
    }

    if (data.permissions !== undefined || !originalDoc) {
      data.permissions = sanitizeMatrix(data.permissions, entities)
    }

    return data
  }

export const rolesBeforeChange =
  (config: SanitizedRbacConfig, entities: GovernedEntities): CollectionBeforeChangeHook =>
  async ({ context, data, operation, originalDoc, req }) => {
    if (operation === 'update' && originalDoc?.isSuperAdmin) {
      data.isSuperAdmin = true
      data.permissions = emptyMatrix()
    }

    if (isBypassed(req, context) || !isGovernedUser(req.user, config)) {
      return data
    }

    const permissions = await resolvePermissions(req)

    if (permissions.isSuperAdmin) {
      return data
    }

    if (originalDoc?.isSuperAdmin) {
      throw new APIError('Only a Super Admin can edit the Super Admin role.', 403)
    }

    if (data.permissions === undefined) {
      return data
    }

    const changes = diffGrants(
      sanitizeMatrix(originalDoc?.permissions, entities),
      sanitizeMatrix(data.permissions, entities),
    )
    const forbidden = changes.filter(
      ({ slug, type, operation: op }) => !isGranted(permissions.grants, type, slug, op),
    )

    if (forbidden.length > 0) {
      const list = forbidden.map(({ slug, operation: op }) => `${slug}.${op}`).join(', ')
      throw new APIError(`You cannot grant or revoke permissions you do not have: ${list}.`, 403)
    }

    return data
  }

export const rolesBeforeDelete =
  (config: SanitizedRbacConfig): CollectionBeforeDeleteHook =>
  async ({ id, context, req }) => {
    if (isBypassed(req, context)) {
      return
    }

    const role = await req.payload.findByID({
      id,
      collection: config.rolesSlug as CollectionSlug,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })

    if ((role as { isSuperAdmin?: boolean } | null)?.isSuperAdmin) {
      throw new APIError('The Super Admin role cannot be deleted.', 403)
    }
  }
