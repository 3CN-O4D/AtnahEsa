import type { Metadata } from 'next'
import Link from 'next/link'
import TermsLayout, { type TermsSection } from '@/components/terms/TermsLayout'

export const metadata: Metadata = {
  title: 'Sheria na Masharti (Kiswahili)',
  description:
    'Masharti kamili, kwa Kiswahili rahisi, yanayosimamia matumizi yako ya AseHanta — uwekaji nafasi, uhifadhi wa pesa (escrow), malipo, marejesho, faragha na zaidi.',
}

export const sections: TermsSection[] = [
  {
    id: 'utangulizi',
    number: '1',
    title: 'Utangulizi — Unachokubaliana Nacho',
    body: (
      <>
        <p>
          Karibu AseHanta. Masharti Haya (&ldquo;Masharti&rdquo;) ni makubaliano ya kisheria kati yako (iwe unatumia
          huduma kama <strong>mtafuta nyumba</strong>, <strong>mmiliki wa nyumba (lister)</strong>, au kama mgeni wa
          tovuti) na AseHanta, kampuni inayoendesha huduma hii. Maneno <strong>&ldquo;sisi&rdquo;</strong> na{' '}
          <strong>&ldquo;yetu&rdquo;</strong> yamanisha AseHanta; maneno <strong>&ldquo;wewe&rdquo;</strong> na{' '}
          <strong>&ldquo;yako&rdquo;</strong> yamanisha mtu anayesoma na kutumia huduma hii.
        </p>
        <p>
          Kwa kuunda akaunti, kulipa ada ya uwekaji nafasi, kuorodhesha nyumba, au hata kuendelea kutumia tovuti hii,
          unathibitisha kwamba umesoma, umeelewa, na umekubali Masharti Haya kikamilifu. Kama hukubaliani na sehemu
          yoyote ya Masharti haya, tafadhali usitumie huduma. Masharti haya yanaungana na ahadi zetu za faragha,
          sheria zetu za marejesho, na sera nyingine zozote tunazochapisha — zote pamoja zinaunda kanuni zinazotumika
          kila unapotumia AseHanta.
        </p>
        <p>Katika Masharti Haya, maneno yafuatayo yamanisha:</p>
        <ul>
          <li><strong>Huduma (Platform)</strong> — tovuti ya AseHanta, programu na huduma zake, zinazopatikana kwenye asehanta.com.</li>
          <li><strong>Mtafuta Nyumba (Hunter)</strong> — mtumiaji anayetafuta, kuweka nafasi na kutazama nyumba.</li>
          <li><strong>Mmiliki (Lister)</strong> — mtumiaji anayechapisha nyumba kwenye huduma; pia anaitwa mwenye nyumba au wakala.</li>
          <li><strong>Tangazo (Listing)</strong> — matangazo ya nyumba yaliyochapishwa na mmiliki.</li>
          <li><strong>Ada ya Uwekaji Nafasi</strong> — kiasi kinacholipwa na mtafuta nyumba kuhifadhi nafasi ya kutazama.</li>
          <li><strong>Uhifadhi (Escrow)</strong> — mpangilio salama wa kuweka pesa yako ya uwekaji nafasi hadi utazamo ufanyike au mzozo usuluhishwe.</li>
          <li><strong>Utazamo (Viewing)</strong> — ziara iliyokubaliwa ya mtafuta nyumba kuona nyumba iliyoorodheshwa.</li>
          <li><strong>Nyumba Iliyochukuliwa</strong> — nyumba ambayo imewekwa nafasi na kuonyeshwa, na hali yake sasa ni &ldquo;imechukuliwa&rdquo; badala ya kupatikana.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'akaunti',
    number: '2',
    title: 'Sifa za Kujiunga na Akaunti Yako',
    body: (
      <>
        <p>
          Ili kutumia sehemu kubwa ya huduma, lazima uwe na umri wa angalau miaka <strong>18</strong> na uwe na haki
          ya kisheria ya kufanya makubaliano chini ya sheria za Jamhuri ya Kenya. Kwa kujisajili unaahidi kwamba
          maelezo unayotoa — jina lako, nambari ya simu, anwani ya barua pepe, na jukumu lako — ni ya kweli, sahihi na
          ya sasa.
        </p>
        <ul>
          <li>Unaweza kuwa na akaunti <strong>moja tu</strong>; kuunda akaunti nyingi ili kukwepa vikwazo au kupandisha tangazo haruhusiwi.</li>
          <li>Wewe ndiye unayewajibika kwa kuweka maelezo yako ya kuingia kwa siri. Kamwe usishiriki nenosiri lako, na utujulishe mara moja kama unashuku mtu mwingine ameingia kwenye akaunti yako.</li>
          <li>Akaunti haiwezi kuhamishiwa, kuuzwa, wala kutolewa kwa mtu mwingine.</li>
          <li>Kama akaunti yako haitatumika kwa muda mrefu, tunaweza kuisimamisha au kuifunga, lakini tutawasiliana nawe kwanza.</li>
          <li>Unawajibika kwa kila kinachotokea kwenye akaunti yako wakati inatumika.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mtafuta',
    number: '3',
    title: 'Watafuta Nyumba — Majukumu Yako',
    body: (
      <>
        <p>
          Kama mtafuta nyumba, uko hapa kupata makao, na tunataka iwe rahisi na ya haki kwa kila mtu. Hii huanza kwa
          kuchukulia kila ombi la uwekaji nafasi kama ahadi ya kweli, si kubofya tu.
        </p>
        <ul>
          <li>Omba kutazama nyumba ambazo una nia ya kweli nayo. Maombi yasiyo na umakini hupoteza muda wa mmiliki na kuchelewesha watafuta wengine wa kweli.</li>
          <li>Fika kwa wakati kwenye utazamo uliokubaliwa. Kama huwezi kufika, wasiliana na mmiliki au timu ya usaidizi <strong>kabla</strong> ya wakati uliokubaliwa ili mmiliki asisubiri bure.</li>
          <li>Heshimu nyumba na mmiliki wakati wa utazamo. Wewe ni mgeni nyumbani kwa mtu.</li>
          <li>Usitumie uwekaji nafasi kupata maelezo ya mawasiliano ya mmiliki kisha ujaribu kupanga mpango wa faragha nje ya huduma. Hilo hukwepa ulinzi wa uhifadhi (escrow) unaowalinda wote.</li>
          <li>Kutofika, kughairi, au maombi yasiyo ya umakini yanaweza kusababisha uhakiki wa marejesho, onyo, au kusimamishwa kwa akaunti yako.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mmiliki',
    number: '4',
    title: 'Wanaoorodhesha Nyumba — Majukumu Yako',
    body: (
      <>
        <p>
          Kama mmiliki (lister), unaahidi watafuta nyumba picha sahihi ya nyumba halisi inayopatikana. Tangazo lako
          ndilo jambo la kwanza mtafuta nyumba huona, na uaminifu wako ndio unaofanya huduma kuwa ya kuaminika.
        </p>
        <ul>
          <li>Kila maelezo unayochapisha — bei, kodi, eneo, picha, video, huduma zilizopo, na upatikanaji — lazima yawe ya kweli na ya sasa. Picha lazima ziwe za nyumba unayoiweka kwenye tangazo.</li>
          <li>Sasisha au uondoe tangazo lako mara tu nyumba inapopotea au maelezo yake yakibadilika.</li>
          <li>Jibu maombi ya utazamo ndani ya <strong>saa 48</strong> na utimize utazamo ulioukubali.</li>
          <li>Fika kwa wakati kwenye utazamo uliokubaliwa. Kama mmiliki hatafika kwenye utazamo uliokubaliwa, mtafuta nyumba anaweza kupata <strong>marejesho ya 100%</strong> ya ada ya uwekaji nafasi.</li>
          <li>Fichua matatizo unayojua — maji, usalama, kelele za jirani, matengenezo yanayosubiri — kwa uaminifu na mapema.</li>
          <li>Tangazo la udanganyifu au lisilo la kweli litaondolewa, na linaweza kusababisha kusimamishwa na kupoteza malipo yasiyolipwa.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'uhifadhi',
    number: '5',
    title: 'Kuhifadhi (Escrow) na Mchakato wa Uwekaji Pesa',
    body: (
      <>
        <p>
          Mtafuta nyumba anapoweka nafasi ya kutazama, ada hulipwa kupitia mshirika wetu wa malipo (M-Pesa ya
          Safaricom) na <strong>kuhifadhiwa (escrow)</strong>. Kuweka pesa kwa njia hii kunawalinda wote: mmiliki
          anajua mtafuta nyumba yuko tayari kwa dhati, na mtafuta nyumba anajua pesa zake ziko salama hadi utazamo
          ufanyike kwelikweli.
        </p>
        <ul>
          <li>Baada ya malipo, <strong>dirisha la saa 24 la kutazama</strong> linaanza, ambapo mtafuta nyumba anatarajiwa kutembelea nyumba.</li>
          <li>Wakati wa dirisha hili, mtafuta nyumba hufunguliwa maelezo ya mawasiliano ya mmiliki ili pande zote mbili ziratibu ziara moja kwa moja.</li>
          <li>Baada ya utazamo, mtafuta nyumba huthibitisha kwenye huduma kama ameridhika au la. Pesa haitolewi kwa upande wowote hadi mtafuta nyumba ajibu.</li>
          <li>Kama mtafuta nyumba aripoti tatizo, pesa hubakia kuhifadhiwa na <strong>msimamizi (admin) huchunguza kesi</strong>. Msimamizi anaweza kuwasiliana na mtafuta nyumba na mmiliki kabla ya kufanya uamuzi, na atarekodi kilichotokea.</li>
          <li>Hakuna pesa inayohamishwa — kwa mmiliki au kurudi kwa mtafuta nyumba — hadi msimamizi atakaporekodi matokeo pamoja na uthibitisho unaohitajika.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'malipo',
    number: '6',
    title: 'Malipo, Mlipaji (Payout) na Marejesho ya Pesa',
    body: (
      <>
        <p>
          <strong>Ukiridhika.</strong> Kama utazamo ulienda vizuri na ukathibitisha kwamba umeridhika, mmiliki wa
          nyumba hulipwa sehemu yake ya ada ya uwekaji nafasi. Mlipaji huo hurekodiwa tu baada ya msimamizi
          kuthibitisha uhamisho kwa kutumia ujumbe wa M-Pesa unaoubandika kama uthibitisho. Sehemu ya mmiliki ni
          asilimia maalum ya ada ya uwekaji nafasi, na iliyobaki inaendeleza gharama za huduma na usindikaji wa
          malipo.
        </p>
        <p>
          <strong>Kukiwa na tatizo.</strong> Kama utazamo haukuenda vizuri, unaweza kutuambia kilichotokea na
          msimamizi atachunguza kesi pamoja na pande zote mbili. Kulingana na kilichotokea, mtafuta nyumba anarudishiwa
          asilimia ya ada ya uwekaji nafasi:
        </p>
        <ul>
          <li><strong>Marejesho ya 100%</strong> — wakati mmiliki hakufika, au tangazo likawa la uwongo au tofauti kabisa na lile lililotangazwa.</li>
          <li><strong>Marejesho ya 85%</strong> — wakati utazamo ulifanyika lakini nyumba haikuwa kama ilivyotangazwa na hukufurahishwa kweli.</li>
          <li><strong>Marejesho ya 50%</strong> — wakati mtafuta nyumba na mmiliki wote wana hatia kwa kilichotokea.</li>
        </ul>
        <p>
          Marejesho yanarekodiwa tu baada ya msimamizi kuthibitisha ujumbe wa marejesho wa M-Pesa unaoubandika kama
          uthibitisho, na kiasi kilicho kwenye ujumbe lazima kilingane haswa na asilimia iliyokubaliwa. Baada ya
          marejesho, msimamizi pia huamua kinachofanyika kwa nyumba — inaweza kurejea kwenye orodha kwa watafuta
          wengine, kuondolewa, au kubaki katika hali yake ya sasa.
        </p>
        <p>
          Tafadhali kumbuka kwamba marejesho na malipo hutegemea muda wa usindikaji wa M-Pesa, ambao unadhibitiwa na
          mtoa huduma wa malipo na wakati mwingine unaweza kuchukua muda zaidi ya ilivyotarajiwa.
        </p>
      </>
    ),
  },
  {
    id: 'nyumba-zilizochukuliwa',
    number: '7',
    title: 'Nyumba Zilizochukuliwa na Uhifadhi wa Picha',
    body: (
      <>
        <p>
          Nyumba ikishatazamwa na kuwekwa nafasi, inawekwa alama ya <strong>imechukuliwa</strong> na haionyeshi tena
          kuwa inapatikana. Hili hulinda kila mtu: linawaambia watafuta wengine kwamba nyumba haifunguki tena kwa
          uwekaji nafasi, na linaonyesha hali halisi ya nyumba.
        </p>
        <ul>
          <li>Ili kupunguza gharama za uhifadhi na kuweka huduma iwe ya haraka, picha na video za nyumba iliyochukuliwa <strong>hufutwa kutoka kwenye hifadhi ya media saa 48 baada</strong> ya nyumba kuwekwa alama ya kuchukuliwa.</li>
          <li>Tangazo lenyewe hubakia kuonekana likiwa na beji ya &ldquo;imechukuliwa&rdquo; ili historia ya nyumba ihifadhiwe.</li>
          <li>Kama wewe ndiye mmiliki na unahitaji kutumia picha zako tena, hifadhi nakala za picha na video zako kabla ya dirisha hilo la saa 48 kufunga.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mawasiliano',
    number: '8',
    title: 'Mawasiliano na Mwenendo',
    body: (
      <>
        <p>
          AseHanta inaunganisha watu halisi, na kila mazungumzo yanapaswa kuwa ya kitaalamu na yenye heshima. Huduma
          inaposhiriki maelezo yako ya mawasiliano na upande mwingine, hufanya hivyo tu katika muktadha wa nyumba
          unayoshughulika nayo.
        </p>
        <ul>
          <li>Tumia huduma kwa madhumuni yake: kutafuta, kuorodhesha, kuweka nafasi na kutazama nyumba.</li>
          <li>Usitume barua taka, usionyeshe ukatili, usitishie, wala usidanganye mtu yeyote — iwe kwenye huduma au baada ya kubadilishana maelezo ya mawasiliano.</li>
          <li>Weka malipo yote ndani ya huduma. Makubaliano ya malipo nje ya huduma <strong>hayalindwi na uhifadhi (escrow)</strong>, na hatuwezi kukusaidia kurudisha pesa zilizolipwa nje ya mfumo.</li>
          <li>Ripoti watumiaji wenye tabia ya kashfa au ya kutiliwa shaka kwa timu ya usaidizi badala ya kujibu kwa namna hiyohiyo.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'faragha',
    number: '9',
    title: 'Faragha na Data Yako',
    body: (
      <>
        <p>
          Tunakusanya maelezo tunayohitaji kuendesha huduma: jina lako, nambari ya simu, anwani ya barua pepe,
          maelezo unayoongeza kwenye akaunti yako, na rekodi za uwekaji nafasi, malipo na ujumbe wako. Tunatumia
          maelezo haya kusimamia akaunti yako, kusindika malipo, kukutumia taarifa za uwekaji nafasi na malipo, na
          kuboresha huduma.
        </p>
        <ul>
          <li>Maelezo yako ya mawasiliano yanashirikiwa na upande mwingine <strong>tu wakati kuna uwekaji nafasi au utazamo</strong> kati yenu.</li>
          <li>Taarifa za miamala hutumwa <strong>kwa watu wanaohusika tu</strong> katika miamala hiyo — mtafuta nyumba huona taarifa zake za uwekaji nafasi pekee, na mmiliki huona za nyumba zake pekee.</li>
          <li>Hatununui wala kuuza anwani yako ya barua pepe, nambari ya simu, wala jina lako kwa wahusika wengine.</li>
          <li>Tunaweza kutumia data iliyojumlishwa na isiyo na utambulisho kuelewa jinsi huduma inavyotumiwa na kuiboresha.</li>
          <li>Unaweza kuomba kufutwa kamili kwa akaunti na data yako wakati wowote kwa kuwasiliana na usaidizi. Kufuta akaunti ya mmiliki pia huondoa tangazo lako linalotumika.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'usalama',
    number: '10',
    title: 'Usalama',
    body: (
      <>
        <p>
          Kulinda maelezo yako ni sehemu ya kulinda huduma. Tunafuata mazoea ya usalama yanayokubalika kwa upana, na
          pia tunategemea wewe kufanya sehemu yako.
        </p>
        <ul>
          <li>Manenosiri huhifadhiwa kwa kutumia mbinu za kiwango cha juu (hashing) — kamwe si kwa maandishi wazi.</li>
          <li>Ufikiaji wa hifadhidata unadhibitiwa na usalama wa kiwango cha safu (row-level security) ili maelezo yako ya faragha yaonekane na wewe na wafanyakazi walioidhinishwa tu.</li>
          <li>API zote zinatambulisha utambulisho na kupima kiwango cha matumizi ili kuzuia matumizi mabaya ya mitambo.</li>
          <li>Maelezo ya malipo na ujumbe wa M-Pesa hutumiwa tu kuthibitisha uwekaji nafasi, malipo na marejesho.</li>
          <li>Unapaswa kutumia nenosiri imara na la kipekee, na kamwe usishiriki maelezo yako ya kuingia. Kama unaamini akaunti yako imeingiwa bila idhini, wasiliana nasi mara moja.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'tabia-zilizokatazwa',
    number: '11',
    title: 'Tabia Zilizokatazwa na Utekelezaji',
    body: (
      <>
        <p>Unakubali kamwe kutumia huduma kwa:</p>
        <ul>
          <li>Kuunda akaunti za uwongo, tangazo za uwongo, au tathmini za uwongo zinazodanganya watumiaji wengine.</li>
          <li>Kudanganya au kujaribu kudanganya watumiaji wengine au huduma.</li>
          <li>Kukwepa ada za uwekaji nafasi, uhifadhi (escrow), au mchakato wetu wa malipo.</li>
          <li>Kukusanya data ya watumiaji (scraping) au kutumia vibaya mifumo na API za huduma.</li>
          <li>Kuchapisha maudhui haramu au kutumia huduma kwa madhumuni yoyote yasiyo halali.</li>
          <li>Kuigiza watu wengine, makampuni, au wafanyakazi wa AseHanta.</li>
        </ul>
        <p>
          Kulingana na ukali wa tatizo, tunaweza kukuonya, kuondoa maudhui, kusimamisha akaunti yako, au kuifunga
          kabisa. Pale ambapo kuna ulaghai, fedha zilizohifadhiwa zinaweza kupotea na tunaweza kuripoti jambo hilo
          kwa mamlaka. Maamuzi yetu ya utekelezaji yanafanywa kwa haki na yanaweza kujadiliwa na timu yetu ya
          usaidizi.
        </p>
      </>
    ),
  },
  {
    id: 'haki-miliki',
    number: '12',
    title: 'Haki Miliki na Maudhui',
    body: (
      <>
        <p>
          Jina la AseHanta, nembo, muundo na msimbo wa huduma ni mali yetu (au ya wahusika waliolikodishia). Hakuna
          katika Masharti Haya kinachokupa haki ya kunakili, kurudia, au kutumia tena bila ruhusa.
        </p>
        <p>
          Unapoongeza maudhui kwenye huduma — kama tangazo, picha, au video — unabaki mmiliki wa maudhui hayo, lakini
          unatupatia leseni ya kuyahifadhi, kuyaonyesha, na kuyasambaza kwenye huduma kwa madhumuni ya kuendesha
          huduma. Unaahidi kwamba maudhui unayopakia ni yako kushiriki na hayakiuki haki za mtu mwingine. Tutaondoa
          maudhui yanapoombwa mahali sheria inapohitaji au pale yanapokiuka waziwazi Masharti Haya.
        </p>
      </>
    ),
  },
  {
    id: 'dhima',
    number: '13',
    title: 'Dhima na Kanusho',
    body: (
      <>
        <p>
          AseHanta ni <strong>huduma ya kati (intermediary)</strong>. Tunatoa soko, ulinzi wa uhifadhi (escrow) na
          zana, lakini sisi si mwenye nyumba wala mpangaji. Mkataba wa kukodi, kama upo, ni kati ya mtafuta nyumba na
          mmiliki, na sisi si mhusika katika mkataba huo.
        </p>
        <ul>
          <li>Tunachunguza tangazo na ripoti za watumiaji ili kuweka huduma salama, lakini hatuwezi kuhakikisha kila tangazo liko sawa, na hatuwajibiki kwa vitendo au makosa ya watumiaji binafsi.</li>
          <li>Tunafanya kila tuwezalo kuweka huduma ipatikane na iwe sahihi, lakini hatuhakikishi kwamba haitakatizwa wala kukosa makosa.</li>
          <li>Kwa kiwango cha juu zaidi kinachoruhusiwa na sheria, dhima yetu yote kwa madai yoyote yanayotokana na matumizi yako ya huduma inapunguzwa hadi ada za uwekaji nafasi ulizotulipa kwelikweli kuhusiana na dai hilo.</li>
          <li>Hatuchukuliwi jukumu kwa ucheleweshaji unaosababishwa na wahusika wengine kama watoa huduma za malipo, mitandao ya simu, au huduma za mwenyeji (hosting).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mizozo',
    number: '14',
    title: 'Usuluhishi wa Mizozo',
    body: (
      <>
        <p>
          Tunatumaini kutokubaliana ni jambo adimu, na tunajaribu kulitatua haraka na kwa haki. Mchakato wa uhakiki wa
          uhifadhi (escrow) ulioelezwa katika sehemu ya 6 ndio njia ya kwanza na kuu ya kusuluhisha migogoro ya
          uwekaji nafasi, na uamuzi wa msimamizi, ukiwa umerekodiwa, unafunga kesi hiyo mahususi.
        </p>
        <ul>
          <li>Wasiliana na timu yetu ya usaidizi kwanza — mizozo mingi hutatuliwa kwa mazungumzo mafupi.</li>
          <li>Kama hatuwezi kusuluhisha mzozo kwa njia isiyo rasmi, utatawaliwa na sheria za Jamhuri ya Kenya, na mahakama za Eldoret, Kenya zitakuwa na mamlaka.</li>
          <li>Dai lolote lazima liletewe ndani ya miezi kumi na miwili ya tukio lililosababisha, isipokuwa sheria iseme vinginevyo.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mabadiliko',
    number: '15',
    title: 'Mabadiliko ya Masharti Haya',
    body: (
      <>
        <p>
          Huduma hukua, na Masharti haya yanaweza kuhitaji kukua nayo. Tutachapisha mabadiliko yoyote kwenye ukurasa
          huu na, kwa mabadiliko yanayokuathiri kwa kiasi kikubwa, tutakujulisha mapema kupitia taarifa ya ndani ya
          huduma au barua pepe kabla ya toleo jipya kuanza kutumika.
        </p>
        <p>
          Kama utaendelea kutumia huduma baada ya Masharti yaliyosasishwa kuchapishwa, unakubali toleo jipya. Kama
          hukubaliani na mabadiliko hayo, uko huru kuacha kutumia huduma na kufunga akaunti yako.
        </p>
      </>
    ),
  },
  {
    id: 'kusitishwa',
    number: '16',
    title: 'Kusitishwa kwa Akaunti',
    body: (
      <>
        <p>
          Unaweza kuacha kutumia huduma na kufunga akaunti yako wakati wowote kwa kuwasiliana na usaidizi. Akaunti
          inapofungwa, tangazo zako zinazotumika huondolewa, na fedha zozote za uhifadhi zinazohusiana na uwekaji
          nafasi zinazoendelea husimamiwa kulingana na hali ya uwekaji nafasi huo wakati huo.
        </p>
        <p>
          Tunaweza kusimamisha au kufunga ufikiaji wako kama unakiuka Masharti Haya, kama tabia yako inadhuru
          watumiaji wengine, au kama kuendelea kukuruhusu kungeiweka sisi au wengine kwenye hatari isiyo ya lazima.
          Kufungwa kwa ukiukaji mkubwa kunaweza kuwa mara moja na bila taarifa ya awali, lakini kamwe hakuondoi haki
          zako za kisheria kwa pesa ulizostahili kweli.
        </p>
      </>
    ),
  },
  {
    id: 'mawasiliano-yetu',
    number: '17',
    title: 'Mawasiliano',
    body: (
      <>
        <p>
          Maswali, maoni, na maombi ya usaidizi yanakaribishwa kila wakati. Njia ya haraka zaidi ya kutufikia ni kupitia
          chaguo za mawasiliano hapa chini, na tunalenga kujibu ndani ya siku mbili za kazi.
        </p>
        <ul>
          <li><strong>Barua pepe:</strong> asehanta@gmail.com</li>
          <li><strong>Simu / WhatsApp:</strong> +254 748 275 079</li>
          <li><strong>Eneo:</strong> Eldoret, Kenya</li>
          <li><strong>Ripoti hitilafu au unyanyasaji:</strong> tumia kiungo cha &ldquo;Ripoti hitilafu&rdquo; kwenye menyu ya tovuti, na utaje tangazo au uwekaji nafasi unaohusika.</li>
        </ul>
      </>
    ),
  },
]

export default function TermsPageSw() {
  return (
    <TermsLayout
      lang="sw"
      role="all"
      eyebrow="Sheria na Masharti"
      title="Tafuta nyumba unayopenda — na ujue haswa unachokubaliana nacho."
      subtitle="Masharti haya yanaeleza, kwa lugha rahisi, jinsi AseHanta inavyofanya kazi: jinsi uwekaji nafasi na uhifadhi (escrow) vinavyokulinda, jinsi malipo na marejesho yanavyoamuliwa, tunachotarajia kutoka kwa watafuta nyumba na wanaoorodhesha, na jinsi data yako inavyoshughulikiwa."
      updated="Imesasishwa mara ya mwisho: Oktoba 2026"
      summary={{
        title: 'Muhtasari mfupi',
        points: [
          'Pesa yako ya uwekaji nafasi huhifadhiwa (escrow) hadi utazamo ufanyike — hakuna anayelipwa kabla hujathibitisha.',
          'Umeridhika na nyumba? Mmiliki anapokea malipo yake, yakithibitishwa na risiti ya M-Pesa.',
          'Kuna tatizo? Unaweza kupokea 100%, 85% au 50% kulingana na kilichotokea.',
          'Data yako inashirikiwa tu na watu wanaohusika katika uwekaji nafasi wako, kamwe haiuuzwi.',
          'Nyumba zilizochukuliwa hufutwa picha zake kutoka kwenye hifadhi saa 48 baada ya kuwekwa alama ya kuchukuliwa.',
        ],
      }}
      sections={sections}
      agreeNote={
        <>
          Kwa kuunda akaunti au kutumia huduma, unakubali Masharti Haya na ahadi zetu za faragha.
          <Link
            href="/auth/signup"
            className="mt-3 inline-block rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] hover:shadow-xl active:scale-95"
          >
            Unda akaunti
          </Link>
        </>
      }
    />
  )
}
