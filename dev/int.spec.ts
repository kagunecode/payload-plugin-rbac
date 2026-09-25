import type { Payload, TypedUser } from 'payload'

import { hasPermission, seedRbac } from '@crz-studio/payload-rbac'
import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { devUser } from './helpers/credentials.js'

let payload: Payload
let superAdmin: TypedUser
let superAdminRoleId: number | string

const asUser = (doc: Record<string, unknown>, collection = 'users'): TypedUser =>
  ({ ...doc, collection }) as unknown as TypedUser

const createRole = async (name: string, permissions: Record<string, unknown>) =>
  payload.create({
    collection: 'roles',
    data: { name, permissions } as never,
    overrideAccess: true,
  })

const createUser = async (email: string, roles: Array<number | string>) => {
  const doc = await payload.create({
    collection: 'users',
    context: { rbacBypass: true },
    data: { email, password: 'password', roles } as never,
    overrideAccess: true,
  })
  return asUser(doc as unknown as Record<string, unknown>)
}

afterAll(async () => {
  const db = payload.db as unknown as {
    drizzle?: { execute: (query: unknown) => Promise<unknown> }
    name: string
    schemaName?: string
  }

  if (db.name === 'postgres' && db.schemaName?.startsWith('rbac_test_') && db.drizzle) {
    await db.drizzle.execute(sql.raw(`DROP SCHEMA IF EXISTS "${db.schemaName}" CASCADE`))
  }

  await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: devUser.email } },
  })
  superAdmin = asUser(docs[0] as unknown as Record<string, unknown>)

  const roles = await payload.find({
    collection: 'roles',
    where: { isSuperAdmin: { equals: true } },
  })
  superAdminRoleId = roles.docs[0]!.id
})

describe('setup', () => {
  test('creates the Super Admin role and assigns it to the first user', () => {
    expect(superAdminRoleId).toBeDefined()
    const roleIds = ((superAdmin as unknown as { roles: unknown[] }).roles ?? []).map((role) =>
      typeof role === 'object' && role !== null ? (role as { id: unknown }).id : role,
    )
    expect(roleIds.map(String)).toContain(String(superAdminRoleId))
  })

  test('generates permissions for every collection and global except excluded ones', () => {
    const entities = (
      payload.config.custom as {
        rbac: { entities: { collections: { slug: string }[]; globals: { slug: string }[] } }
      }
    ).rbac.entities
    const collectionSlugs = entities.collections.map(({ slug }) => slug)

    expect(collectionSlugs).toEqual(
      expect.arrayContaining(['users', 'posts', 'media', 'customers', 'roles']),
    )
    expect(collectionSlugs).not.toContain('audit-logs')
    expect(collectionSlugs.some((slug) => slug.startsWith('payload-'))).toBe(false)
    expect(entities.globals.map(({ slug }) => slug)).toEqual(['settings'])
  })

  test('super admin can do everything', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'By super admin' },
      overrideAccess: false,
      user: superAdmin,
    })
    await payload.delete({
      id: post.id,
      collection: 'posts',
      overrideAccess: false,
      user: superAdmin,
    })
    await payload.updateGlobal({
      slug: 'settings',
      data: { siteName: 'RBAC' },
      overrideAccess: false,
      user: superAdmin,
    })
  })
})

