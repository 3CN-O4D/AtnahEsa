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
  /** All listing photos, when the caller wants to send more than the cover. */
  images?: string[]
  badges: string[]
}

/**
 * A message that should also reach the admin team over WhatsApp, not just the
 * admin inbox. The bridge reads this and forwards it to `ADMIN_WHATSAPP_NUMBERS`;
 * the web client ignores it. Always written in English.
 */
/** A compact, structured result set kept between chat turns. */
export interface HouseSearchSnapshot {
  query: string
  filters: {
    locations: string[]
    bedrooms: string[]
    rent: { min: number | null; max: number | null }
    sort: 'relevance' | 'price_asc' | 'price_desc'
    count: number | null
  }
  total: number
  results: Array<{ card: HouseCardData; score: number; rent: number }>
  /** How many results have already been shown, so "show more" can continue. */
  shown: number
  /** Results per batch, taken from "send me 2 houses" when present. */
  pageSize: number
  capturedAt: string
  takenNote?: string
}

export interface AdminAlert {
  topic: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  message: string
  name?: string
  phone?: string
  email?: string
  listingId?: string
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
  /** Active submission id (see `forms.ts`), e.g. `house_request`. */
  form?: string | null
  /** Used by the rules engine to avoid re-triggering the same intent. */
  lastIntent?: string
  /** Last structured house search, kept so follow-ups can sort/filter it. */
  search?: HouseSearchSnapshot | null
  /** Sent WhatsApp message ids -> the house/text they contained, for quoted replies. */
  messageRefs?: Array<{
    id: string
    kind: 'card' | 'text'
    listingId?: string
    title?: string
    index?: number
    body?: string
  }>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * A WhatsApp message the customer replied to. The worker resolves quoted card
 * ids to listing ids before sending, so the brain never has to guess which
 * house "this one" means.
 */
export interface QuotedContext {
  id?: string | null
  text?: string | null
  listingId?: string | null
  title?: string | null
  index?: number | null
  kind?: 'card' | 'text' | null
}

export interface ChatRequest {
  message: string
  state?: Partial<ChatState> | null
  history?: ChatMessage[]
  quoted?: QuotedContext | null
  /**
   * Where the message came from. Web sessions can use the cookie-bound account
   * flows (change email, delete account, change DP); WhatsApp sessions cannot,
   * so those intents are redirected to the website instead of failing.
   */
  channel?: 'web' | 'whatsapp'
}

export interface ChatResponse {
  reply: string
  actions?: ChatAction[]
  quickReplies?: string[]
  state: ChatState
  /** Set when the admin team should also be pinged on WhatsApp. */
  adminAlert?: AdminAlert
}

export const emptyState = (): ChatState => ({
  mode: 'chat',
  step: null,
  draft: {},
})

/** Chatbot identity constants shared with the AI prompt + engine. */
export const CHAT_NAME = 'Ase'
export const CHAT_ROLE = 'AseHanta\'s digital assistant'
