import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.error('Daraja timeout:', JSON.stringify(body))
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}