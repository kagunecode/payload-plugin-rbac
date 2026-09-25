import type { Config } from 'payload'

import { rbac } from '@crz-studio/payload-rbac'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const createDatabaseAdapter = async (): Promise<Config['db']> => {
  if (process.env.DATABASE_ADAPTER === 'postgres') {
    return postgresAdapter({
      pool: {
        connectionString: process.env.DATABASE_URL || '',
      },
      schemaName:
        process.env.NODE_ENV === 'test'
          ? `rbac_test_${Date.now()}_${process.pid}`
          : process.env.DATABASE_SCHEMA || undefined,
    })
  }

  if (process.env.DATABASE_ADAPTER === 'sqlite') {
    return sqliteAdapter({
      client: {
        url:
          process.env.NODE_ENV === 'test' ? ':memory:' : `file:${path.resolve(dirname, 'dev.db')}`,
      },
    })
  }

  if (process.env.NODE_ENV === 'test') {
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: {
        count: 3,
        dbName: 'payloadmemory',
      },
    })

    process.env.DATABASE_URL = `${memoryDB.getUri()}&retryWrites=true`
  }

  return mongooseAdapter({
    ensureIndexes: true,
    url: process.env.DATABASE_URL || '',
  })
}

const buildDevConfig = async () =>
  buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
      user: 'users',
    },
    collections: [
      {
        slug: 'users',
        admin: {
          useAsTitle: 'email',
        },
        auth: true,
        fields: [
          {
            name: 'name',
            type: 'text',
          },
        ],
      },
      {
        slug: 'posts',
        access: {
          read: () => true,
        },
        admin: {
          useAsTitle: 'title',
        },
        fields: [
          {
            name: 'title',
            type: 'text',
          },
        ],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
      {
        slug: 'customers',
        auth: true,
        fields: [],
      },
      {
        slug: 'audit-logs',
        fields: [
          {
            name: 'message',
            type: 'text',
          },
        ],
      },
    ],
    db: await createDatabaseAdapter(),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    globals: [
      {
        slug: 'settings',
        fields: [
          {
            name: 'siteName',
            type: 'text',
          },
        ],
      },
    ],
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      rbac({
        excludeCollections: ['audit-logs'],
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })

export default buildDevConfig()
