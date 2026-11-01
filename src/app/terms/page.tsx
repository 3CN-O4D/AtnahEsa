import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description:
    'The full, plain-English terms that govern your use of AseHanta — bookings, escrow, payouts, refunds, privacy and more.',
}

export const sections: TermsSection[] = [
  {
    id: 'introduction',
    number: '1',
    title: 'Introduction — What You Are Agreeing To',
    body: (
      <>
        <p>
          Welcome to AseHanta. These Terms &amp; Conditions (&ldquo;Terms&rdquo;) form a legally binding agreement
          between you (whether you use the platform as a house hunter, a lister, or simply a visitor) and AseHanta,
          the company behind the platform. The words <strong>&ldquo;we&rdquo;</strong>, <strong>&ldquo;us&rdquo;</strong>
          and <strong>&ldquo;our&rdquo;</strong> refer to AseHanta; the words <strong>&ldquo;you&rdquo;</strong> and
          <strong> &ldquo;your&rdquo;</strong> refer to the person reading and using the platform.
        </p>
        <p>
          By creating an account, paying a booking fee, listing a house, or simply continuing to browse this website,
          you confirm that you have read, understood, and accepted these Terms in full. If you do not agree with any
          part of them, please do not use the platform. These Terms work together with our Privacy commitments, our
          refund rules and any other policies we publish, all of which form one set of rules that apply every time you
          use AseHanta.
        </p>
        <p>In these Terms, the following words mean:</p>
        <ul>
          <li><strong>Platform</strong> — the AseHanta website, applications and services, available at asehanta.com.</li>
          <li><strong>House Hunter (Hunter)</strong> — a user who searches for, books and views properties.</li>
          <li><strong>Lister</strong> — a user who publishes a property on the platform, also called the house owner or agent.</li>
          <li><strong>Listing</strong> — a property advertisement published by a lister.</li>
          <li><strong>Booking Fee</strong> — the escrow-protected amount a hunter pays to book a viewing.</li>
          <li><strong>Escrow</strong> — the safe-holding arrangement in which your booking fee is kept until a viewing is confirmed or a dispute is resolved.</li>
          <li><strong>Viewing</strong> — the agreed visit by the hunter to see the listed property.</li>
          <li><strong>Taken House</strong> — a property that has been booked and viewed, and whose status is now &ldquo;taken&rdquo; rather than available.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'account',
    number: '2',
    title: 'Eligibility and Your Account',
    body: (
      <>
        <p>
          To use most parts of the platform you must be at least <strong>18 years old</strong> and legally able to
          enter into binding agreements under the laws of the Republic of Kenya. By registering you promise that the
          details you provide — your name, phone number, email address and role — are true, accurate and up to date.
        </p>
        <ul>
          <li>You may hold <strong>one account</strong>; creating duplicate accounts to avoid restrictions or to boost listings is not allowed.</li>
          <li>You are responsible for keeping your login details private. Never share your password, and tell us immediately if you suspect someone else has accessed your account.</li>
          <li>Accounts cannot be transferred, sold, or given to another person.</li>
          <li>If your account has no activity for a long time, we may suspend or close it and contact you first.</li>
          <li>You remain responsible for everything that happens under your account while it is in use.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'hunter',
    number: '3',
    title: 'House Hunters — Your Responsibilities',
    body: (
      <>
        <p>
          As a hunter you are here to find a home, and we want that to be easy and fair for everyone involved. That
          starts with treating every booking request as a real commitment, not a casual click.
        </p>
        <ul>
          <li>Only request viewings for properties you are genuinely interested in. Unserious requests waste the lister&apos;s time and slow down genuine hunters.</li>
          <li>Show up on time for approved viewings. If you cannot make it, contact the lister or support <strong>before</strong> the agreed time so the lister is not left waiting.</li>
          <li>Treat the property and the lister with respect during the viewing. You are a guest in someone&apos;s home.</li>
          <li>Do not use a booking to gain a lister&apos;s contact details and then try to arrange the same deal privately, off-platform. That bypasses the escrow protection that keeps both sides safe.</li>
          <li>Repeated no-shows, cancellations, or unserious requests may result in a refund review, a warning, or suspension of your account.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'lister',
    number: '4',
    title: 'Listers — Your Responsibilities',
    body: (
      <>
        <p>
          As a lister you are promising hunters an accurate picture of a real, available property. Your listing is the
          first thing a hunter sees, and your honesty is what makes the platform trustworthy.
        </p>
        <ul>
          <li>Every detail you publish — price, rent, location, photos, videos, amenities, and availability — must be truthful and current. Photos must be of the actual property you are listing.</li>
          <li>Update or withdraw your listing the moment the property becomes unavailable or its details change.</li>
          <li>Respond to viewing requests within <strong>48 hours</strong> and honour viewings you have approved.</li>
          <li>Show up for approved viewings on time. If a lister does not show up for an approved viewing, the hunter may be entitled to a <strong>100% refund</strong> of the booking fee.</li>
          <li>Disclose known issues — water supply, security, neighbourhood noise, pending repairs — honestly and in advance.</li>
          <li>Deliberately misleading or fake listings will be removed, and may lead to suspension and forfeiture of unpaid earnings.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'escrow',
    number: '5',
    title: 'Bookings and the Escrow Process',
    body: (
      <>
        <p>
          When a hunter books a viewing, the booking fee is paid through our payment partner (M-Pesa via Safaricom)
          and held in <strong>escrow</strong>. Holding the money this way protects both sides: the lister knows the
          hunter is serious, and the hunter knows their money is safe until the viewing has actually happened.
        </p>
        <ul>
          <li>After payment, a <strong>24-hour view window</strong> begins in which the hunter is expected to visit the property.</li>
          <li>During the view window, the hunter unlocks the lister&apos;s contact details so the two parties can coordinate the visit directly.</li>
          <li>After the viewing, the hunter confirms on the platform whether they were satisfied or not. The money is not released to either side until the hunter has answered.</li>
          <li>If the hunter reports a problem, the escrow remains frozen and an <strong>admin reviews the case</strong>. The admin may contact both the hunter and the lister before making a decision, and will record what happened.</li>
          <li>No money moves — to the lister or back to the hunter — until an admin has recorded the outcome with the required proof.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'payments',
    number: '6',
    title: 'Payments, Payouts and Refunds',
    body: (
      <>
        <p>
          <strong>When you are satisfied.</strong> If the viewing went well and you confirm you are pleased, the
          lister is paid their share of the booking fee. That payout is recorded only after an admin verifies the
          transfer using the M-Pesa message you paste as proof. The lister&apos;s share is a fixed proportion of the
          booking fee, and the remainder covers the platform&apos;s service and payment-processing costs.
        </p>
        <p>
          <strong>When things go wrong.</strong> If the viewing does not go well, you can tell us what happened and an
          admin will review the case with both parties. Depending on what occurred, the hunter is refunded a proportion
          of the booking fee:
        </p>
        <ul>
          <li><strong>100% refund</strong> — when the lister did not show up, or the listing turned out to be fake or fundamentally different from what was advertised.</li>
          <li><strong>85% refund</strong> — when the viewing took place but the house did not match the listing and you were genuinely displeased.</li>
          <li><strong>50% refund</strong> — when both the hunter and the lister share blame for what went wrong.</li>
        </ul>
        <p>
          Refunds are recorded only after an admin verifies the M-Pesa refund message pasted as proof, and the amount
          in the message must match the agreed percentage exactly. After a refund, the admin also decides what happens
          to the house — it can go back onto the listings for other hunters, be removed, or stay in its current state.
        </p>
        <p>
          Please remember that refunds and payouts depend on M-Pesa processing times, which are controlled by the
          payment provider and can occasionally take longer than expected.
        </p>
      </>
    ),
  },
  {
    id: 'taken',
    number: '7',
    title: 'Taken Houses and Media Retention',
    body: (
      <>
        <p>
          Once a house has been viewed and booked, it is marked as <strong>taken</strong> and no longer shows as
          available. This protects everyone: it tells other hunters the house is no longer open for bookings, and it
          reflects the true state of the property.
        </p>
        <ul>
          <li>To keep storage costs manageable and the platform fast, the photos and videos of a taken house are <strong>deleted from our media storage 48 hours</strong> after the house is marked taken.</li>
          <li>The listing itself stays visible with a &ldquo;taken&rdquo; badge so the history of the property is preserved.</li>
          <li>If you are the lister and need to reuse your media later, save copies of your photos and videos before that 48-hour window closes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'conduct',
    number: '8',
    title: 'Communication and Conduct',
    body: (
      <>
        <p>
          AseHanta connects real people, and every conversation should be professional and respectful. When the
          platform shares your contact details with the other party, it does so only in the context of the property
          you are dealing with.
        </p>
        <ul>
          <li>Use the platform for its intended purpose: finding, listing, booking and viewing homes.</li>
          <li>Do not spam, harass, threaten, or mislead anyone, whether on the platform or after you have exchanged contact details.</li>
          <li>Keep all payments inside the platform. Transactions agreed off-platform are <strong>not protected by escrow</strong>, and we cannot help you recover money paid outside the system.</li>
          <li>Report abusive or suspicious users to support rather than responding in kind.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'privacy',
    number: '9',
    title: 'Privacy and Your Data',
    body: (
      <>
        <p>
          We collect the information we need to run the platform: your name, phone number, email address, the details
          you add to your account, and records of your bookings, payments and messages. We use this information to
          manage your account, process payments, send you booking and payment notifications, and improve the service.
        </p>
        <ul>
          <li>Your contact details are shared with the other party <strong>only when there is an active booking or viewing</strong> between you.</li>
          <li>Transactional notifications are sent <strong>only to the people involved</strong> in that transaction — a hunter only sees notifications about their own bookings, and a lister only about their own houses.</li>
          <li>We never sell your email address, phone number, or personal name to third parties.</li>
          <li>We may use aggregated, anonymous data to understand how the platform is used and to improve it.</li>
          <li>You can request full deletion of your account and data at any time by contacting support. Deleting a lister account also removes your active listings.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'security',
    number: '10',
    title: 'Security',
    body: (
      <>
        <p>
          Protecting your information is part of protecting the platform. We follow widely accepted security
          practices, and we also rely on you to do your part.
        </p>
        <ul>
          <li>Passwords are stored with industry-standard hashing — never in plain text.</li>
          <li>Database access is controlled by row-level security so your private data is visible only to you and authorised staff.</li>
          <li>API endpoints enforce authentication and rate limiting to prevent automated abuse.</li>
          <li>Payment details and M-Pesa messages are used solely to verify bookings, payouts and refunds.</li>
          <li>You should use a strong, unique password and never share your login details. If you believe your account has been compromised, contact us immediately.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'prohibited',
    number: '11',
    title: 'Prohibited Behaviour and Enforcement',
    body: (
      <>
        <p>You agree never to use the platform to:</p>
        <ul>
          <li>Create fake accounts, fake listings, or fake reviews that mislead other users.</li>
          <li>Scam, defraud, or attempt to defraud other users or the platform.</li>
          <li>Circumvent booking fees, escrow, or our payment process.</li>
          <li>Collect user data (scraping) or otherwise abuse the platform&apos;s systems and APIs.</li>
          <li>Post illegal content or use the platform for any unlawful purpose.</li>
          <li>Impersonate other people, businesses, or AseHanta staff.</li>
        </ul>
        <p>
          Depending on the severity, we may warn you, remove content, suspend your account, or terminate it
          permanently. Where fraud is involved, held funds may be forfeited and we may report the matter to the
          authorities. Our enforcement decisions are made fairly and can be discussed with our support team.
        </p>
      </>
    ),
  },
  {
    id: 'ip',
    number: '12',
    title: 'Intellectual Property and Content',
    body: (
      <>
        <p>
          The AseHanta name, logo, design and platform code are our property (or our licensors&apos;). Nothing in
          these Terms gives you any right to copy, reproduce, or reuse them without permission.
        </p>
        <p>
          When you add content to the platform — such as a listing, photos, or a video tour — you keep ownership of
          that content, but you grant us a licence to host, display, and distribute it on the platform for the purpose
          of running the service. You promise that the content you upload is yours to share and does not infringe
          anyone else&apos;s rights. We will remove content when asked where the law requires it or where it clearly
          violates these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    number: '13',
    title: 'Liability and Disclaimers',
    body: (
      <>
        <p>
          AseHanta is an <strong>intermediary platform</strong>. We provide the marketplace, the escrow protection and
          the tools, but we are not the landlord and we are not the tenant. The rental contract, if any, is between
          the hunter and the lister, and we are not a party to it.
        </p>
        <ul>
          <li>We review listings and user reports to keep the platform safe, but we cannot guarantee that every listing is perfect, and we are not liable for the acts or omissions of individual users.</li>
          <li>We do our best to keep the platform available and accurate, but we do not guarantee that it will be uninterrupted or free from errors.</li>
          <li>To the maximum extent permitted by law, our total liability for any claim arising from your use of the platform is limited to the booking fees you actually paid us in connection with that claim.</li>
          <li>We are not responsible for delays caused by third parties such as payment providers, telecom networks, or hosting services.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'disputes',
    number: '14',
    title: 'Dispute Resolution',
    body: (
      <>
        <p>
          We hope disagreements are rare, and we try to resolve them quickly and fairly. The escrow review process
          described in section 6 is the first and primary way booking disputes are settled, and an admin&apos;s
          decision, once recorded, closes that specific case.
        </p>
        <ul>
          <li>Contact our support team first — most issues are resolved with a short conversation.</li>
          <li>If we cannot resolve a dispute informally, it will be governed by the laws of the Republic of Kenya, and the courts of Eldoret, Kenya shall have jurisdiction.</li>
          <li>Any claim must be brought within twelve months of the event that gave rise to it, unless the law says otherwise.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'changes',
    number: '15',
    title: 'Changes to These Terms',
    body: (
      <>
        <p>
          The platform grows, and these Terms may need to grow with it. We will post any changes on this page and,
          for changes that significantly affect you, we will notify you in advance through an in-app notification or
          email before the new version takes effect.
        </p>
        <p>
          If you continue using the platform after updated Terms are published, you accept the new version. If you do
          not agree with the changes, you are free to stop using the platform and close your account.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    number: '16',
    title: 'Termination',
    body: (
      <>
        <p>
          You may stop using the platform and close your account at any time by contacting support. When an account is
          closed, your active listings are removed, and any escrow funds relating to ongoing bookings are handled
          according to the relevant booking&apos;s status at that time.
        </p>
        <p>
          We may suspend or terminate your access if you breach these Terms, if your conduct harms other users, or if
          continued access would expose us or others to unreasonable risk. Termination for serious violations may be
          immediate and without prior notice, but it never removes your legal rights to money you are genuinely owed.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    number: '17',
    title: 'Contact',
    body: (
      <>
        <p>
          Questions, feedback, and support requests are always welcome. The fastest way to reach us is through the
          contact options below, and we aim to respond within two working days.
        </p>
        <ul>
          <li><strong>Email:</strong> asehanta@gmail.com</li>
          <li><strong>Phone / WhatsApp:</strong> +254 748 275 079</li>
          <li><strong>Location:</strong> Eldoret, Kenya</li>
          <li><strong>Report a bug or abuse:</strong> use the &ldquo;Report a bug&rdquo; link in the site menu, and mention the listing or booking concerned.</li>
        </ul>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <TermsLayout
      lang="en"
      eyebrow="Terms &amp; Conditions"
      title="Find a home you'll love — and know exactly what you're agreeing to."
      subtitle="These Terms explain, in plain language, how AseHanta works: how bookings and escrow protect you, how payouts and refunds are decided, what we expect from hunters and listers, and how your data is handled."
      updated="Last updated: October 2026"
      summary={{
        title: 'The short version',
        points: [
          'Your booking fee is held in escrow until the viewing happens — nobody is paid before you confirm.',
          'Satisfied with the viewing? The lister gets their payout, verified by an M-Pesa receipt.',
          'Problem with the viewing? You can get 100%, 85% or 50% back depending on what happened.',
          'Your data is only ever shared with the people involved in your booking, never sold.',
          'Taken houses have their photos deleted from storage 48 hours after they are marked taken.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          By creating an account or using the platform, you agree to these Terms and our Privacy commitments.
          <Link href="/auth/signup" className="mt-3 inline-block rounded-xl bg-[#30B54A] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/25 transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95">
            Create an account
          </Link>
        </>
      }
    />
  )
}
