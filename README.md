# @crz-studio/payload-rbac

Role-based access control for the [Payload CMS](https://payloadcms.com) admin panel. There are no permission documents to seed.

- **Zero setup permissions.** Every collection and global in your config gets `create`, `read`, `update` and `delete` permissions automatically. This includes collections you add later.
- **Roles collection with a permissions matrix.** Grants are edited in a table with row, column and section toggles, a filter, and grant/revoke all.
- **First user becomes Super Admin.** The first account created through the admin panel gets a protected Super Admin role that bypasses every check.
- **Escalation protection.** Users can only assign roles, or grant permissions, that they already have.
- **Safe defaults.** Anonymous visitors and users from other auth collections never inherit admin permissions.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [How it works](#how-it-works)
- [Options](#options)
- [Migrations](#migrations)
- [Adding RBAC to an existing project](#adding-rbac-to-an-existing-project)
- [Using permissions in your own code](#using-permissions-in-your-own-code)
- [Security notes](#security-notes)
- [Contributing and releases](#contributing-and-releases)

## Requirements

- Payload `^3.90.0`
- React `^19`
- Any official Payload database adapter. The plugin only uses the Payload Local API, so it has no adapter-specific code. CI tests it against MongoDB, Postgres and SQLite.

## Installation

```bash
pnpm add @crz-studio/payload-rbac
```

```ts
import { buildConfig } from 'payload'
import { rbac } from '@crz-studio/payload-rbac'

export default buildConfig({
  collections: [Users, Posts, Media],
  plugins: [
    seoPlugin(),
    rbac(),
  ],
})
```

Then regenerate the import map, because the plugin registers a custom admin component:

```bash
pnpm payload generate:importmap
```

That is all. Start the app, create the first user and they become Super Admin. Open **Roles** to create more roles.

> Place `rbac()` **last** in the `plugins` array. That way it also governs collections added by other plugins, such as form builder, SEO or redirects.

## How it works

### Roles and the permissions matrix

The plugin adds a `roles` collection with these fields:

| Field          | Type     | Purpose                                                               |
| -------------- | -------- | --------------------------------------------------------------------- |
| `name`         | text     | Unique role name.                                                     |
| `description`  | textarea | Optional description.                                                 |
| `isSuperAdmin` | checkbox | Read-only. Only set on the plugin-managed Super Admin role.           |
| `permissions`  | json     | Grants such as `{ collections: { posts: { read: true } }, globals: {} }`. |

It also adds a `roles` relationship field (`hasMany`) to your users collection. A user's permissions are the **union** of all their roles.

Permissions are not stored as documents. They are derived from your Payload config when the app boots, so:

- a new collection appears in the matrix automatically, with nothing granted;
- permissions for removed or excluded collections are ignored, and stripped the next time the role is saved;
- adding collections never needs a migration.

Globals only support `read` and `update`, so their `create` and `delete` cells show as not applicable.

### Who is governed

Payload access functions protect the admin panel **and** the REST, GraphQL and Local APIs (when `overrideAccess: false`). This plugin focuses on admin users. For each governed collection and global it wraps the access functions like this:

| Request made by                                                    | Result                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| A Super Admin                                                      | Always allowed.                                                               |
| A user from the RBAC users collection                              | Allowed only when one of their roles grants the operation.                    |
| Anyone else (anonymous, or a user from another auth collection such as `customers`) | Your original access function for that operation is used. If there is none, the request is **denied**. |

So a public blog keeps working if the collection says so explicitly:

```ts
{
  slug: 'posts',
  access: {
    read: () => true,
  },
}
```

Customers or members who sign up on your frontend should live in their **own** auth collection. They are never matched against roles, and they only get the access you define on each collection.

The mapping between Payload operations and permissions:

| Payload access  | Permission |
| --------------- | ---------- |
| `create`        | `create`   |
| `read`          | `read`     |
| `update`        | `update`   |
| `delete`        | `delete`   |
| `readVersions`  | `read`     |
| `unlock`        | `update`   |

On the users collection:

- `access.admin` requires at least one role, so users without roles cannot open the panel.
- With `allowSelfManagement` (enabled by default), every user can read and update their own document, but they can only change their own roles if they have `users.update`.

Role changes take effect on the next request. Roles are not stored in the JWT, so nobody has to log in again.

## Options

```ts
rbac({
  collections: ['posts', 'media'],
  excludeCollections: ['audit-logs'],
  globals: true,
  excludeGlobals: ['header'],
  usersCollection: 'users',
  rolesSlug: 'roles',
  superAdminRoleName: 'Super Admin',
  allowSelfManagement: true,
  composeWithOriginalAccess: false,
  disabled: false,
})
```

| Option                      | Type                    | Default                        | Description                                                                                                                                                         |
| --------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections`               | `CollectionSlug[]`      | all collections                | Only govern these collections. The roles and users collections are always included.                                                                                |
| `excludeCollections`        | `CollectionSlug[]`      | `[]`                           | Collections to leave untouched. They keep their own access functions.                                                                                               |
| `globals`                   | `boolean \| GlobalSlug[]` | `true`                       | `true` governs every global, `false` governs none, and an array governs only those globals.                                                                        |
| `excludeGlobals`            | `GlobalSlug[]`          | `[]`                           | Globals to leave untouched.                                                                                                                                         |
| `usersCollection`           | `CollectionSlug`        | `config.admin.user` or `users` | The auth collection that holds admin users. It is created if it does not exist.                                                                                    |
| `rolesSlug`                 | `string`                | `roles`                        | Slug of the roles collection.                                                                                                                                       |
| `superAdminRoleName`        | `string`                | `Super Admin`                  | Name given to the Super Admin role when it is created.                                                                                                              |
| `allowSelfManagement`       | `boolean`               | `true`                         | Lets every user read and update their own user document.                                                                                                            |
| `composeWithOriginalAccess` | `boolean`               | `false`                        | When `true`, a role grant is combined (AND) with the collection's own access function. Use this to keep row-level rules such as "only your own posts" for governed users. |
| `disabled`                  | `boolean`               | `false`                        | Keeps the roles collection and fields, so the schema stays stable, but stops enforcing permissions.                                                                 |

Payload internal collections (`payload-*`) are never governed.

## Migrations

**MongoDB** needs no migration.

**Postgres and SQLite** need **one** migration after installing the plugin. It creates the `roles` table and the users-to-roles relationship:

```bash
pnpm payload migrate:create add-rbac
pnpm payload migrate
```

Adding, renaming or removing collections later never needs an RBAC migration, because permissions live in a single JSON column. In development, `push` mode handles the schema automatically.

## Adding RBAC to an existing project

If users already exist, nobody would go through the "create first user" flow. To prevent a lock-out, the plugin checks on startup. If no user holds the Super Admin role, it creates the role, assigns it to the **oldest** user (by `createdAt`) and logs a warning.

To do this explicitly as part of a migration instead, call `seedRbac`:

```ts
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import { seedRbac } from '@crz-studio/payload-rbac'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await seedRbac({ payload, req })
}
```

`seedRbac` is idempotent and returns `{ promotedUserId, superAdminRoleId }`.

## Using permissions in your own code

```ts
import { getPermissions, hasPermission, isSuperAdmin } from '@crz-studio/payload-rbac'

export const publishEndpoint: Endpoint = {
  path: '/publish',
  method: 'post',
  handler: async (req) => {
    if (!(await hasPermission(req, 'posts', 'update'))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return Response.json({ ok: true })
  },
}
```

| Helper                                                   | Returns                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `hasPermission(req, slug, operation, type?)`             | `true` for Super Admins, or when a role grants the operation. `type` is `'collections'` (default) or `'globals'`. |
| `isSuperAdmin(req)`                                      | Whether the current user holds the Super Admin role.                  |
| `getPermissions(req)`                                    | `{ isSuperAdmin, hasRoles, grants }` with the merged matrix.           |

Results are cached per request, so calling the helpers repeatedly is cheap.

### Bypassing the plugin's guards

Seed scripts and trusted server code can skip the escalation and Super Admin guards by passing `context: { rbacBypass: true }`:

```ts
await payload.update({
  collection: 'users',
  id,
  data: { roles: [roleId] },
  context: { rbacBypass: true },
})
```

## Security notes

- **The Local API skips access control by default.** `payload.find()` and similar calls run with `overrideAccess: true` unless you pass `overrideAccess: false` and a `user`. Use the helpers above in custom code.
- **Roles replace a collection's own access for governed users.** Row-level rules in your access functions (for example `{ author: { equals: req.user.id } }`) are ignored for admin users unless you enable `composeWithOriginalAccess`.
- **Privilege escalation is blocked.**
  - A user can only assign or remove roles whose permissions they already hold.
  - A user can only grant or revoke role permissions they already hold.
  - Only Super Admins can assign the Super Admin role, or modify or delete a Super Admin user.
- **The Super Admin role is protected.** It cannot be deleted, its permissions cannot be edited, and a second one cannot be created through the API.
- **The last Super Admin is protected.** They cannot be deleted or lose the role.
- **Field-level permissions are not part of v1.** Permissions are per collection or global, per operation.

## Contributing and releases

```bash
pnpm install
cp dev/.env.example dev/.env
pnpm dev
```

Set `DATABASE_ADAPTER` to `mongodb` (default), `postgres` or `sqlite` in `dev/.env`. For Postgres, `DATABASE_URL` is the connection string.

| Script                 | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `pnpm dev`             | Runs the dev Payload app on http://localhost:3000.              |
| `pnpm test:int`        | Integration tests on MongoDB (in-memory).                       |
| `pnpm test:int:sqlite` | Integration tests on SQLite (in-memory).                        |
| `pnpm test:int:postgres` | Integration tests on Postgres. Needs `DATABASE_URL`. Each run uses a throwaway schema that is dropped afterwards. |
| `pnpm test:e2e`        | Playwright tests for the admin UI.                              |
| `pnpm lint`            | ESLint.                                                         |
| `pnpm typecheck`       | TypeScript on the plugin and the dev app.                       |
| `pnpm check:comments`  | Fails when code comments are found. This project has none by design. |
| `pnpm build`           | Builds `dist`.                                                  |

### Branches and versioning

- Work happens on `dev`. `main` holds released code.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org). PR titles are checked by CI.
- Merging `dev` into `main` runs CI and then [semantic-release](https://semantic-release.gitbook.io). It reads the commits since the last tag and applies [SemVer](https://semver.org):

  | Commit                                               | Release |
  | ---------------------------------------------------- | ------- |
  | `fix: ...`                                           | patch   |
  | `feat: ...`                                          | minor   |
  | `feat!: ...` or a `BREAKING CHANGE:` footer          | major   |
  | `docs:`, `chore:`, `test:`, `refactor:`, `ci:`       | none    |

  It then tags `vX.Y.Z`, publishes to npm with provenance, and creates a GitHub Release with generated notes.
- Use a **merge commit** (not squash) when merging `dev` into `main`, so every conventional commit from `dev` is analyzed.
- The version in `package.json` stays `0.0.0-semantically-released`. The real version lives in git tags, npm and GitHub Releases, so `main` never gets ahead of `dev`.

### One-time repository setup

1. Create the `crz-studio` npm organization, or make sure you can publish under it.
2. Add an npm **automation** token as the `NPM_TOKEN` repository secret.
3. Allow GitHub Actions to create releases (Settings → Actions → Workflow permissions → Read and write).

## License

MIT
