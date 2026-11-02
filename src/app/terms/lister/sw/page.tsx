import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/sw/page'

const LISTER_IDS = [
  'utangulizi', 'akaunti', 'mmiliki', 'uhifadhi', 'malipo', 'nyumba-zilizochukuliwa',
  'mawasiliano', 'faragha', 'usalama', 'tabia-zilizokatazwa', 'haki-miliki', 'dhima',
  'mizozo', 'mabadiliko', 'kusitishwa', 'mawasiliano-yetu',
] as const

const sections: TermsSection[] = allSections
  .filter((s) => LISTER_IDS.includes(s.id as typeof LISTER_IDS[number]))
  .map((s, i) => ({ ...s, number: String(i + 1) }))

export const metadata: Metadata = {
  title: 'Masharti — Wanaoorodhesha Nyumba',
  description:
    'Masharti kwa wanaoorodhesha nyumba kwenye AseHanta: jinsi kuorodhesha kwa uaminifu, jinsi malipo yanaavyolipwa, na jinsi marejesho yanavyoamuliwa.',
}

export default function TermsListerPageSw() {
  return (
    <TermsLayout
      lang="sw"
      role="lister"
      eyebrow="Masharti — Wanaoorodhesha Nyumba"
      title="Masharti kwa wanaoorodhesha nyumba — orodhesha kwa uaminifu, ulipe kwa haki."
      subtitle="Masharti haya yanaeleza, kwa lugha rahisi, tunachotarajia kutoka kwako mmiliki au wakala kwenye AseHanta: jinsi kuweka tangazo la kweli na ya sasa, jinsi malipo yako yanaolipwa baada ya mtafuta athibitisha ridhiao, na jinsi marejesho yanavyoamuliwa."
      updated="Imesasishwa mara ya mwisho: Oktoba 2026"
      summary={{
        title: 'Muhtasari mfupi kwa wanaoorodhesha',
        points: [
          'Kila maelezo unayochapiah — bei, picha, na upatikanaji — lazima yawe ya kweli na ya sasa.',
          'Jibu maombi ya utazamo ndani ya saa 48 na utazame kwa wakati.',
          'Umalipwa baada ya mtafuta athibitisha ridhiao, yakithibitishwa na risiti ya M-Pesa.',
          'Kuna tatizo? Marejesho ni 100%, 85% au 50% kulingana na kilichotokea.',
          'Nyumba zilizochukuliwa hufutwa picha zake kutoka kwenye hifadhi saa 48 baada ya kuwekwa alama.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          Kwa kuunda akaunti au kuorodhesha nyumba, unakubali Masharti Haya na ahadi zetu za faragha.
          <Link
            href="/auth/signup"
            className="mt-3 inline-block rounded-xl bg-[#30B54A] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/25 transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95"
          >
            Unda akaunti
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Unahitaji toleo kamili? <Link href="/terms/sw" className="text-[#30B54A] hover:underline font-medium">Tazama Masharti Yote</Link> au{' '}
            <Link href="/terms/hunter/sw" className="text-[#30B54A] hover:underline font-medium">masharti kwa watafuta nyumba</Link>.
          </p>
        </>
      }
    />
  )
}
