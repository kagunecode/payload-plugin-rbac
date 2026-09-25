import type { PayloadRequest } from 'payload'

import type { EntityType, RbacOperation, ResolvedPermissions } from '../types.js'

import { isGranted } from '../utilities/matrix.js'
import { resolvePermissions } from './resolvePermissions.js'

export const getPermissions = (req: PayloadRequest): Promise<ResolvedPermissions> =>
  resolvePermissions(req)

export const isSuperAdmin = async (req: PayloadRequest): Promise<boolean> =>
  (await resolvePermissions(req)).isSuperAdmin

export const hasPermission = async (
  req: PayloadRequest,
  slug: string,
  operation: RbacOperation,
  type: EntityType = 'collections',
): Promise<boolean> => {
  const permissions = await resolvePermissions(req)

  return permissions.isSuperAdmin || isGranted(permissions.grants, type, slug, operation)
}
