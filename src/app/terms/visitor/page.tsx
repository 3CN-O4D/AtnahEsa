import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/page'

const VISITOR_IDS = [
  'introduction',
  'taken',
  'conduct',
  'privacy',
  'security',
  'prohibited',
  'ip',
  'liability',
  'disputes',
  'changes',
  'contact',
] as const

const browsing: TermsSection = {
  id: 'browsing',
  number: '1',
  title: 'Browsing Without an Account',
  body: (
    <>
      <p>
        You do not need an account to browse AseHanta. You can open the homepage, search by location, filter by rent
        or house type, and read listing descriptions and house rules without signing in. Browsing is free, and simply
        looking at a listing does not create a booking or a payment obligation.
      </p>
      <ul>
        <li>Listing photos, prices, availability and descriptions are shown for information so you can decide whether a home is worth viewing.</li>
        <li>Lister contact details stay locked until you have an active booking. This protects listers from spam and hunters from being rushed into off-platform payments.</li>
        <li>Some actions — saving favourites, booking a viewing, leaving a review, or listing a house — need an account and are covered by the hunter or lister terms.</li>
        <li>If you only browse, the main rules that apply to you are the ones in this visitor version: fair use, privacy, security, intellectual property, and liability.</li>
      </ul>
    </>
  ),
}

const sections: TermsSection[] = [
  browsing,
  ...allSections.filter((section) => VISITOR_IDS.includes(section.id as typeof VISITOR_IDS[number])),
].map((section, index) => ({ ...section, number: String(index + 1) }))

export const metadata: Metadata = {
  title: 'Terms & Conditions — Visitors',
  description:
    'Terms for people browsing AseHanta without an account: what you can view, how your data is handled, fair-use rules, and why lister contacts stay locked until you book.',
}

export default function TermsVisitorPage() {
  return (
    <TermsLayout
      lang="en"
      role="visitor"
      eyebrow="Terms &amp; Conditions — for Visitors"
      title="Terms for visitors — browse freely, with clear rules."
      subtitle="These terms apply when you browse AseHanta to explore homes without booking a viewing or listing a property. They explain what you can see, how your data is handled, and the fair-use rules that keep the platform safe for everyone."
      updated="Last updated: October 2026"
      summary={{
        title: 'The short version for visitors',
        points: [
          'Browsing homes is free and does not require an account.',
          'You can read prices, photos, house rules and availability without signing in.',
          'Lister contact details unlock only through a confirmed booking, never from simple browsing.',
          'We do not sell your data; cookies and analytics are used to keep the site working and improve it.',
          'Listing text and photos belong to their owners — do not scrape or republish them.',
          'Taken houses keep their text but lose their photos 48 hours after being marked taken.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          By continuing to browse AseHanta you accept these visitor terms and our privacy commitments.
          <Link
            href="/"
            className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95"
          >
            Browse available homes
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Planning to book or list? Read the{' '}
            <Link href="/terms/hunter" className="font-medium text-[#1D4ED8] hover:underline">hunter terms</Link> or the{' '}
            <Link href="/terms/lister" className="font-medium text-[#1D4ED8] hover:underline">lister terms</Link>.
          </p>
        </>
      }
    />
  )
}
