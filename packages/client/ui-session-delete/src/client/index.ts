/** Browser half of the permanent Session deletion plugin. */

import sessionDeleteRemote from '@deepseek-ai/dsh-client-ui-session-delete/remote'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-session-delete/remote'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

export interface SessionDeletionClient {
  delete(sessionId: SessionId): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionDeletion: SessionDeletionClient
  }
}

export const inject = ['remote']

function provideSessionDeletion(ctx: Context): void {
  ctx.provide('sessionDeletion', {
    delete: async (sessionId) => {
      const result = await ctx.remote.sessionDelete.delete({ sessionId })
      if (!result.ok) throw new Error(result.error.message)
    },
  })
  // The Workspace surface may already be mounted when this optional Profile
  // bundle is installed. Its availability hook listens for this refresh.
  ctx.emit('session-deletion/changed')
}

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  // Profile bundles bring their own generated Remote descriptor.  The base
  // remotes assembly only mounts its built-in namespaces, so this explicit
  // mount is required before the optional UI exposes its deletion action.
  const disposeRemote = await ctx.remote.$mount(sessionDeleteRemote)
  const deletionUi = ctx.inject(['remote.sessionDelete'], provideSessionDeletion)
  try {
    await deletionUi
  } catch (error) {
    await deletionUi.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await deletionUi.dispose()
    await disposeRemote()
  }
}
