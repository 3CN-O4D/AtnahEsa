import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'
import { sections as allSections } from '@/app/terms/sw/page'

const ADMIN_IDS = ['dhima', 'mizozo', 'mabadiliko', 'mawasiliano-yetu'] as const

const adminSections: TermsSection[] = [
  {
    id: 'admin-wigo',
    number: '1',
    title: 'Nani Anahusika na Masharti Haya',
    body: (
      <>
        <p>
          Masharti haya yanahusu mtu yeyote anayepewa ufikiaji wa msimamizi, msimamizi wa maudhui (moderator),
          usaidizi, uthibitishaji wa fedha, au ufikiaji mwingine wowote wa juu wa zana na data za ndani za AseHanta.
          Ufikiaji wa msimamizi ni jukumu, si fahari. Upo ili matangazo yabaki ya kweli, malipo yabaki sahihi, na
          watumiaji wabaki salama — kamwe si ili kumpa aliye nao faida.
        </p>
        <p>
          Kama wewe ni msimamizi, masharti haya ya jukumu yanatumika <strong>zaidi ya</strong> Sheria na Masharti ya
          jumla. Pale masharti haya ni makali zaidi kuliko ya jumla, haya ndiyo yanayotumika. Kama huna uhakika kama
          kitendo kinaruhusiwa, uliza kabla ya kuchukua hatua.
        </p>
      </>
    ),
  },
  {
    id: 'admin-ufikiaji',
    number: '2',
    title: 'Ufikiaji wa Msimamizi na Usalama wa Akaunti',
    body: (
      <>
        <p>
          Akaunti yako ya msimamizi ni ufunguo wa data binafsi na fedha za watu wengine. Itunze kwa uangalifu zaidi
          kuliko akaunti zako binafsi.
        </p>
        <ul>
          <li>Tumia akaunti yako ya msimamizi yenye jina lako. Kamwe usishiriki vitambulisho, kutumia kipindi cha mtu mwingine, au kumruhusu mtu mwingine kuchukua hatua kupitia kuingia kwako.</li>
          <li>Tumia nenosiri imara na la kipekee pamoja na kidhibiti cha nenosiri, na washa uthibitishaji wa hatua mbili pale inapopatikana.</li>
          <li>Fikia tu rekodi ambazo jukumu lako linahitaji kwa kazi iliyo mbele yako. Usivinjari data ya msimamizi kwa udadisi.</li>
          <li>Kamwe usiunde akaunti za majaribio za msimamizi, milango ya siri, au kuingia za ziada bila idhini ya maandishi kutoka kwa kiongozi wa usalama.</li>
          <li>Usiache kipindi cha msimamizi kikiwa wazi kwenye kifaa kinachotumiwa na wengine au cha umma, na funga skrini yako unapotoka.</li>
          <li>Ripoti kifaa kilichopotea, tuhuma ya kuingiwa bila idhini, au ufichuzi wa bahati mbaya mara moja — haraka hupunguza madhara.</li>
          <li>Ufikiaji hupitiwa mara kwa mara na unaweza kupunguzwa au kuondolewa jukumu lako linapobadilika.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-usimamizi',
    number: '3',
    title: 'Usimamizi na Maamuzi ya Haki',
    body: (
      <>
        <p>
          Usimamizi hulinda watumiaji dhidi ya matangazo ya uongo, unyanyasaji, na ulaghai. Lazima uwe wa kutabirika,
          thabiti, na usiwe na upendeleo.
        </p>
        <ul>
          <li>Pitia matangazo, ripoti, migogoro, na akaunti kwa haraka, ukitumia sheria zilizochapishwa badala ya maoni binafsi.</li>
          <li>Tumia kiwango kimoja kwa kila mtu, bila kujali mtumiaji ni nani, tangazo lina umaarufu kiasi gani, au kama unamfahamu.</li>
          <li>Rekodi uamuzi na sababu yake, ili msimamizi mwingine aweze kuuelewa na kuupitia baadaye.</li>
          <li>Mwambie mtumiaji kwa uwazi kwa nini maudhui yaliondolewa au akaunti ilizuiliwa, isipokuwa kufanya hivyo kutahatarisha uchunguzi au kuweka mtu hatarini.</li>
          <li>Kamwe usisimamie tangazo lako, la ndugu yako, au akaunti ya rafiki yako. Mpe msimamizi mwingine.</li>
          <li>Kamwe usitumie mamlaka ya usimamizi kulipiza kisasi, kumaliza mgogoro binafsi, au kupata faida kwako au kwa mtu mwingine.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-malipo',
    number: '4',
    title: 'Uthibitishaji wa Malipo na Escrow',
    body: (
      <>
        <p>
          Fedha zilizohifadhiwa (escrow) ni mali ya wale waliokuja kuzilipa. Hatua za msimamizi kuhusu malipo lazima
          zitokane na ushahidi, si imani au urahisi.
        </p>
        <ul>
          <li>Thibitisha risiti za M-Pesa, misimbo ya miamala, kiasi, na tarehe dhidi ya rekodi halisi ya malipo kabla ya kuweka alama ya malipo kwenye uwekaji nafasi.</li>
          <li>Kamwe usimwombe mtumiaji kutuma fedha kwa nambari binafsi, na kamwe usipokee malipo nje ya akaunti iliyochapishwa ya AseHanta.</li>
          <li>Usitoa, usirudishe, au kurekebisha fedha za escrow kwa mkono bila ushahidi wa maandishi na, inapohitajika, mkaguzi wa pili.</li>
          <li>Peleka kwa kiongozi wa fedha kiasi kisicholingana, risiti zilizorudiwa, marejesho ya kutatanisha, au shinikizo la kutoa fedha.</li>
          <li>Weka maelezo ya malipo ya kweli, na kamwe usinakili historia kamili ya miamala ya mtumiaji kwenye chaneli isiyoihitaji.</li>
          <li>Marejesho lazima yafuate sheria zilizochapishwa za marejesho na yaweze kufuatiliwa hadi muamala halisi na uamuzi halisi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-siri',
    number: '5',
    title: 'Usiri wa Data ya Watumiaji',
    body: (
      <>
        <p>
          Zana za msimamizi huonyesha majina, nambari za simu, ujumbe, rekodi za malipo, na wakati mwingine hati za
          utambulisho. Ufikiaji huo huazimwa kwa kazi mahususi, si kupewa kama dirisha la kudumu la maisha ya watu.
        </p>
        <ul>
          <li>Fungua rekodi ya mtumiaji tu pale kazi halisi ya usaidizi, usimamizi, ulaghai, au malipo inahitaji.</li>
          <li>Kamwe usishiriki, kunakili, kupiga picha ya skrini, kusambaza, au kujadili data ya mtumiaji nje ya chaneli za kazi zilizoidhinishwa.</li>
          <li>Usitafute mpenzi wa zamani, jirani, mtu maarufu, mwenzako, au wewe mwenyewe. Udadisi si sababu ya kikazi.</li>
          <li>Tumia zana zilizoidhinishwa pekee. Kamwe usihamishie data ya mtumiaji kwenye barua pepe binafsi, hifadhi ya wingu, madokezo, au programu za ujumbe.</li>
          <li>Fuata sheria za uhifadhi na ufutaji, na ripoti ufichuzi wa bahati mbaya mara moja ili uweze kudhibitiwa.</li>
          <li>Usiri unaendelea baada ya ufikiaji wako wa msimamizi kumalizika, bila kikomo cha muda.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-migongano',
    number: '6',
    title: 'Migongano ya Maslahi na Uadilifu',
    body: (
      <>
        <p>
          Hata mwonekano wa upendeleo huharibu imani katika jukwaa. Wasimamizi lazima waweke sheria za jukwaa
          mbele ya mahusiano binafsi na faida binafsi.
        </p>
        <ul>
          <li>Usitumie ufikiaji wa msimamizi kutangaza, kuidhinisha, kuhariri, au kusimamia nyumba yako, ya ndugu yako, au biashara unayonufaika nayo.</li>
          <li>Fichua uhusiano wowote binafsi au wa kifedha na mmiliki, mtafuta nyumba, nyumba, au mgogoro unaoombwa kuushughulikia, kisha jitoe.</li>
          <li>Usitumie taarifa za ndani — kuhusu mahitaji, ripoti, uchunguzi, au mabadiliko yajayo — kwa faida binafsi au kumsaidia mtu mwingine.</li>
          <li>Usipokee zawadi, upendeleo, punguzo, au malipo yanayoweza kuathiri uamuzi.</li>
          <li>Usiajiri, kupandisha cheo, au kumlinda mtu badala ya uaminifu au ukimya.</li>
          <li>Unapokuwa na shaka, fichua uhusiano na uache mtu huru maamuzi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-ukaguzi',
    number: '7',
    title: 'Ukaguzi, Kumbukumbu na Uwajibikaji',
    body: (
      <>
        <p>
          Hatua za msimamizi zinaweza kurekodiwa, kupitiwa, na kukaguliwa. Uwajibikaji ndio hufanya ufikiaji wa juu
          kuwa salama kwa kila mtu mwingine.
        </p>
        <ul>
          <li>Shirikiana kikamilifu na ukaguzi, uchunguzi, na maombi ya rekodi.</li>
          <li>Kamwe usifute, kubadilisha, kuficha, au kuzuia kumbukumbu, ujumbe, au ushahidi ili kuepuka ukaguzi.</li>
          <li>Hifadhi ushahidi katika migogoro, ripoti, na ulaghai unaoshukiwa hadi uambiwe hauhitajiki tena.</li>
          <li>Weka maamuzi na sababu zake katika mfumo ulioidhinishwa, si kwenye ujumbe binafsi pekee.</li>
          <li>Ripoti tabia mbaya inayoshukiwa ya msimamizi mwingine kwa nia njema; kulipiza kisasi dhidi ya mtoa taarifa ni ukiukaji mkubwa wenyewe.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-tabia',
    number: '8',
    title: 'Tabia Zilizokatazwa kwa Wasimamizi',
    body: (
      <>
        <p>Kama msimamizi lazima kamwe usifanye yafuatayo:</p>
        <ul>
          <li>Kufikia data ya mtumiaji bila sababu halali ya kikazi.</li>
          <li>Kubadilisha tangazo, malipo, tathmini, au akaunti ili kunufaisha wewe au mtu mwingine.</li>
          <li>Kushiriki vitambulisho, viungo vya kipindi, picha za skrini za ndani, au taarifa binafsi za mtumiaji.</li>
          <li>Kufuta au kuhariri kumbukumbu za ukaguzi, ushahidi, au rekodi za matendo yako mwenyewe.</li>
          <li>Kunyanyasa, kutishia, kudhalilisha, au kubagua mtumiaji au mwenzako yeyote.</li>
          <li>Kujifanya mtumiaji, mmiliki, au mfanyakazi mwingine.</li>
          <li>Kukwepa vidhibiti vya usalama, hatua za uidhinishaji, au sheria ya mkaguzi wa pili.</li>
          <li>Kufuatilia shughuli za mtu kwa sababu binafsi, ikiwemo mpenzi, mpenzi wa zamani, au mtu unayemfahamu.</li>
          <li>Kupokea hongo, kitu cha kurudisha (kickback), au malipo yoyote nje ya jukwaa.</li>
          <li>Kulipiza kisasi dhidi ya mtu yeyote anayeripoti wasiwasi au anayekataa kuvunja sheria hizi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-kuondolewa',
    number: '9',
    title: 'Kusimamishwa, Uchunguzi na Kuondolewa kwa Ufikiaji',
    body: (
      <>
        <p>
          Ufikiaji wa msimamizi unaweza kusimamishwa haraka wakati wasiwasi unachunguzwa. Kusimamishwa si adhabu
          yenyewe — hulinda watumiaji, ushahidi, na msimamizi anayehusika.
        </p>
        <ul>
          <li>Tunaweza kusimamisha ufikiaji mara moja pale kuna hatari kwa watumiaji, fedha, au data, na tunaweza kupitia akaunti, vifaa, na kumbukumbu kama sehemu ya uchunguzi.</li>
          <li>Matokeo yanaanzia kwenye mafunzo na mafunzo upya hadi kwenye kizuizi, kuondolewa kwa ufikiaji wa msimamizi, na kumalizwa kwa uhusiano wowote wa mfanyakazi au mkandarasi.</li>
          <li>Tabia mbaya kubwa — kama ulaghai, wizi wa data, hongo, au kuchezea ushahidi — inaweza kuripotiwa kwa mamlaka za sheria.</li>
          <li>Ufikiaji wako unapokamilika, lazima urejeshe au kuharibu nyenzo za siri na uache kutumia zana zozote za msimamizi mara moja.</li>
          <li>Unaweza kuibua wasiwasi kuhusu msimamizi mwingine, au kuhusu uamuzi unaokugusa, bila hofu ya kulipizwa kisasi.</li>
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
  title: 'Sheria na Masharti — Wasimamizi',
  description:
    'Masharti kwa wasimamizi na wasimamizi wa maudhui wa AseHanta: usalama wa ufikiaji, usimamizi wa haki, uthibitishaji wa malipo, usiri wa data ya watumiaji, migongano ya maslahi, ukaguzi, na kuondolewa kwa ufikiaji.',
}

export default function TermsAdminPageSw() {
  return (
    <TermsLayout
      lang="sw"
      role="admin"
      eyebrow="Sheria na Masharti — kwa Wasimamizi"
      title="Masharti kwa wasimamizi — tumia ufikiaji kwa uangalifu, kwa haki, na kwa kazi pekee."
      subtitle="Masharti haya yanahusu mtu yeyote mwenye ufikiaji wa msimamizi, msimamizi wa maudhui, usaidizi, uthibitishaji wa fedha, au ufikiaji mwingine wa juu wa AseHanta. Yanaeleza jinsi ya kulinda akaunti, kusimamia kwa haki, kuthibitisha malipo, kushughulikia data ya watumiaji, kuepuka migongano ya maslahi, na kuwajibika."
      updated="Imesasishwa mwisho: Oktoba 2026"
      summary={{
        title: 'Muhtasari wa haraka kwa wasimamizi',
        points: [
          'Ufikiaji wa msimamizi ni kwa kazi yako pekee — kamwe usivinjari kwa udadisi.',
          'Linda akaunti yako, tumia uthibitishaji wa hatua mbili, na kamwe usishiriki vitambulisho.',
          'Simamia kwa uthabiti, rekodi maamuzi, na jitoe kwenye migongano ya maslahi.',
          'Thibitisha kila malipo dhidi ya rekodi halisi; kamwe usitumie akaunti binafsi.',
          'Data ya mtumiaji ni siri na inaweza kutumika kwa kazi halali pekee.',
          'Hatua za msimamizi hurekodiwa na kupitiwa; tabia mbaya inaweza kumaanisha kuondolewa mara moja.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          Kwa kutumia zana za msimamizi za AseHanta unakubali masharti haya ya msimamizi. Kama kitendo hakiruhusiwi
          kwa uwazi, uliza kabla ya kuchukua hatua.
          <Link
            href="/terms/sw"
            className="mt-3 inline-block rounded-xl bg-[#30B54A] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/25 transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95"
          >
            Soma sheria na masharti ya jumla
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Unashughulikia wasiwasi kuhusu msimamizi? Wasiliana na timu ya usaidizi kupitia{' '}
            <Link href="/contact" className="font-medium text-[#30B54A] hover:underline">ukurasa wa mawasiliano</Link>.
          </p>
        </>
      }
    />
  )
}
