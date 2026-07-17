import Link from 'next/link'
import { APP_NAME } from '@/lib/constants'

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-sm text-gray-700 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Terms &amp; Conditions</h1>
      <p className="text-xs text-gray-500">Last updated: July 2026</p>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
        <p>By creating an account on {APP_NAME}, you agree to be bound by these Terms &amp; Conditions. If you do not agree, do not use the platform.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">2. User Accounts</h2>
        <p>You are responsible for maintaining the confidentiality of your login credentials. You must provide accurate information during registration. {APP_NAME} reserves the right to suspend or terminate accounts that violate these terms.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Roles &amp; Payments</h2>
        <p><strong>Hunters</strong> pay a hunting fee to book viewings. Payments are held in escrow for 24 hours. Hunters may release funds to the lister or request an 85% refund. A report must be submitted for refunds.</p>
        <p className="mt-2"><strong>Listers</strong> earn 70% of the hunting fee. The remaining 30% covers platform costs. Listers must provide accurate listing information.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Escrow &amp; Refunds</h2>
        <p>All hunting fees are held in escrow for 24 hours. Funds are automatically released after this period unless a refund is requested. Refunds are 85% of the paid amount. 100% refunds are available for fake listings or host no-shows.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Cookie Policy</h2>
        <p>{APP_NAME} uses cookies and similar technologies to maintain your session and authenticate your identity. By using the platform, you consent to our use of cookies as described in this policy.</p>
        <p className="mt-2">You may decline cookies, but this will result in session-only authentication — you will need to log in each time you visit.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Prohibited Conduct</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Posting fake or misleading listings</li>
          <li>Harassing other users</li>
          <li>Attempting to bypass the escrow system</li>
          <li>Using the platform for any illegal purpose</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Limitation of Liability</h2>
        <p>{APP_NAME} acts as an intermediary between hunters and listers. We are not responsible for the condition of listed properties or the conduct of users. Our liability is limited to the amount of the hunting fee paid.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Changes to Terms</h2>
        <p>We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact</h2>
        <p>For questions about these terms, contact us at <a href="mailto:asehanta@gmail.com" className="text-blue-600 hover:underline">asehanta@gmail.com</a>.</p>
      </section>

      <div className="pt-4">
        <Link href="/auth/signup" className="text-blue-600 hover:underline text-sm">&larr; Back to Sign Up</Link>
      </div>
    </div>
  )
}
