import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BadgeCheck, Compass, Feather, Sparkles, Users } from 'lucide-react'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Our Story & Logo',
  description:
    'The origin and meaning of the AseHanta logo: the three founders behind ASE, the Y-shaped emblem, and the golden stroke that carries the idea forward.',
}

const STORY = [
  {
    number: '01',
    title: 'The Story Behind the Symbol',
    body: [
      'The AseHanta logo is more than a visual identity. It represents the origins of an idea, the collaboration of three individuals, and the journey of one founder who continued to carry that idea forward.',
      'The logo was conceptualised and designed by Aginah Samuel Namale, Founder of AseHanta.',
      "Its design draws inspiration from the company's original founding story, preserving the identities of the three individuals who first came together to develop the business idea: Allan Ruto, Samuel Aginah Namale, and Emmanuel Kipchirchir.",
    ],
  },
  {
    number: '02',
    title: 'The Original Logo and Its Evolution',
    body: [
      'The original AseHanta logo featured a house symbol, representing the company’s initial focus on housing and real estate.',
      'As the idea and its identity evolved, so did the logo. The original house symbol eventually gave way to the distinctive Y-shaped emblem used in the present design.',
      'This evolution introduced a deeper personal meaning, connecting the visual identity to the three individuals behind the original idea and the founder who continued developing it.',
    ],
  },
]

const ASE_MEANING = [
  { initial: 'A', name: 'Allan Ruto' },
  { initial: 'S', name: 'Samuel Aginah Namale' },
  { initial: 'E', name: 'Emmanuel Kipchirchir' },
]

const SYMBOL_MEANING = [
  {
    icon: Users,
    title: 'Three branches',
    body: 'The three extensions of the Y-shaped emblem deliberately symbolise the three individuals who came together to establish the original business idea.',
  },
  {
    icon: Compass,
    title: 'Shared beginnings',
    body: 'The emblem represents the collaboration upon which AseHanta was initially built, and the common origin the founders still share.',
  },
  {
    icon: Feather,
    title: 'One continued journey',
    body: 'The golden-yellow stroke runs downwards towards the letters ASE, pointing specifically at the S for Samuel — the founder who carried the idea forward.',
  },
]

const PALETTE = [
  { name: 'Deep Navy', hex: '#071426', className: 'bg-[#071426]', text: 'text-white' },
  { name: 'AseHanta Blue', hex: '#1D4ED8', className: 'bg-[#1D4ED8]', text: 'text-white' },
  { name: 'Sky Blue', hex: '#60A5FA', className: 'bg-[#60A5FA]', text: 'text-[#071426]' },
  { name: 'AseHanta Gold', hex: '#D4AF37', className: 'bg-[#D4AF37]', text: 'text-[#071426]' },
  { name: 'Soft Blue', hex: '#DBEAFE', className: 'bg-[#DBEAFE]', text: 'text-[#0B1F3A]' },
]

function SymbolGuide() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-[2rem] border border-[#D4AF37]/25 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8">
        <svg viewBox="0 0 360 360" role="img" aria-label="Diagram of the AseHanta Y-shaped emblem" className="h-auto w-full">
          <defs>
            <linearGradient id="ase-blue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="55%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1E3A8A" />
            </linearGradient>
            <linearGradient id="ase-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5E0A3" />
              <stop offset="50%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#A97900" />
            </linearGradient>
          </defs>

          {/* Three branches of the mark */}
          <path d="M180 56c-10 42-46 72-88 84" fill="none" stroke="url(#ase-blue)" strokeWidth="26" strokeLinecap="round" />
          <path d="M180 56c10 42 46 72 88 84" fill="none" stroke="url(#ase-blue)" strokeWidth="26" strokeLinecap="round" />
          <path d="M180 56v132" fill="none" stroke="url(#ase-blue)" strokeWidth="26" strokeLinecap="round" />

          {/* Golden stroke pointing to S */}
          <path d="M180 116c0 46-10 78-32 108" fill="none" stroke="url(#ase-gold)" strokeWidth="18" strokeLinecap="round" />

          {/* Junction */}
          <circle cx="180" cy="66" r="17" fill="#D4AF37" />
          <circle cx="180" cy="66" r="7" fill="#071426" opacity="0.45" />

          {/* ASE initials */}
          <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="800" textAnchor="middle">
            <text x="104" y="292" fontSize="40" fill="#60A5FA">A</text>
            <text x="180" y="292" fontSize="40" fill="#D4AF37">S</text>
            <text x="256" y="292" fontSize="40" fill="#60A5FA">E</text>
          </g>
          <path d="M96 312h72M192 312h72" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </svg>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-blue-200/70">
          <span>Three founders</span>
          <span className="text-[#F0D78C]">Samuel</span>
          <span>Founding initials</span>
        </div>
      </div>
    </div>
  )
}

