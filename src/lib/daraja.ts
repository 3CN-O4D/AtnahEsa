const DARAJA_ENV = process.env.DARAJA_ENV || 'sandbox'
const CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || ''
const CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || ''
const PASSKEY = process.env.DARAJA_PASSKEY || ''
const SHORTCODE = process.env.DARAJA_SHORTCODE || ''
const TILL_NUMBER = process.env.DARAJA_TILL_NUMBER || ''
const CALLBACK_URL = process.env.DARAJA_CALLBACK_URL || ''

const BASE_URL = DARAJA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke'

let cachedToken: { token: string; expires: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  })

  if (!res.ok) throw new Error('Failed to get Daraja access token')

  const data = await res.json()
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
  return data.access_token
}

export async function stkPush(phone: string, amount: number, accountRef: string, transactionDesc: string) {
  const token = await getAccessToken()
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64')

  const formattedPhone = phone.startsWith('0')
    ? '254' + phone.slice(1)
    : phone.startsWith('+')
      ? phone.slice(1)
      : phone

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: TILL_NUMBER,
      PhoneNumber: formattedPhone,
      CallBackURL: `${CALLBACK_URL}/api/payments/callback`,
      AccountReference: accountRef,
      TransactionDesc: transactionDesc,
    }),
  })

  if (!res.ok) throw new Error('STK push request failed')

  const data = await res.json()
  return data
}

export async function accountBalance() {
  const token = await getAccessToken()
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64')

  const res = await fetch(`${BASE_URL}/mpesa/accountbalance/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      CommandID: 'AccountBalance',
      PartyA: SHORTCODE,
      IdentifierType: '4',
      Remarks: 'Balance query',
      QueueTimeOutURL: `${CALLBACK_URL}/api/daraja/timeout`,
      ResultURL: `${CALLBACK_URL}/api/daraja/balance-callback`,
    }),
  })

  return res.json()
}

export async function queryStatus(checkoutRequestId: string) {
  const token = await getAccessToken()
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64')

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  })

  return res.json()
}

export async function transactionStatusQuery(receipt: string) {
  const token = await getAccessToken()

  const tillNumber = TILL_NUMBER || SHORTCODE

  const res = await fetch(`${BASE_URL}/mpesa/transactionstatus/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      CommandID: 'TransactionStatusQuery',
      PartyA: tillNumber,
      IdentifierType: TILL_NUMBER ? '2' : '4',
      Remarks: 'Verify manual payment',
      QueueTimeOutURL: `${CALLBACK_URL}/api/daraja/timeout`,
      ResultURL: `${CALLBACK_URL}/api/daraja/transaction-status-callback`,
      TransactionID: receipt,
    }),
  })

  const data = await res.json()
  return data
}

export async function b2cPayment(phone: string, amount: number, remarks: string, occasion = 'Refund') {
  const token = await getAccessToken()

  const formattedPhone = phone.startsWith('0')
    ? '254' + phone.slice(1)
    : phone.startsWith('+')
      ? phone.slice(1)
      : phone

  const res = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      OriginatorConversationID: '',
      InitiatorName: SHORTCODE,
      SecurityCredential: process.env.DARAJA_SECURITY_CREDENTIAL || '',
      CommandID: 'BusinessPayment',
      Amount: amount,
      PartyA: SHORTCODE,
      PartyB: formattedPhone,
      Remarks: remarks,
      QueueTimeOutURL: `${CALLBACK_URL}/api/daraja/timeout`,
      ResultURL: `${CALLBACK_URL}/api/daraja/b2c-callback`,
      Occasion: occasion,
    }),
  })

  const data = await res.json()
  return data
}