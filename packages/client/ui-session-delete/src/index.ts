/** Permanently deletes cold sessions and unreferenced local attachments. */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { Workspace } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionDeleteRequest, SessionDeleteValue } from './types.ts'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionDeletionController: SessionDeletionController
  }
}

function collectImages(value: unknown, refs: Map<string, ImageAttachmentRef>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectImages(item, refs)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  if (typeof record.attachmentId === 'string' && typeof record.mediaType === 'string') {
    refs.set(record.attachmentId, record as unknown as ImageAttachmentRef)
  }
  for (const child of Object.values(record)) collectImages(child, refs)
}

function imagesIn(events: readonly SessionEvent[]): Map<string, ImageAttachmentRef> {
  const refs = new Map<string, ImageAttachmentRef>()
  for (const event of events) collectImages(event.data, refs)
  return refs
}

export class SessionDeletionController extends TypertRemoteService {
  static inject = ['agents', 'attachments', 'sessionPersistence', 'workspaceRegistry']

  constructor(ctx: Context) {
    super(ctx, 'sessionDeletionController', { namespace: 'sessionDelete' })
  }

  @Remote('delete')
  async delete(request: SessionDeleteRequest): Promise<SessionDeleteValue> {
    const id = request.sessionId
    const agent = this.ctx.agents.get(id)
    if (agent !== undefined) {
      const reason = agent.status === 'running'
        ? '会话正在运行，请等待任务完成后再删除。'
        : '会话已在本次运行中打开；请重启 Harness 后再删除。'
      throw new RemoteError('session/delete-busy', reason, { sessionId: id, reason })
    }

    const persistence = this.ctx.sessionPersistence as SessionPersistence
    const headers = await persistence.list()
    const target = headers.find(header => header.id === id)
    if (target === undefined) {
      throw new RemoteError('session/not-found', `session "${id}" was not found`, { sessionId: id })
    }
    const targetInspection = await persistence.inspect(id)
    const targetImages = imagesIn(targetInspection.events)

    // Remove registry references before deleting the durable identity.
    for (const workspace of this.ctx.workspaceRegistry.list() as Workspace[]) {
      await workspace.detachSession(id)
    }
    const deleted = await persistence.delete(id)
    if (!deleted) throw new RemoteError('session/not-found', `session "${id}" was not found`, { sessionId: id })

    // Content-addressed objects survive shared references; only delete objects
    // that no remaining session can reach.
    const referenced = new Set<string>()
    for (const header of headers) {
      if (header.id === id) continue
      try {
        for (const attachmentId of imagesIn((await persistence.inspect(header.id)).events).keys()) {
          referenced.add(attachmentId)
        }
      } catch (error: unknown) {
        this.ctx.logger.warn(`session-delete: skipped attachment scan for "${header.id}": ${String(error)}`)
      }
    }
    for (const [attachmentId, ref] of targetImages) {
      if (referenced.has(attachmentId)) continue
      try {
        await this.ctx.attachments.deleteImage(ref)
      } catch (error: unknown) {
        this.ctx.logger.warn(`session-delete: attachment "${attachmentId}" could not be removed: ${String(error)}`)
      }
    }
    this.ctx.emit('api-session/removed', id)
    return { deleted: true }
  }
}

export function apply(ctx: Context): void {
  new SessionDeletionController(ctx)
}

export default SessionDeletionController