export default function BrandPage() {
  return (
    <div className="bg-[#071426] text-blue-50">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-blue-900/60">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 top-0 h-80 w-80 rounded-full bg-[#D4AF37]/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:pt-14 lg:pb-24">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-950/40 px-3.5 py-1.5 text-xs font-semibold text-blue-200 transition hover:border-[#D4AF37]/50 hover:text-[#F0D78C]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to AseHanta
          </Link>

          <div className="mt-10 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#F0D78C]">
                <Sparkles className="h-3.5 w-3.5" />
                Brand &amp; Origin
              </span>

              <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                <span className="brand-wordmark-light">Asehanta</span>
                <span className="block text-white">Our story in a symbol.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-blue-100/80 sm:text-lg">
                An idea born through collaboration, carried forward through commitment. This is the origin and meaning
                behind the AseHanta logo — from a simple house symbol to a Y-shaped emblem that remembers three founders
                and the one who continued.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#story"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:-translate-y-0.5 hover:bg-[#1E40AF]"
                >
                  Read the story <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/45 bg-white/5 px-5 py-3 text-sm font-bold text-[#F0D78C] transition hover:-translate-y-0.5 hover:bg-[#D4AF37]/10"
                >
                  Talk to us
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-blue-200/70">
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-[#D4AF37]" /> Designed by the founder</span>
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-[#D4AF37]" /> Three founding initials</span>
              </div>
            </div>

            {/* The shipped AseHanta logo */}
            <div className="relative">
              <div className="absolute inset-0 -rotate-2 rounded-[2.25rem] bg-gradient-to-br from-[#D4AF37]/25 via-blue-500/10 to-transparent blur-xl" aria-hidden="true" />
              <div className="relative rounded-[2rem] border border-[#D4AF37]/35 bg-[#F7F5EE] p-4 shadow-2xl sm:p-6">
                <Image
                  src="/images/asehanta-logo.jpeg"
                  alt="The AseHanta logo"
                  width={764}
                  height={488}
                  preload
                  sizes="(max-width: 1024px) 90vw, 560px"
                  className="h-auto w-full rounded-2xl object-contain"
                />
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#0B1F3A]/10 pt-4">
                  <span className="text-sm font-extrabold tracking-wide text-[#0B1F3A]">AseHanta</span>
                  <span className="rounded-full bg-[#0B1F3A] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F0D78C]">
                    Official mark
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meaning at a glance */}
      <section className="relative border-b border-blue-900/60 bg-[#0B1F3A]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <div className="grid gap-4 md:grid-cols-3">
            {SYMBOL_MEANING.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-blue-400/15 bg-white/[0.04] p-6 transition hover:border-[#D4AF37]/35 hover:bg-white/[0.06]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#D4AF37]/10 text-[#F0D78C] ring-1 ring-[#D4AF37]/25">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-base font-bold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/75">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">The origin &amp; meaning</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                A logo built from <span className="text-[#F0D78C]">memory</span>, not decoration.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-blue-100/75">
                Every part of the mark holds a name, a relationship and a decision. The navy blue gives AseHanta its
                visual home. The gold carries the personal story of the founder who stayed.
              </p>

              <div className="mt-8 rounded-2xl border border-blue-400/15 bg-blue-950/40 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F0D78C]">AseHanta in one line</p>
                <p className="mt-2 text-lg font-semibold leading-snug text-white">
                  &ldquo;An idea born through collaboration, carried forward through commitment.&rdquo;
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {STORY.map((section) => (
                <article key={section.number} className="rounded-2xl border border-blue-400/15 bg-white/[0.035] p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl font-black text-[#D4AF37]/70">{section.number}</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{section.title}</h3>
                      {section.body.map((paragraph, index) => (
                        <p key={index} className="mt-3 text-sm leading-relaxed text-blue-100/75">{paragraph}</p>
                      ))}
                    </div>
                  </div>
                </article>
              ))}

              {/* ASE initials */}
              <article className="rounded-2xl border border-[#D4AF37]/25 bg-[#0B1F3A] p-6 sm:p-7">
                <span className="text-2xl font-black text-[#D4AF37]/70">03</span>
                <h3 className="mt-1 text-xl font-bold text-white">The Meaning of ASE</h3>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/75">
                  The three letters, A, S and E, positioned beneath the emblem, represent the initials of the three
                  original individuals.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {ASE_MEANING.map(({ initial, name }) => (
                    <div key={initial} className="rounded-xl border border-blue-400/15 bg-white/[0.04] p-4 text-center">
                      <span className="block text-3xl font-black text-[#F0D78C]">{initial}</span>
                      <span className="mt-1 block text-xs font-semibold leading-snug text-blue-100/75">{name}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-blue-100/75">
                  These initials commemorate the three individuals who participated in the conception and early
                  development of the AseHanta idea. Although Allan Ruto and Emmanuel Kipchirchir eventually stepped away
                  from the venture for their own valid reasons, their place in its beginnings remains represented in the
                  logo.
                </p>
              </article>

              {[
                {
                  number: '04',
                  title: 'The Meaning of the Y-Shaped Symbol',
                  body: 'The distinctive Y-shaped emblem represents the three branches of the original founding team. Its three extensions were deliberately designed to symbolise the three individuals who came together to establish the original business idea. The emblem therefore represents the shared beginnings of AseHanta and the collaboration upon which the idea was initially built.',
                },
                {
                  number: '05',
                  title: 'The Significance of the Golden-Yellow Stroke',
                  body: 'The golden-yellow stroke represents Aginah Samuel Namale, the founder who continued with AseHanta after the other two original participants stepped away. Its position is deliberate. The golden stroke runs downwards towards the letters ASE, pointing specifically towards the letter S, representing Samuel. This visual arrangement communicates continuity: although the original idea began with three individuals, one founder remained committed to carrying it forward. The golden-yellow stroke therefore represents the founder’s personal connection to the venture and his continued role in its development.',
                },
                {
                  number: '06',
                  title: 'The Colours and Visual Identity',
                  body: 'The logo primarily incorporates navy blue and golden yellow. The navy blue was selected purely for aesthetic reasons, contributing to the visual appearance and overall design of the emblem. It was not originally assigned a specific symbolic meaning. The golden-yellow stroke, on the other hand, carries a deliberate personal meaning, representing the founder who continued with the venture. Together, the colours form the distinctive visual identity of the AseHanta logo.',
                },
                {
                  number: '07',
                  title: 'A Symbol of Origins and Continuity',
                  body: 'The AseHanta logo brings together two important aspects of the company’s beginnings: its origins — the three initials and the Y-shaped emblem preserve the story of the three individuals who initially conceived the idea; and its continuity — the golden-yellow stroke identifies Samuel, the founder who continued developing the venture. Designed by its founder, the logo evolved from a simple house symbol representing housing and real estate into an emblem that also preserves the story of its founding team. It remains a visual reminder that AseHanta’s beginnings involved collaboration, while its continued journey reflects commitment and perseverance.',
                },
              ].map((section) => (
                <article key={section.number} className="rounded-2xl border border-blue-400/15 bg-white/[0.035] p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl font-black text-[#D4AF37]/70">{section.number}</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{section.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-blue-100/75">{section.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Symbol guide + palette */}
      <section className="border-y border-blue-900/60 bg-[#0B1F3A]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">The mark, explained</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Three branches. One <span className="text-[#F0D78C]">golden</span> line.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-blue-100/75">
                The Y-shape holds the three founding branches together. The gold stroke then travels down toward the
                letters ASE, landing on the S. That small detail is the heart of the mark: collaboration at the start,
                continuity from the founder who carried it forward.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  { color: 'bg-[#60A5FA]', label: 'Blue branches', text: 'The three extensions of the founding team.' },
                  { color: 'bg-[#D4AF37]', label: 'Golden stroke', text: 'Samuel — the founder who continued the journey.' },
                  { color: 'bg-white', label: 'ASE initials', text: 'Allan, Samuel and Emmanuel, remembered beneath the mark.' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl border border-blue-400/15 bg-white/[0.04] p-3.5">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${item.color}`} />
                    <div>
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      <p className="text-xs leading-relaxed text-blue-100/70">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <SymbolGuide />
          </div>

          <div className="mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">Brand palette</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Blue and gold, always.</h2>
              </div>
              <p className="max-w-sm text-xs leading-relaxed text-blue-200/65">
                Deep navy and blue shades carry the brand. Gold is reserved for the name, the founder’s stroke and
                moments that deserve emphasis.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {PALETTE.map((colour) => (
                <div key={colour.name} className="overflow-hidden rounded-2xl border border-blue-400/15 bg-white/[0.04]">
                  <div className={`flex h-24 items-end p-3 ${colour.className}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${colour.text}`}>{colour.hex}</span>
                  </div>
                  <p className="p-3 text-xs font-semibold text-blue-100/80">{colour.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#D4AF37]/10 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#F0D78C]">
            <Sparkles className="h-6 w-6" />
          </span>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">
            An idea born through collaboration.
            <span className="mt-1 block text-[#F0D78C]">Carried forward through commitment.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-blue-100/75">
            AseHanta keeps its beginnings visible. If you would like to know more about the brand, the story or the
            people behind it, we are always happy to talk.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:-translate-y-0.5 hover:bg-[#1E40AF]"
            >
              Explore homes <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/45 bg-white/5 px-5 py-3 text-sm font-bold text-[#F0D78C] transition hover:-translate-y-0.5 hover:bg-[#D4AF37]/10"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
          <p className="mt-6 text-xs text-blue-200/50">{CONTACT_PHONE_DISPLAY} · Eldoret, Kenya</p>
        </div>
      </section>
    </div>
  )
}
