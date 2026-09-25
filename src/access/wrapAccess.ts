import type { Access, AccessArgs, PayloadRequest, Where } from 'payload'

import type { EntityType, RbacOperation, SanitizedRbacConfig } from '../types.js'

import { isGranted } from '../utilities/matrix.js'
import { isGovernedUser, resolvePermissions } from './resolvePermissions.js'

type WrapAccessArgs = {
  config: SanitizedRbacConfig
  operation: RbacOperation
  original?: Access
  slug: string
  type: EntityType
}

type AdminAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

const selfWhere = (req: PayloadRequest): Where => ({ id: { equals: req.user?.id } })

export const wrapAccess =
  ({ slug, type, config, operation, original }: WrapAccessArgs): Access =>
  async (args: AccessArgs) => {
    const { req } = args

    if (!isGovernedUser(req.user, config)) {
      return original ? original(args) : false
    }

    const permissions = await resolvePermissions(req)

    if (permissions.isSuperAdmin) {
      return true
    }

    if (isGranted(permissions.grants, type, slug, operation)) {
      return config.composeWithOriginalAccess && original ? original(args) : true
    }

    const isSelfOperation =
      config.allowSelfManagement &&
      type === 'collections' &&
      slug === config.usersCollection &&
      (operation === 'read' || operation === 'update')

    return isSelfOperation ? selfWhere(req) : false
  }

export const wrapAdminAccess =
  (config: SanitizedRbacConfig, original?: AdminAccess): AdminAccess =>
  async (args) => {
    const { req } = args

    if (!isGovernedUser(req.user, config)) {
      return original ? original(args) : false
    }

    const permissions = await resolvePermissions(req)

    if (permissions.isSuperAdmin) {
      return true
    }

    if (!permissions.hasRoles) {
      return false
    }

    return original ? original(args) : true
  }
