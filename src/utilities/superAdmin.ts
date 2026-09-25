import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type { ID } from './ids.js'

import { getRbacRuntime } from './getRbacConfig.js'
import { toIds } from './ids.js'
import { emptyMatrix } from './matrix.js'

type SeedArgs = {
  payload: Payload
  req?: Partial<PayloadRequest>
}

export const findSuperAdminRoleIds = async ({ payload, req }: SeedArgs): Promise<ID[]> => {
  const { config } = getRbacRuntime(payload)
  const { docs } = await payload.find({
    collection: config.rolesSlug as CollectionSlug,
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: { isSuperAdmin: { equals: true } },
  })

  return docs.map((doc) => doc.id)
}

export const ensureSuperAdminRole = async ({ payload, req }: SeedArgs): Promise<ID> => {
  const { config } = getRbacRuntime(payload)
  const [existing] = await findSuperAdminRoleIds({ payload, req })

  if (existing) {
    return existing
  }

  const role = await payload.create({
    collection: config.rolesSlug as CollectionSlug,
    data: {
      name: config.superAdminRoleName,
      description: 'Full access to every collection and global.',
      isSuperAdmin: true,
      permissions: emptyMatrix(),
    } as never,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return role.id
}

export const countSuperAdmins = async ({
  excludeUserId,
  payload,
  req,
}: { excludeUserId?: ID } & SeedArgs): Promise<number> => {
  const { config } = getRbacRuntime(payload)
  const roleIds = await findSuperAdminRoleIds({ payload, req })

  if (roleIds.length === 0) {
    return 0
  }

  const { totalDocs } = await payload.count({
    collection: config.usersCollection as CollectionSlug,
    overrideAccess: true,
    req,
    where: {
      and: [
        { [config.rolesFieldName]: { in: roleIds } },
        ...(excludeUserId === undefined ? [] : [{ id: { not_equals: excludeUserId } }]),
      ],
    },
  })

  return totalDocs
}

export type SeedRbacResult = {
  promotedUserId: null | string
  superAdminRoleId: null | string
}

export const seedRbac = async ({ payload, req }: SeedArgs): Promise<SeedRbacResult> => {
  const { config } = getRbacRuntime(payload)

  if ((await countSuperAdmins({ payload, req })) > 0) {
    const [superAdminRoleId] = await findSuperAdminRoleIds({ payload, req })
    return {
      promotedUserId: null,
      superAdminRoleId: superAdminRoleId === undefined ? null : String(superAdminRoleId),
    }
  }

  const { docs } = await payload.find({
    collection: config.usersCollection as CollectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    sort: 'createdAt',
  })

  const [firstUser] = docs

  if (!firstUser) {
    return { promotedUserId: null, superAdminRoleId: null }
  }

  const superAdminRoleId = await ensureSuperAdminRole({ payload, req })
  const currentRoles = toIds(
    (firstUser as unknown as Record<string, unknown>)[config.rolesFieldName],
  )

  await payload.update({
    id: firstUser.id,
    collection: config.usersCollection as CollectionSlug,
    context: { rbacBypass: true },
    data: { [config.rolesFieldName]: toIds([...currentRoles, superAdminRoleId]) } as never,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return { promotedUserId: String(firstUser.id), superAdminRoleId: String(superAdminRoleId) }
}
