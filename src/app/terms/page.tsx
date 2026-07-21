'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function TermsPage() {
  const [tab, setTab] = useState<'lister' | 'hunter'>('hunter')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-blue-600 hover:underline text-sm">&larr; Back to home</Link>

        <h1 className="text-3xl font-bold mt-6 mb-2">Terms &amp; Conditions</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: July 2026</p>

        {/* Tab selector */}
        <div className="flex gap-1 bg-gray-200 rounded-xl p-1 mb-8">
          <button
            onClick={() => setTab('hunter')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${tab === 'hunter' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
          >
            I&apos;m a House Hunter
          </button>
          <button
            onClick={() => setTab('lister')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${tab === 'lister' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
          >
            I&apos;m a Lister
          </button>
        </div>

        {tab === 'hunter' ? <HunterTerms /> : <ListerTerms />}

        <div className="mt-10 pt-6 border-t text-center text-sm text-gray-500">
          <p>By signing up, you agree to the terms above.</p>
          <Link href="/auth/signup" className="text-blue-600 hover:underline font-medium">Create Account</Link>
        </div>
      </div>
    </div>
  )
}

function HunterTerms() {
  return (
    <div className="prose prose-gray max-w-none space-y-6">
      <Section title="What You're Accepting">
        <p>
          When you create a <strong>House Hunter</strong> account on AseHanta, you are agreeing to the following rules
          that protect you, the property listers, and the platform as a whole.
        </p>
      </Section>

      <Section title="1. Bookings &amp; Viewings">
        <p><strong>What happens:</strong> You can request to view a listed property. The lister reviews your request and decides whether to approve it.</p>
        <p><strong>Why:</strong> This gives listers control over who visits their property and keeps the process organised. Only approved viewings go ahead.</p>
        <ul>
          <li>You agree not to request viewings for properties you have no serious interest in.</li>
          <li>You agree to show up on time for approved viewings.</li>
          <li>Repeated no-shows or unserious requests may lead to account suspension.</li>
        </ul>
      </Section>

      <Section title="2. Communication">
        <p><strong>What happens:</strong> When you contact a lister through the platform, your message is shared with them along with your contact details.</p>
        <p><strong>Why:</strong> We connect you directly so you can coordinate viewing times and ask property-specific questions. We do not intermediate these conversations.</p>
        <ul>
          <li>You agree not to use the platform to send spam, scam, or harassing messages.</li>
          <li>You agree not to take conversations off-platform to bypass the booking system.</li>
        </ul>
      </Section>

      <Section title="3. Payments &amp; Deposits">
        <p><strong>What happens:</strong> If a listing requires a booking deposit, you pay it through our payment partner (M-Pesa via Safaricom). The funds are held securely until the viewing occurs or the deposit is released.</p>
        <p><strong>Why:</strong> Deposits protect listers against no-shows and signal your commitment. They also give you peace of mind that the lister is serious about showing the property.</p>
        <ul>
          <li>If you attend the viewing, the deposit is released to the lister.</li>
          <li>If the lister cancels, you receive a full refund.</li>
          <li>If you cancel with less than 24 hours notice, a partial refund (minus a service fee) applies.</li>
        </ul>
      </Section>

      <Section title="4. Your Data">
        <p><strong>What happens:</strong> We collect your name, email, phone number, and usage data to operate the platform.</p>
        <p><strong>Why:</strong> We need this information to create your account, connect you with listers, and improve the service. We do not sell your data to third parties.</p>
        <ul>
          <li>Your phone number and email are shared with a lister only when you request a viewing of their property.</li>
          <li>You can request deletion of your data at any time by contacting support.</li>
        </ul>
      </Section>

      <Section title="5. Prohibited Behaviour">
        <p>You agree not to:</p>
        <ul>
          <li>Create fake accounts or misrepresent your identity.</li>
          <li>Attempt to scam, defraud, or deceive other users or the platform.</li>
          <li>Use the platform for any illegal purpose.</li>
          <li>Reverse-engineer, scrape, or abuse the platform's APIs.</li>
        </ul>
        <p>Violation of these terms may result in immediate account termination without refund of any held deposits.</p>
      </Section>
    </div>
  )
}

function ListerTerms() {
  return (
    <div className="prose prose-gray max-w-none space-y-6">
      <Section title="What You're Accepting">
        <p>
          When you create a <strong>Lister</strong> account on AseHanta, you are agreeing to the following rules
          that protect you, the house hunters, and the platform.
        </p>
      </Section>

      <Section title="1. Listings &amp; Accuracy">
        <p><strong>What happens:</strong> You upload property listings including photos, description, location, and price. These become visible to all house hunters on the platform.</p>
        <p><strong>Why:</strong> Accurate listings build trust. Hunters rely on your information to decide whether to request a viewing. Misleading listings waste everyone's time.</p>
        <ul>
          <li>You agree that all listing details (price, location, availability, amenities) are truthful and current.</li>
          <li>You agree to update or remove listings as soon as the property becomes unavailable.</li>
          <li>Deliberately misleading listings may be taken down and your account may be suspended.</li>
        </ul>
      </Section>

      <Section title="2. Viewing Requests">
        <p><strong>What happens:</strong> Hunters request to view your property. You review their request and can approve or decline it.</p>
        <p><strong>Why:</strong> You have full control over who visits your property. This keeps you safe and lets you manage your schedule.</p>
        <ul>
          <li>You agree to respond to viewing requests within 48 hours.</li>
          <li>Once approved, you agree to show the property at the agreed time.</li>
          <li>Repeated failure to show up for approved viewings may result in account suspension.</li>
        </ul>
      </Section>

      <Section title="3. Payments &amp; Payouts">
        <p><strong>What happens:</strong> When a hunter pays a booking deposit, the funds are held by our payment partner. After the viewing takes place, the deposit is released to you minus a platform service fee.</p>
        <p><strong>Why:</strong> Deposits compensate you for your time if a hunter no-shows. The platform fee covers payment processing and operational costs.</p>
        <ul>
          <li>You will receive payouts to your registered M-Pesa number.</li>
          <li>Current platform fee is <strong>5%</strong> of the deposit amount (capped at KES 500).</li>
          <li>If you cancel a confirmed booking, the full deposit is refunded to the hunter and you forfeit the payout.</li>
        </ul>
      </Section>

      <Section title="4. Communication">
        <p><strong>What happens:</strong> When a hunter contacts you or requests a viewing, you receive their contact details so you can coordinate.</p>
        <p><strong>Why:</strong> Direct communication speeds up the rental process. We provide the connection but don't manage your conversations.</p>
        <ul>
          <li>You agree to use hunter contact information solely for property-related communication.</li>
          <li>You agree not to spam, harass, or misuse hunter data.</li>
          <li>All financial transactions must go through the platform — off-platform payments are not covered by our protections.</li>
        </ul>
      </Section>

      <Section title="5. Your Data">
        <p><strong>What happens:</strong> We collect your name, email, phone, and listing data to operate the platform.</p>
        <p><strong>Why:</strong> This information is necessary to create and manage your account, display your listings, and process payouts. We do not sell your data.</p>
        <ul>
          <li>Your phone number and email are shared with a hunter only when they request a viewing of your property.</li>
          <li>You can request data deletion at any time (note: this will remove all your active listings).</li>
        </ul>
      </Section>

      <Section title="6. Prohibited Behaviour">
        <p>You agree not to:</p>
        <ul>
          <li>Post fake or duplicate listings for the same property.</li>
          <li>Attempt to charge hunters directly off-platform to avoid fees.</li>
          <li>Create fake accounts to boost your listings or leave fake reviews.</li>
          <li>Use the platform for any illegal purpose.</li>
        </ul>
        <p>Violation may result in immediate account termination, removal of all listings, and forfeiture of any unpaid earnings.</p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_strong]:text-gray-900">
        {children}
      </div>
    </div>
  )
}
