export type ChatMode = 'chat' | 'house_request' | 'wifi_booking' | 'mover_request' | 'password_reset' | 'change_email' | 'delete_account' | 'change_dp'

export interface HouseCardData {
  id: string
  title: string
  location: string
  descriptive_location?: string | null
  rent: number
  price: number
  house_type?: string | null
  water?: string | null
  deposit?: number | null
  deposit_refundable?: boolean | null
  vacancy?: string | null
  status?: string | null
  image?: string | null
  badges: string[]
}

export interface ChatAction {
  type: 'link' | 'card'
  label?: string
  href?: string
  /** Populated for `card` actions. */
  card?: HouseCardData
}

export interface ChatState {
  mode: ChatMode
  step: string | null
  draft: Record<string, unknown>
  /** Used by the rules engine to avoid re-triggering the same intent. */
  lastIntent?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  message: string
  state?: Partial<ChatState> | null
  history?: ChatMessage[]
}

export interface ChatResponse {
  reply: string
  actions?: ChatAction[]
  quickReplies?: string[]
  state: ChatState
}

export const emptyState = (): ChatState => ({
  mode: 'chat',
  step: null,
  draft: {},
})

/** Chatbot identity constants shared with the AI prompt + engine. */
export const CHAT_NAME = 'Ase'
export const CHAT_ROLE = 'AseHanta\'s digital assistant'