describe('role permissions', () => {
  let editor: TypedUser
  let postId: number | string

  beforeAll(async () => {
    const editorRole = await createRole('Editor', {
      collections: { posts: { read: true, update: true } },
      globals: { settings: { read: true } },
    })
    editor = await createUser('editor@example.com', [editorRole.id])
    const post = await payload.create({ collection: 'posts', data: { title: 'Hello' } })
    postId = post.id
  })

  test('granted operations are allowed', async () => {
    const updated = await payload.update({
      id: postId,
      collection: 'posts',
      data: { title: 'Updated' },
      overrideAccess: false,
      user: editor,
    })
    expect(updated.title).toBe('Updated')

    const settings = await payload.findGlobal({
      slug: 'settings',
      overrideAccess: false,
      user: editor,
    })
    expect(settings).toBeDefined()
  })

  test('missing grants are denied', async () => {
    await expect(
      payload.create({
        collection: 'posts',
        data: { title: 'Nope' },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ id: postId, collection: 'posts', overrideAccess: false, user: editor }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'media', overrideAccess: false, user: editor }),
    ).rejects.toThrow()
    await expect(
      payload.updateGlobal({
        slug: 'settings',
        data: { siteName: 'x' },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
  })

  test('permissions from multiple roles are combined', async () => {
    const postsRole = await createRole('Posts creator', {
      collections: { posts: { create: true } },
    })
    const mediaRole = await createRole('Media reader', { collections: { media: { read: true } } })
    const user = await createUser('combined@example.com', [postsRole.id, mediaRole.id])

    await payload.create({
      collection: 'posts',
      data: { title: 'Combined' },
      overrideAccess: false,
      user,
    })
    await payload.find({ collection: 'media', overrideAccess: false, user })

    const req = await createLocalReq({ user }, payload)
    expect(await hasPermission(req, 'posts', 'create')).toBe(true)
    expect(await hasPermission(req, 'posts', 'delete')).toBe(false)
  })

  test('role changes take effect without logging in again', async () => {
    const role = await createRole('Mutable', {})
    const user = await createUser('mutable@example.com', [role.id])

    await expect(
      payload.find({ collection: 'media', overrideAccess: false, user }),
    ).rejects.toThrow()

    await payload.update({
      id: role.id,
      collection: 'roles',
      data: { permissions: { collections: { media: { read: true } } } } as never,
      overrideAccess: true,
    })

    await payload.find({ collection: 'media', overrideAccess: false, user })
  })

  test('users can read and update themselves but not change their own roles', async () => {
    const self = await payload.findByID({
      id: editor.id,
      collection: 'users',
      overrideAccess: false,
      user: editor,
    })
    expect(self.email).toBe('editor@example.com')

    const others = await payload.find({ collection: 'users', overrideAccess: false, user: editor })
    expect(others.docs.map((doc) => doc.id)).toEqual([editor.id])

    const updated = await payload.update({
      id: editor.id,
      collection: 'users',
      data: { name: 'Editor', roles: [superAdminRoleId] } as never,
      overrideAccess: false,
      user: editor,
    })
    expect(updated.name).toBe('Editor')
    const roleIds = ((updated as unknown as { roles: unknown[] }).roles ?? []).map((role) =>
      String(typeof role === 'object' && role !== null ? (role as { id: unknown }).id : role),
    )
    expect(roleIds).not.toContain(String(superAdminRoleId))
  })

  test('users without roles cannot open the admin panel', async () => {
    const noRoles = await createUser('noroles@example.com', [])
    const adminAccess = payload.collections.users.config.access.admin!

    expect(await adminAccess({ req: await createLocalReq({ user: noRoles }, payload) })).toBe(false)
    expect(await adminAccess({ req: await createLocalReq({ user: editor }, payload) })).toBe(true)
    expect(await adminAccess({ req: await createLocalReq({ user: superAdmin }, payload) })).toBe(
      true,
    )
  })
})

describe('requests outside the RBAC users collection', () => {
  let customer: TypedUser

  beforeAll(async () => {
    const doc = await payload.create({
      collection: 'customers',
      data: { email: 'customer@example.com', password: 'password' },
    })
    customer = asUser(doc as unknown as Record<string, unknown>, 'customers')
    await payload.create({ collection: 'posts', data: { title: 'Public post' } })
  })

  test('anonymous requests use the original access or are denied', async () => {
    const posts = await payload.find({ collection: 'posts', overrideAccess: false })
    expect(posts.totalDocs).toBeGreaterThan(0)

    await expect(payload.find({ collection: 'media', overrideAccess: false })).rejects.toThrow()
    await expect(payload.findGlobal({ slug: 'settings', overrideAccess: false })).rejects.toThrow()
  })

  test('users from other auth collections do not get default access', async () => {
    const posts = await payload.find({ collection: 'posts', overrideAccess: false, user: customer })
    expect(posts.totalDocs).toBeGreaterThan(0)

    await expect(
      payload.create({
        collection: 'posts',
        data: { title: 'x' },
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'roles', overrideAccess: false, user: customer }),
    ).rejects.toThrow()
  })

  test('excluded collections keep their own access', async () => {
    const editorRole = await createRole('Nothing', {})
    const user = await createUser('excluded@example.com', [editorRole.id])

    await payload.create({
      collection: 'audit-logs',
      data: { message: 'default access allows logged in users' },
      overrideAccess: false,
      user,
    })
  })
})

describe('privilege escalation', () => {
  let manager: TypedUser
  let target: TypedUser
  let powerfulRoleId: number | string
  let weakRoleId: number | string

  beforeAll(async () => {
    const managerRole = await createRole('User manager', {
      collections: {
        posts: { read: true },
        roles: { read: true, update: true },
        users: { read: true, update: true },
      },
    })
    manager = await createUser('manager@example.com', [managerRole.id])
    target = await createUser('target@example.com', [])
    powerfulRoleId = (await createRole('Powerful', { collections: { media: { delete: true } } })).id
    weakRoleId = (await createRole('Weak', { collections: { posts: { read: true } } })).id
  })

  test('cannot assign a role with permissions the actor does not have', async () => {
    await expect(
      payload.update({
        id: target.id,
        collection: 'users',
        data: { roles: [powerfulRoleId] } as never,
        overrideAccess: false,
        user: manager,
      }),
    ).rejects.toThrow(/permissions you do not have/)
  })

  test('can assign a role within the actor permissions', async () => {
    const updated = await payload.update({
      id: target.id,
      collection: 'users',
      data: { roles: [weakRoleId] } as never,
      overrideAccess: false,
      user: manager,
    })
    expect(updated.id).toBe(target.id)
  })

  test('cannot assign the Super Admin role', async () => {
    await expect(
      payload.update({
        id: target.id,
        collection: 'users',
        data: { roles: [superAdminRoleId] } as never,
        overrideAccess: false,
        user: manager,
      }),
    ).rejects.toThrow()
  })

  test('cannot modify a Super Admin user', async () => {
    await expect(
      payload.update({
        id: superAdmin.id,
        collection: 'users',
        data: { name: 'Hijacked' },
        overrideAccess: false,
        user: manager,
      }),
    ).rejects.toThrow(/Super Admin/)
  })

  test('cannot grant permissions on a role that the actor does not have', async () => {
    await expect(
      payload.update({
        id: weakRoleId,
        collection: 'roles',
        data: { permissions: { collections: { posts: { delete: true, read: true } } } } as never,
        overrideAccess: false,
        user: manager,
      }),
    ).rejects.toThrow(/posts\.delete/)
  })

  test('cannot create another Super Admin role', async () => {
    const role = await payload.create({
      collection: 'roles',
      data: { name: 'Fake super', isSuperAdmin: true } as never,
      overrideAccess: false,
      user: superAdmin,
    })
    expect((role as { isSuperAdmin?: boolean }).isSuperAdmin).toBe(false)
  })
})

describe('super admin protection', () => {
  test('the Super Admin role cannot be deleted', async () => {
    await expect(
      payload.delete({
        id: superAdminRoleId,
        collection: 'roles',
        overrideAccess: false,
        user: superAdmin,
      }),
    ).rejects.toThrow(/cannot be deleted/)
  })

  test('the Super Admin role permissions cannot be changed', async () => {
    const updated = await payload.update({
      id: superAdminRoleId,
      collection: 'roles',
      data: { name: 'Owner', permissions: { collections: { posts: { read: true } } } } as never,
      overrideAccess: false,
      user: superAdmin,
    })
    expect((updated as { isSuperAdmin?: boolean }).isSuperAdmin).toBe(true)
    expect((updated as { name?: string }).name).toBe('Owner')
  })

  test('the last Super Admin cannot be deleted or demoted', async () => {
    await expect(
      payload.delete({
        id: superAdmin.id,
        collection: 'users',
        overrideAccess: false,
        user: superAdmin,
      }),
    ).rejects.toThrow(/last Super Admin/)

    await expect(
      payload.update({
        id: superAdmin.id,
        collection: 'users',
        data: { roles: [] } as never,
        overrideAccess: false,
        user: superAdmin,
      }),
    ).rejects.toThrow(/keep the Super Admin role/)
  })
})

describe('sanitizing', () => {
  test('unknown collections and operations are stripped', async () => {
    const role = await createRole('Sanitized', {
      collections: {
        'audit-logs': { read: true },
        posts: { publish: true, read: true },
        unknown: { read: true },
      },
      globals: { settings: { create: true, update: true } },
    })

    expect((role as { permissions: unknown }).permissions).toEqual({
      collections: { posts: { read: true } },
      globals: { settings: { update: true } },
    })
  })
})

describe('bootstrap', () => {
  test('seedRbac promotes the oldest user when no Super Admin exists', async () => {
    await payload.update({
      id: superAdmin.id,
      collection: 'users',
      context: { rbacBypass: true },
      data: { roles: [] } as never,
      overrideAccess: true,
    })

    const result = await seedRbac({ payload })

    expect(result.promotedUserId).toBe(String(superAdmin.id))
    expect(result.superAdminRoleId).toBe(String(superAdminRoleId))

    const second = await seedRbac({ payload })
    expect(second.promotedUserId).toBeNull()
  })
})
