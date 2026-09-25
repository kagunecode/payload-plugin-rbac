import type { CollectionSlug, GlobalSlug } from 'payload'

export type RbacOperation = 'create' | 'delete' | 'read' | 'update'

export type OperationGrants = Partial<Record<RbacOperation, boolean>>

export type PermissionMatrix = {
  collections: Record<string, OperationGrants>
  globals: Record<string, OperationGrants>
}

export type EntityType = 'collections' | 'globals'

export type GovernedEntity = {
  operations: RbacOperation[]
  slug: string
}

export type GovernedEntities = {
  collections: GovernedEntity[]
  globals: GovernedEntity[]
}

export type ResolvedPermissions = {
  grants: PermissionMatrix
  hasRoles: boolean
  isSuperAdmin: boolean
}

export type RbacConfig = {
  allowSelfManagement?: boolean
  collections?: CollectionSlug[]
  composeWithOriginalAccess?: boolean
  disabled?: boolean
  excludeCollections?: CollectionSlug[]
  excludeGlobals?: GlobalSlug[]
  globals?: boolean | GlobalSlug[]
  rolesSlug?: string
  superAdminRoleName?: string
  usersCollection?: CollectionSlug
}

export type SanitizedRbacConfig = {
  allowSelfManagement: boolean
  composeWithOriginalAccess: boolean
  disabled: boolean
  rolesFieldName: string
  rolesSlug: string
  superAdminRoleName: string
  usersCollection: string
}

export type PermissionsMatrixClientProps = {
  entities: GovernedEntities
}
