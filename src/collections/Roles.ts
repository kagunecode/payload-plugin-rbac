import type { Access, CollectionConfig } from 'payload'

import type {
  GovernedEntities,
  PermissionsMatrixClientProps,
  SanitizedRbacConfig,
} from '../types.js'

import { isGovernedUser, resolvePermissions } from '../access/resolvePermissions.js'
import { rolesBeforeChange, rolesBeforeDelete, rolesBeforeValidate } from '../hooks/roles.js'
import { emptyMatrix } from '../utilities/matrix.js'

export const PERMISSIONS_MATRIX_COMPONENT = '@crz-studio/payload-rbac/client#PermissionsMatrix'

const superAdminOnly =
  (config: SanitizedRbacConfig): Access =>
  async ({ req }) =>
    isGovernedUser(req.user, config) && (await resolvePermissions(req)).isSuperAdmin

const governedOnly =
  (config: SanitizedRbacConfig): Access =>
  ({ req }) =>
    isGovernedUser(req.user, config)

export const createRolesCollection = (
  config: SanitizedRbacConfig,
  entities: GovernedEntities,
): CollectionConfig => ({
  slug: config.rolesSlug,
  access: {
    create: superAdminOnly(config),
    delete: superAdminOnly(config),
    read: governedOnly(config),
    update: superAdminOnly(config),
  },
  admin: {
    defaultColumns: ['name', 'description', 'updatedAt'],
    description: 'Roles group permissions. Assign roles to users to control what they can do.',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'isSuperAdmin',
      type: 'checkbox',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        condition: (data) => data?.isSuperAdmin === true,
        description: 'This role bypasses every permission check.',
        position: 'sidebar',
        readOnly: true,
      },
      defaultValue: false,
      index: true,
      label: 'Super Admin',
    },
    {
      name: 'permissions',
      type: 'json',
      admin: {
        components: {
          Field: {
            clientProps: { entities } satisfies PermissionsMatrixClientProps,
            path: PERMISSIONS_MATRIX_COMPONENT,
          },
        },
      },
      defaultValue: emptyMatrix(),
      label: 'Permissions',
    },
  ],
  hooks: {
    beforeChange: [rolesBeforeChange(config, entities)],
    beforeDelete: [rolesBeforeDelete(config)],
    beforeValidate: [rolesBeforeValidate(entities)],
  },
  labels: {
    plural: 'Roles',
    singular: 'Role',
  },
})
