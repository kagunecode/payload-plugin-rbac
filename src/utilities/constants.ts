import type { RbacOperation } from '../types.js'

export const COLLECTION_OPERATIONS: RbacOperation[] = ['create', 'read', 'update', 'delete']

export const GLOBAL_OPERATIONS: RbacOperation[] = ['read', 'update']

export const DEFAULT_ROLES_SLUG = 'roles'

export const DEFAULT_ROLES_FIELD_NAME = 'roles'

export const DEFAULT_SUPER_ADMIN_ROLE_NAME = 'Super Admin'

export const RBAC_CONTEXT_KEY = 'rbacPermissions'

export const RBAC_BYPASS_CONTEXT_KEY = 'rbacBypass'

export const INTERNAL_SLUG_PREFIX = 'payload-'
