import type { CollectionSlug, Field, FieldAccess } from 'payload'

import type { SanitizedRbacConfig } from '../types.js'

import { isGovernedUser, resolvePermissions } from '../access/resolvePermissions.js'
import { isGranted } from '../utilities/matrix.js'

const canWriteRoles =
  (config: SanitizedRbacConfig, operation: 'create' | 'update'): FieldAccess =>
  async ({ req }) => {
    if (!isGovernedUser(req.user, config)) {
      return false
    }

    const permissions = await resolvePermissions(req)

    return (
      permissions.isSuperAdmin ||
      isGranted(permissions.grants, 'collections', config.usersCollection, operation)
    )
  }

export const createRolesField = (config: SanitizedRbacConfig): Field => ({
  name: config.rolesFieldName,
  type: 'relationship',
  access: {
    create: canWriteRoles(config, 'create'),
    update: canWriteRoles(config, 'update'),
  },
  admin: {
    description: 'Permissions from every selected role are combined.',
    position: 'sidebar',
  },
  hasMany: true,
  index: true,
  label: 'Roles',
  relationTo: config.rolesSlug as CollectionSlug,
  saveToJWT: false,
})
