import type { Access, CollectionConfig, Config, GlobalConfig } from 'payload'

import type { RbacConfig, RbacOperation, SanitizedRbacConfig } from './types.js'

import { wrapAccess, wrapAdminAccess } from './access/wrapAccess.js'
import { createRolesCollection } from './collections/Roles.js'
import { createRolesField } from './fields/rolesField.js'
import { usersBeforeChange, usersBeforeDelete } from './hooks/users.js'
import { bootstrapRbac } from './utilities/bootstrap.js'
import {
  DEFAULT_ROLES_FIELD_NAME,
  DEFAULT_ROLES_SLUG,
  DEFAULT_SUPER_ADMIN_ROLE_NAME,
} from './utilities/constants.js'
import { getGovernedEntities } from './utilities/getGovernedEntities.js'

export { getPermissions, hasPermission, isSuperAdmin } from './access/helpers.js'
export type {
  EntityType,
  GovernedEntities,
  GovernedEntity,
  OperationGrants,
  PermissionMatrix,
  RbacConfig,
  RbacOperation,
  ResolvedPermissions,
} from './types.js'
export { RBAC_BYPASS_CONTEXT_KEY } from './utilities/constants.js'
export { seedRbac } from './utilities/superAdmin.js'
export type { SeedRbacResult } from './utilities/superAdmin.js'

const COLLECTION_ACCESS_MAP: Array<[keyof NonNullable<CollectionConfig['access']>, RbacOperation]> =
  [
    ['create', 'create'],
    ['read', 'read'],
    ['update', 'update'],
    ['delete', 'delete'],
    ['readVersions', 'read'],
    ['unlock', 'update'],
  ]

const GLOBAL_ACCESS_MAP: Array<[keyof NonNullable<GlobalConfig['access']>, RbacOperation]> = [
  ['read', 'read'],
  ['update', 'update'],
  ['readVersions', 'read'],
]

const sanitizeOptions = (options: RbacConfig, config: Config): SanitizedRbacConfig => ({
  allowSelfManagement: options.allowSelfManagement ?? true,
  composeWithOriginalAccess: options.composeWithOriginalAccess ?? false,
  disabled: options.disabled ?? false,
  rolesFieldName: DEFAULT_ROLES_FIELD_NAME,
  rolesSlug: options.rolesSlug ?? DEFAULT_ROLES_SLUG,
  superAdminRoleName: options.superAdminRoleName ?? DEFAULT_SUPER_ADMIN_ROLE_NAME,
  usersCollection: options.usersCollection ?? config.admin?.user ?? 'users',
})

const ensureUsersCollection = (collections: CollectionConfig[], slug: string): CollectionConfig => {
  const existing = collections.find((collection) => collection.slug === slug)

  if (existing) {
    if (!existing.auth) {
      throw new Error(`[rbac] The users collection "${slug}" must have auth enabled.`)
    }
    return existing
  }

  const created: CollectionConfig = {
    slug,
    admin: { useAsTitle: 'email' },
    auth: true,
    fields: [],
  }

  collections.push(created)

  return created
}

export const rbac =
  (options: RbacConfig = {}) =>
  (incomingConfig: Config): Config => {
    const collections = [...(incomingConfig.collections ?? [])]
    const config: Config = { ...incomingConfig, collections }
    const rbacConfig = sanitizeOptions(options, config)

    if (collections.some((collection) => collection.slug === rbacConfig.rolesSlug)) {
      throw new Error(`[rbac] A collection with the slug "${rbacConfig.rolesSlug}" already exists.`)
    }

    const usersCollection = ensureUsersCollection(collections, rbacConfig.usersCollection)

    if (
      usersCollection.fields.some(
        (field) => 'name' in field && field.name === rbacConfig.rolesFieldName,
      )
    ) {
      throw new Error(
        `[rbac] The "${rbacConfig.usersCollection}" collection already has a "${rbacConfig.rolesFieldName}" field.`,
      )
    }

    const entities = getGovernedEntities(
      {
        collections: [...collections.map(({ slug }) => slug), rbacConfig.rolesSlug],
        globals: (config.globals ?? []).map(({ slug }) => slug),
      },
      options,
      { collections: [rbacConfig.rolesSlug, rbacConfig.usersCollection] },
    )

    collections.push(createRolesCollection(rbacConfig, entities))
    usersCollection.fields = [...usersCollection.fields, createRolesField(rbacConfig)]
    config.custom = { ...config.custom, rbac: { config: rbacConfig, entities } }

    if (rbacConfig.disabled) {
      return config
    }

    usersCollection.hooks = {
      ...usersCollection.hooks,
      beforeChange: [...(usersCollection.hooks?.beforeChange ?? []), usersBeforeChange(rbacConfig)],
      beforeDelete: [...(usersCollection.hooks?.beforeDelete ?? []), usersBeforeDelete(rbacConfig)],
    }

    const governedCollections = new Set(entities.collections.map(({ slug }) => slug))
    const governedGlobals = new Set(entities.globals.map(({ slug }) => slug))

    config.collections = collections.map((collection) => {
      if (!governedCollections.has(collection.slug)) {
        return collection
      }

      const isPluginOwned = collection.slug === rbacConfig.rolesSlug
      const access: NonNullable<CollectionConfig['access']> = { ...collection.access }

      for (const [key, operation] of COLLECTION_ACCESS_MAP) {
        access[key] = wrapAccess({
          slug: collection.slug,
          type: 'collections',
          config: rbacConfig,
          operation,
          original: isPluginOwned ? undefined : (collection.access?.[key] as Access | undefined),
        }) as never
      }

      if (collection.slug === rbacConfig.usersCollection) {
        access.admin = wrapAdminAccess(rbacConfig, collection.access?.admin)
      }

      return { ...collection, access }
    })

    config.globals = (config.globals ?? []).map((global) => {
      if (!governedGlobals.has(global.slug)) {
        return global
      }

      const access: NonNullable<GlobalConfig['access']> = { ...global.access }

      for (const [key, operation] of GLOBAL_ACCESS_MAP) {
        access[key] = wrapAccess({
          slug: global.slug,
          type: 'globals',
          config: rbacConfig,
          operation,
          original: global.access?.[key],
        })
      }

      return { ...global, access }
    })

    const incomingOnInit = config.onInit

    config.onInit = async (payload) => {
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }

      await bootstrapRbac(payload)
    }

    return config
  }
