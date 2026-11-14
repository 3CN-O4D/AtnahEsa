import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/page'

const HUNTER_IDS = [
  'introduction', 'account', 'hunter', 'escrow', 'payments', 'taken',
  'conduct', 'privacy', 'security', 'prohibited', 'ip', 'liability',
  'disputes', 'changes', 'termination', 'contact',
] as const

const sections: TermsSection[] = allSections
  .filter((s) => HUNTER_IDS.includes(s.id as typeof HUNTER_IDS[number]))
  .map((s, i) => ({ ...s, number: String(i + 1) }))

export const metadata: Metadata = {
  title: 'Terms & Conditions — House Hunters',
  description:
    'Terms for house hunters on AseHanta: how bookings and escrow protect you, how refunds work, what we expect from hunters, and how your data is handled.',
}

export default function TermsHunterPage() {
  return (
    <TermsLayout
      lang="en"
      role="hunter"
      eyebrow="Terms &amp; Conditions — for House Hunters"
      title="Terms for house hunters — book, view, and move in with confidence."
      subtitle="These terms explain what to expect as a hunter on AseHanta: how your booking fee is held in escrow, how refunds are decided, and what we expect from you before, during, and after a viewing."
      updated="Last updated: October 2026"
      summary={{
        title: 'The short version for hunters',
        points: [
          'Your booking fee is held in escrow until the viewing happens — nobody is paid before you confirm.',
          'Satisfied with the viewing? The lister gets their payout, verified by an M-Pesa receipt.',
          'Problem with the viewing? You can get 100%, 85% or 50% back depending on what happened.',
          'Your contact details are shared with the lister only while you have an active booking.',
          'Taken houses have their photos deleted from storage 48 hours after they are marked taken.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          By creating an account or booking a viewing, you agree to these Terms and our Privacy commitments.
          <Link href="/auth/signup" className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95">
            Create an account
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Need the full combined version? <Link href="/terms" className="text-[#1D4ED8] hover:underline font-medium">View all Terms &amp; Conditions</Link> — or{' '}
            <Link href="/terms/lister" className="text-[#1D4ED8] hover:underline font-medium">terms for listers</Link>.
          </p>
        </>
      }
    />
  )
}
