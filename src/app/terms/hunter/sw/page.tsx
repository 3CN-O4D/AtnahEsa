import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/sw/page'

const HUNTER_IDS = [
  'utangulizi', 'akaunti', 'mtafuta', 'uhifadhi', 'malipo', 'nyumba-zilizochukuliwa',
  'mawasiliano', 'faragha', 'usalama', 'tabia-zilizokatazwa', 'haki-miliki', 'dhima',
  'mizozo', 'mabadiliko', 'kusitishwa', 'mawasiliano-yetu',
] as const

const sections: TermsSection[] = allSections
  .filter((s) => HUNTER_IDS.includes(s.id as typeof HUNTER_IDS[number]))
  .map((s, i) => ({ ...s, number: String(i + 1) }))

export const metadata: Metadata = {
  title: 'Masharti — Watafuta Nyumba',
  description:
    'Masharti kwa watafuta nyumba kwenye AseHanta: jinsi uwekaji nafasi na uhifadhi (escrow) vinavyokulinda, jinsi marejesho yanavyoamuliwa, na tunachotarajia kutoka kwako.',
}

export default function TermsHunterPageSw() {
  return (
    <TermsLayout
      lang="sw"
      role="hunter"
      eyebrow="Masharti — Watafuta Nyumba"
      title="Masharti kwa watafuta nyumba — tafuta, uangalie, na uingie makao kwa uaminifu."
      subtitle="Masharti haya yanaeleza, kwa lugha rahisi, tunachotarajia kutoka kwako mtafuta nyumba kwenye AseHanta: jinsi ada yako ya uwekaji nafasi huhifadhiwa (escrow), jinsi marejesho yanavyoamuliwa, na tunachotarajia kutoka kwako kabla, wakati, na baada ya utazamo."
      updated="Imesasishwa mara ya mwisho: Oktoba 2026"
      summary={{
        title: 'Muhtasari mfupi kwa watafuta nyumba',
        points: [
          'Ada yako ya uwekaji nafasi huhifadhiwa (escrow) hadi utazamo ufanyike — hakuna anayelipwa kabla hujathibitisha.',
          'Umeridhika na nyumba? Mmiliki anapokea malipo yake, yakithibitishwa na risiti ya M-Pesa.',
          'Kuna tatizo? Unaweza kupokea 100%, 85% au 50% kulingana na kilichotokea.',
          'Maelezo yako ya mawasiliano yanashirikiwa na mmiliki tu wakati kuna uwekaji nafasi.',
          'Nyumba zilizochukuliwa hufutwa picha zake kutoka kwenye hifadhi saa 48 baada ya kuwekwa alama.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          Kwa kuunda akaunti au kuweka nafasi ya utazamo, unakubali Masharti Haya na ahadi zetu za faragha.
          <Link
            href="/auth/signup"
            className="mt-3 inline-block rounded-xl bg-[#30B54A] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/25 transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95"
          >
            Unda akaunti
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Unahitaji toleo kamili? <Link href="/terms/sw" className="text-[#30B54A] hover:underline font-medium">Tazama Masharti Yote</Link> au{' '}
            <Link href="/terms/lister/sw" className="text-[#30B54A] hover:underline font-medium">masharti kwa wanaoorodhesha</Link>.
          </p>
        </>
      }
    />
  )
}
