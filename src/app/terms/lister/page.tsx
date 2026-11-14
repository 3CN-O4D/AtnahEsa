import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/page'

const LISTER_IDS = [
  'introduction', 'account', 'lister', 'escrow', 'payments', 'taken',
  'conduct', 'privacy', 'security', 'prohibited', 'ip', 'liability',
  'disputes', 'changes', 'termination', 'contact',
] as const

const sections: TermsSection[] = allSections
  .filter((s) => LISTER_IDS.includes(s.id as typeof LISTER_IDS[number]))
  .map((s, i) => ({ ...s, number: String(i + 1) }))

export const metadata: Metadata = {
  title: 'Terms & Conditions — Listers',
  description:
    'Terms for listers on AseHanta: how to list honestly, how payouts are verified, how refunds are decided, and what we expect from you as a house owner or agent.',
}

export default function TermsListerPage() {
  return (
    <TermsLayout
      lang="en"
      role="lister"
      eyebrow="Terms &amp; Conditions — for Listers"
      title="Terms for listers — list honestly, get paid fairly."
      subtitle="These terms explain what to expect as a lister on AseHanta: how to keep your listing accurate, how payouts are verified with an M-Pesa receipt, how refunds are decided, and what happens when your house is taken."
      updated="Last updated: October 2026"
      summary={{
        title: 'The short version for listers',
        points: [
          'Every detail you publish — price, photos, availability — must be truthful and current.',
          'Respond to viewing requests within 48 hours and show up for approved viewings.',
          'You get paid after the hunter confirms they were satisfied, verified by your M-Pesa receipt.',
          'Problem viewing? Refunds are 100%, 85% or 50% depending on what happened.',
          'Taken houses have their photos deleted from storage 48 hours after they are marked taken.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          By creating an account or listing a house, you agree to these Terms and our Privacy commitments.
          <Link href="/auth/signup" className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95">
            Create an account
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Need the full combined version? <Link href="/terms" className="text-[#1D4ED8] hover:underline font-medium">View all Terms &amp; Conditions</Link> — or{' '}
            <Link href="/terms/hunter" className="text-[#1D4ED8] hover:underline font-medium">terms for hunters</Link>.
          </p>
        </>
      }
    />
  )
}
