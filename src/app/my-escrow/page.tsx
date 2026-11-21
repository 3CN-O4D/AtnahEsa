import type { Metadata } from 'next'
import MyBookingsView from '@/components/escrow/MyBookingsView'

export const metadata: Metadata = {
  title: 'My Escrow | AseHanta',
  description: 'Track paid house viewings, escrow holds, refunds and lister contacts.',
}

export default function MyEscrowPage() {
  return <MyBookingsView mode="escrow" />
}
