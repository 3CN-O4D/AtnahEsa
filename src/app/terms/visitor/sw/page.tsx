import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/sw/page'

const VISITOR_IDS = [
  'utangulizi',
  'nyumba-zilizochukuliwa',
  'mawasiliano',
  'faragha',
  'usalama',
  'tabia-zilizokatazwa',
  'haki-miliki',
  'dhima',
  'mizozo',
  'mabadiliko',
  'mawasiliano-yetu',
] as const

const browsing: TermsSection = {
  id: 'kuvinjari',
  number: '1',
  title: 'Kuvinjari Bila Akaunti',
  body: (
    <>
      <p>
        Huhitaji akaunti kuvinjari AseHanta. Unaweza kufungua ukurasa wa mwanzo, kutafuta kwa eneo, kuchuja kwa kodi
        au aina ya nyumba, na kusoma maelezo ya tangazo na sheria za nyumba bila kuingia. Kuvinjari ni bure, na
        kuangalia tangazo pekee hakuundi uwekaji nafasi wala wajibu wa malipo.
      </p>
      <ul>
        <li>Picha, bei, upatikanaji na maelezo ya tangazo huonyeshwa kwa taarifa ili uamue kama nyumba inafaa kuutazamwa.</li>
        <li>Maelezo ya mawasiliano ya mmiliki hubaki yamefungwa hadi uwe na uwekaji nafasi unaotumika. Hili hulinda wamiliki dhidi ya barua taka na hulinda watafuta nyumba dhidi ya kushurutishwa kulipa nje ya jukwaa.</li>
        <li>Baadhi ya vitendo — kuhifadhi nyumba unazozipenda, kuweka nafasi ya utazamo, kuacha tathmini, au kuorodhesha nyumba — huhitaji akaunti na vinasimamiwa na masharti ya mtafuta nyumba au ya mmiliki.</li>
        <li>Kama unavinjari tu, sheria kuu zinazokuhusu ni zile zilizo katika toleo hili la mgeni: matumizi ya haki, faragha, usalama, haki miliki, na dhima.</li>
      </ul>
    </>
  ),
}

const sections: TermsSection[] = [
  browsing,
  ...allSections.filter((section) => VISITOR_IDS.includes(section.id as typeof VISITOR_IDS[number])),
].map((section, index) => ({ ...section, number: String(index + 1) }))

export const metadata: Metadata = {
  title: 'Sheria na Masharti — Wageni',
  description:
    'Masharti kwa watu wanaovinjari AseHanta bila akaunti: unachoweza kuona, jinsi data yako inavyoshughulikiwa, sheria za matumizi ya haki, na kwa nini mawasiliano ya mmiliki hufungwa hadi uweke nafasi.',
}

export default function TermsVisitorPageSw() {
  return (
    <TermsLayout
      lang="sw"
      role="visitor"
      eyebrow="Sheria na Masharti — kwa Wageni"
      title="Masharti kwa wageni — vinjari kwa uhuru, ukiwa na sheria zilizo wazi."
      subtitle="Masharti haya yanatumika unapovinjari AseHanta kuchunguza nyumba bila kuweka nafasi ya utazamo au kuorodhesha nyumba. Yanaeleza unachoweza kuona, jinsi data yako inavyoshughulikiwa, na sheria za matumizi ya haki zinazoweka jukwaa salama kwa kila mtu."
      updated="Imesasishwa mwisho: Oktoba 2026"
      summary={{
        title: 'Muhtasari wa haraka kwa wageni',
        points: [
          'Kuvinjari nyumba ni bure na hakuhitaji akaunti.',
          'Unaweza kusoma bei, picha, sheria za nyumba na upatikanaji bila kuingia.',
          'Mawasiliano ya mmiliki hufunguliwa tu kwa uwekaji nafasi uliothibitishwa, kamwe si kwa kuvinjari pekee.',
          'Hatuuzi data yako; vidakuzi na uchambuzi hutumika kuweka tovuti ikifanya kazi na kuiboresha.',
          'Maandishi na picha za tangazo ni mali ya wamiliki wake — usizikokote au kuzichapisha tena.',
          'Nyumba zilizochukuliwa huhifadhi maandishi yake lakini picha zake huondolewa saa 48 baada ya kuwekwa alama ya kuchukuliwa.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          Kwa kuendelea kuvinjari AseHanta unakubali masharti haya ya mgeni na ahadi zetu za faragha.
          <Link
            href="/"
            className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95"
          >
            Vinjari nyumba zinazopatikana
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Unapanga kuweka nafasi au kuorodhesha? Soma{' '}
            <Link href="/terms/hunter/sw" className="font-medium text-[#1D4ED8] hover:underline">masharti ya mtafuta nyumba</Link> au{' '}
            <Link href="/terms/lister/sw" className="font-medium text-[#1D4ED8] hover:underline">masharti ya mmiliki</Link>.
          </p>
        </>
      }
    />
  )
}
