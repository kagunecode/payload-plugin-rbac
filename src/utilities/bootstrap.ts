import type { Payload } from 'payload'

import { seedRbac } from './superAdmin.js'

export const bootstrapRbac = async (payload: Payload): Promise<void> => {
  try {
    const { promotedUserId } = await seedRbac({ payload })

    if (promotedUserId) {
      payload.logger.warn(
        `[rbac] No Super Admin was found, so user ${promotedUserId} (the oldest user) was given the Super Admin role.`,
      )
    }
  } catch (error) {
    payload.logger.error({
      err: error,
      msg: '[rbac] Could not verify the Super Admin role. If you use Postgres or SQLite, make sure the RBAC migration has been run.',
    })
  }
}
