import type { Payload } from 'payload'

import type { GovernedEntities, SanitizedRbacConfig } from '../types.js'

export type RbacRuntime = {
  config: SanitizedRbacConfig
  entities: GovernedEntities
}

export const getRbacRuntime = (payload: Payload): RbacRuntime => {
  const runtime = payload.config.custom?.rbac as RbacRuntime | undefined

  if (!runtime) {
    throw new Error('The RBAC plugin is not installed in this Payload config.')
  }

  return runtime
}
