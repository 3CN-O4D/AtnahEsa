import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/page'

const ADMIN_IDS = ['liability', 'disputes', 'changes', 'contact'] as const

const adminSections: TermsSection[] = [
  {
    id: 'admin-scope',
    number: '1',
    title: 'Who These Terms Apply To',
    body: (
      <>
        <p>
          These terms apply to anyone given administrator, moderator, support, finance-verification, or any other
          elevated access to AseHanta&apos;s internal tools and data. Admin access is a responsibility, not a perk. It
          exists so that listings stay honest, payments stay accurate, and users stay safe — never to give the person
          holding it an advantage.
        </p>
        <p>
          If you are an admin, these role terms apply <strong>in addition to</strong> the general Terms &amp;
          Conditions. Where these terms are stricter than the general terms, these terms win. If you are unsure
          whether an action is allowed, ask before you act.
        </p>
      </>
    ),
  },
  {
    id: 'admin-access',
    number: '2',
    title: 'Admin Access and Account Security',
    body: (
      <>
        <p>
          Your admin account is the key to other people&apos;s personal data and money. Treat it with more care than
          your personal accounts.
        </p>
        <ul>
          <li>Use your own named admin account. Never share credentials, use another person&apos;s session, or let someone else act through your login.</li>
          <li>Use a strong, unique password and a password manager, and enable two-factor authentication wherever it is available.</li>
          <li>Access only the records your role needs for the task in front of you. Do not browse admin data out of curiosity.</li>
          <li>Never create test admin accounts, hidden backdoors, or extra logins without written approval from the security lead.</li>
          <li>Do not leave an admin session open on a shared or public device, and lock your screen when you step away.</li>
          <li>Report a lost device, suspected compromise, or accidental disclosure immediately — speed limits the damage.</li>
          <li>Access is reviewed regularly and may be reduced or revoked when your role changes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-moderation',
    number: '3',
    title: 'Moderation and Fair Decisions',
    body: (
      <>
        <p>
          Moderation protects users from false listings, abuse, and fraud. It must be predictable, consistent, and
          free of favouritism.
        </p>
        <ul>
          <li>Review listings, reports, disputes, and accounts promptly, using the published rules rather than personal opinion.</li>
          <li>Apply the same standard to everyone, regardless of who the user is, how popular the listing is, or whether you know them.</li>
          <li>Record the decision and the reason, so another admin can understand and review it later.</li>
          <li>Tell the user clearly why content was removed or an account was restricted, unless doing so would compromise an investigation or put someone at risk.</li>
          <li>Never moderate your own listing, a relative&apos;s listing, or a friend&apos;s account. Hand it to another admin.</li>
          <li>Never use moderation powers to retaliate, settle a personal dispute, or gain an advantage for yourself or anyone else.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-payments',
    number: '4',
    title: 'Payment Verification and Escrow',
    body: (
      <>
        <p>
          Money held in escrow belongs to the people who paid it. Admin actions around payments must be based on
          evidence, not trust or convenience.
        </p>
        <ul>
          <li>Verify M-Pesa receipts, transaction codes, amounts, and dates against the actual payment record before marking a booking as paid.</li>
          <li>Never ask a user to send money to a personal number, and never accept a payment outside the published AseHanta account.</li>
          <li>Do not release, reverse, or manually adjust escrow funds without documented evidence and, where required, a second reviewer.</li>
          <li>Escalate mismatched amounts, duplicated receipts, suspicious reversals, or pressure to release funds to the finance lead.</li>
          <li>Keep payment notes factual, and never copy a user&apos;s full transaction history into a channel where it is not needed.</li>
          <li>Refunds must follow the published refund rules and be traceable to a real transaction and a real decision.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-confidentiality',
    number: '5',
    title: 'Confidentiality of User Data',
    body: (
      <>
        <p>
          Admin tools expose names, phone numbers, messages, payment records, and sometimes identity documents. That
          access is borrowed for a specific job, not granted as a permanent window into people&apos;s lives.
        </p>
        <ul>
          <li>Open a user&apos;s record only when a real support, moderation, fraud, or payment task requires it.</li>
          <li>Never share, copy, screenshot, forward, or discuss user data outside authorised work channels.</li>
          <li>Do not look up an ex-partner, neighbour, public figure, colleague, or yourself. Curiosity is not a work reason.</li>
          <li>Use only approved tools. Never move user data into personal email, cloud storage, notes, or messaging apps.</li>
          <li>Follow retention and deletion rules, and report an accidental disclosure immediately so it can be contained.</li>
          <li>Confidentiality continues after your admin access ends, without a time limit.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-conflicts',
    number: '6',
    title: 'Conflicts of Interest and Integrity',
    body: (
      <>
        <p>
          Even the appearance of favouritism damages trust in the platform. Admins must put the platform&apos;s rules
          ahead of personal relationships and personal gain.
        </p>
        <ul>
          <li>Do not use admin access to promote, approve, edit, or manage your own property, a relative&apos;s property, or a business you benefit from.</li>
          <li>Disclose any personal or financial relationship with a lister, hunter, property, or dispute you are asked to handle, then step aside.</li>
          <li>Do not use inside information — about demand, reports, investigations, or upcoming changes — for personal gain or to help someone else.</li>
          <li>Do not accept gifts, favours, discounts, or payments that could influence a decision.</li>
          <li>Do not hire, promote, or protect someone in exchange for loyalty or silence.</li>
          <li>When in doubt, disclose the relationship and let someone independent decide.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-audit',
    number: '7',
    title: 'Audit, Logging and Accountability',
    body: (
      <>
        <p>
          Admin actions may be logged, reviewed, and audited. Accountability is what makes elevated access safe for
          everyone else.
        </p>
        <ul>
          <li>Cooperate fully with audits, investigations, and requests for records.</li>
          <li>Never delete, alter, hide, or withhold logs, messages, or evidence to avoid scrutiny.</li>
          <li>Preserve evidence in disputes, reports, and suspected fraud until you are told it is no longer needed.</li>
          <li>Keep decisions and their reasons in the approved system, not only in private messages.</li>
          <li>Report suspected misconduct by another admin in good faith; retaliation against a reporter is itself a serious breach.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-prohibited',
    number: '8',
    title: 'Prohibited Admin Conduct',
    body: (
      <>
        <p>As an admin you must never:</p>
        <ul>
          <li>Access user data without a legitimate work reason.</li>
          <li>Change a listing, payment, review, or account to benefit yourself or someone else.</li>
          <li>Share credentials, session links, internal screenshots, or private user information.</li>
          <li>Delete or edit audit logs, evidence, or records of your own actions.</li>
          <li>Harass, threaten, demean, or discriminate against any user or colleague.</li>
          <li>Impersonate a user, a lister, or another staff member.</li>
          <li>Bypass security controls, approval steps, or the second-reviewer rule.</li>
          <li>Monitor someone&apos;s activity for personal reasons, including a partner, ex-partner, or acquaintance.</li>
          <li>Accept a bribe, kickback, or any off-platform payment.</li>
          <li>Retaliate against anyone who reports a concern or refuses to break these rules.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-removal',
    number: '9',
    title: 'Suspension, Investigation and Removal of Access',
    body: (
      <>
        <p>
          Admin access can be paused quickly while a concern is looked into. A pause is not a punishment by itself —
          it protects users, evidence, and the admin involved.
        </p>
        <ul>
          <li>We may suspend access immediately where there is a risk to users, money, or data, and we may review accounts, devices, and logs as part of the investigation.</li>
          <li>Outcomes range from coaching and retraining to restriction, removal of admin access, and termination of any staff or contractor relationship.</li>
          <li>Serious misconduct — such as fraud, data theft, bribery, or evidence tampering — may be reported to law enforcement.</li>
          <li>When your access ends, you must return or destroy confidential material and stop using any admin tools immediately.</li>
          <li>You may raise a concern about another admin, or about a decision affecting you, without fear of retaliation.</li>
        </ul>
      </>
    ),
  },
]

const sections: TermsSection[] = [
  ...adminSections,
  ...allSections.filter((section) => ADMIN_IDS.includes(section.id as typeof ADMIN_IDS[number])),
].map((section, index) => ({ ...section, number: String(index + 1) }))

export const metadata: Metadata = {
  title: 'Terms & Conditions — Administrators',
  description:
    'Terms for AseHanta administrators and moderators: access security, fair moderation, payment verification, user-data confidentiality, conflicts of interest, audits, and removal of access.',
}

export default function TermsAdminPage() {
  return (
    <TermsLayout
      lang="en"
      role="admin"
      eyebrow="Terms &amp; Conditions — for Administrators"
      title="Terms for admins — use access carefully, fairly, and only for the job."
      subtitle="These terms apply to anyone with administrator, moderator, support, finance-verification, or other elevated access to AseHanta. They set out how to protect accounts, moderate fairly, verify payments, handle user data, avoid conflicts of interest, and stay accountable."
      updated="Last updated: October 2026"
      summary={{
        title: 'The short version for admins',
        points: [
          'Admin access is limited to what your role needs — never browse out of curiosity.',
          'Keep your account secure, use two-factor authentication, and never share credentials.',
          'Moderate consistently, document decisions, and step aside from conflicts of interest.',
          'Verify every payment against real records; never use a personal account.',
          'User data is confidential and may only be used for a legitimate task.',
          'Admin actions are logged and reviewed; misconduct can mean immediate removal.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          By using AseHanta&apos;s admin tools you accept these administrator terms. If an action is not clearly
          allowed, ask before you act.
          <Link
            href="/terms"
            className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95"
          >
            Read the general terms
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Handling a concern about an admin? Contact the support team through the{' '}
            <Link href="/contact" className="font-medium text-[#1D4ED8] hover:underline">contact page</Link>.
          </p>
        </>
      }
    />
  )
}
