import type { PayloadRequest } from 'payload'

import { RBAC_BYPASS_CONTEXT_KEY } from './constants.js'

export const isBypassed = (req: PayloadRequest, context?: Record<string, unknown>): boolean =>
  context?.[RBAC_BYPASS_CONTEXT_KEY] === true || req.context?.[RBAC_BYPASS_CONTEXT_KEY] === true
