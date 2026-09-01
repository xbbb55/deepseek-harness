import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface SessionDeleteRequest {
  readonly sessionId: SessionId
}

export interface SessionDeleteValue {
  readonly deleted: true
}
