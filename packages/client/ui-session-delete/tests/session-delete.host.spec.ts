import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { SessionDeletionController } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const header = (id: string): SessionHeader => ({ id: SessionId(id) } as SessionHeader)

const image = (id: string): ImageAttachmentRef => ({
  attachmentId: id as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png',
  bytes: 1,
  width: 1,
  height: 1,
})

const imageEvent = (ref: ImageAttachmentRef): SessionEvent => ({
  seq: 0,
  type: 'user/message',
  time: 0,
  data: { attachment: ref },
} as unknown as SessionEvent)

function harness(options: {
  agent?: { status: 'idle' | 'running' }
  targetEvents?: readonly SessionEvent[]
  otherEvents?: readonly SessionEvent[]
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const target = SessionId('target')
  const other = SessionId('other')
  const detachSession = vi.fn(async () => {})
  const deleteImage = vi.fn(async () => true)
  const persistence = {
    list: vi.fn(async () => [header(target), header(other)]),
    inspect: vi.fn(async id => ({
      meta: header(String(id)),
      events: id === target ? options.targetEvents ?? [] : options.otherEvents ?? [],
    })),
    delete: vi.fn(async () => true),
  }
  ctx.provide('agents', { get: () => options.agent } as never)
  ctx.provide('attachments', { deleteImage } as never)
  ctx.provide('sessionPersistence', persistence as never)
  ctx.provide('workspaceRegistry', { list: () => [{ detachSession }] } as never)
  return { controller: new SessionDeletionController(ctx), target, detachSession, deleteImage, persistence }
}

describe('SessionDeletionController', () => {
  it('rejects a running Session without touching its durable data', async () => {
    const { controller, target, persistence } = harness({ agent: { status: 'running' } })

    await expect(controller.delete({ sessionId: target })).rejects.toMatchObject({
      code: 'session/delete-busy',
      message: '会话正在运行，请等待任务完成后再删除。',
    })
    expect(persistence.delete).not.toHaveBeenCalled()
  })

  it('rejects an idle Session opened during this Harness run', async () => {
    const { controller, target, persistence } = harness({ agent: { status: 'idle' } })

    await expect(controller.delete({ sessionId: target })).rejects.toMatchObject({
      code: 'session/delete-busy',
      message: '会话已在本次运行中打开；请重启 Harness 后再删除。',
    })
    expect(persistence.delete).not.toHaveBeenCalled()
  })

  it('deletes a cold Session but retains an attachment still referenced elsewhere', async () => {
    const shared = image('shared')
    const { controller, target, detachSession, deleteImage, persistence } = harness({
      targetEvents: [imageEvent(shared)],
      otherEvents: [imageEvent(shared)],
    })

    await expect(controller.delete({ sessionId: target })).resolves.toEqual({ deleted: true })
    expect(detachSession).toHaveBeenCalledWith(target)
    expect(persistence.delete).toHaveBeenCalledWith(target)
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('removes an attachment after its only Session reference is deleted', async () => {
    const orphan = image('orphan')
    const { controller, target, deleteImage } = harness({
      targetEvents: [imageEvent(orphan)],
    })

    await controller.delete({ sessionId: target })
    expect(deleteImage).toHaveBeenCalledWith(orphan)
  })
})
