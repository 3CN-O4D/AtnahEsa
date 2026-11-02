import Link from 'next/link'
import {
  ArrowLeft,
  ArrowUpRight,
  Compass,
  Home,
  KeyRound,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import NotFoundRecovery from '@/components/notfound/NotFoundRecovery'
import { APP_NAME, WHATSAPP_NUMBER } from '@/lib/constants'
import { getWhatsAppLink } from '@/lib/whatsapp'

const ROUTES = [
  {
    href: '/',
    icon: Home,
    title: 'Browse available homes',
    body: 'See every house that is open for viewing right now.',
  },
  {
    href: '/taken',
    icon: Compass,
    title: 'Recently taken homes',
    body: 'The house may already be gone — check before you travel.',
  },
  {
    href: '/request-house',
    icon: MapPin,
    title: 'Request a house',
    body: 'Tell us the area and budget, and we will hunt it for you.',
  },
]

/** A small, hand-built house scene. Pure SVG + CSS, so no image bandwidth. */
function HouseScene() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-gray-200/80 bg-gradient-to-b from-white via-white to-slate-50 p-5 shadow-2xl shadow-slate-900/10 dark:border-slate-700/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:shadow-black/40 sm:p-7">
      <div className="nf-grid pointer-events-none absolute inset-0 text-slate-900/[0.04] dark:text-white/[0.05]" />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-gray-400">
            <Sparkles className="h-3 w-3 text-[#30B54A]" />
            No. 404
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
            front door
          </span>
        </div>

        <svg
          viewBox="0 0 360 280"
          role="img"
          aria-label="A house with a key that does not fit the door"
          className="mt-1 h-auto w-full"
        >
          <defs>
            <linearGradient id="nf-roof" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#30B54A" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0f766e" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="nf-door" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="nf-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#30B54A" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#30B54A" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Soft glow behind the house */}
          <ellipse cx="180" cy="214" rx="132" ry="46" fill="url(#nf-glow)" />

          {/* Ground */}
          <ellipse
            cx="180"
            cy="248"
            rx="128"
            ry="10"
            className="fill-slate-200/70 dark:fill-slate-800/70"
          />
          <path
            d="M22 248c48 0 68-6 96-18"
            className="nf-dash stroke-[#30B54A]/60 dark:stroke-[#6fdc84]/50"
            fill="none"
            strokeWidth="2.5"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />

          {/* Chimney */}
          <rect
            x="240"
            y="82"
            width="18"
            height="42"
            rx="3"
            className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600"
            strokeWidth="2.5"
          />

          {/* House body */}
          <path
            d="M92 138v102h176V138"
            className="fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Roof */}
          <path
            d="M72 142 180 58l108 84"
            fill="none"
            stroke="url(#nf-roof)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M92 138 180 70l88 68"
            fill="none"
            className="stroke-white/40 dark:stroke-white/10"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Windows */}
          <g className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2.5">
            <rect x="112" y="158" width="32" height="30" rx="4" className="fill-slate-50 dark:fill-slate-800" />
            <path d="M128 158v30M112 173h32" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="2" />
            <rect x="216" y="158" width="32" height="30" rx="4" className="fill-slate-50 dark:fill-slate-800" />
            <path d="M232 158v30M216 173h32" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="2" />
          </g>

          {/* Door */}
          <rect
            x="154"
            y="172"
            width="52"
            height="68"
            rx="6"
            fill="url(#nf-door)"
            className="stroke-emerald-600/60 dark:stroke-emerald-400/50"
            strokeWidth="3"
          />
          <circle cx="194" cy="207" r="3" className="fill-emerald-700 dark:fill-emerald-300" />
          <path
            d="M180 190v14"
            className="stroke-emerald-600/60 dark:stroke-emerald-300/60"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Step */}
          <path
            d="M146 240h68"
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* A key that will not fit */}
          <g transform="translate(268 150) rotate(18)">
            <g className="nf-key">
              <circle
                cx="14"
                cy="14"
                r="8"
                fill="none"
                className="stroke-amber-500"
                strokeWidth="4"
              />
              <path
                d="M22 14h30v9m-11-9v7m-9-7v9"
                fill="none"
                className="stroke-amber-500"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </svg>

        <div className="mt-1 flex items-center justify-between rounded-xl border border-dashed border-gray-200/80 px-3 py-2 dark:border-slate-700/60">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            No home matches this address.
          </p>
          <span className="nf-pulse h-2 w-2 rounded-full bg-red-500" />
        </div>
      </div>
    </div>
  )
}

export default function NotFound() {
  const supportHref =
    getWhatsAppLink(
      WHATSAPP_NUMBER,
      `Hi ${APP_NAME}, I need help finding a house. A link I followed is broken.`
    ) || `https://wa.me/${WHATSAPP_NUMBER}`

  return (
    <div className="relative min-h-[calc(100dvh-64px)] overflow-hidden bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="nf-orb -left-24 -top-28 h-80 w-80 bg-[#30B54A]/10" />
        <div className="nf-orb -right-28 top-16 h-[24rem] w-[24rem] bg-cyan-400/[0.07]" style={{ animationDelay: '2.5s' }} />
        <div className="nf-orb -bottom-32 left-1/3 h-72 w-72 bg-amber-400/[0.07]" style={{ animationDelay: '4.5s' }} />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Top row */}
        <Reveal>
          <div className="mb-10 flex flex-wrap items-center justify-between gap-3 sm:mb-14">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-gray-200 dark:hover:border-slate-600"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              Back home
            </Link>
            <span className="text-xs font-medium tracking-wide text-gray-400 dark:text-gray-500">
              {APP_NAME}
            </span>
          </div>
        </Reveal>

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          {/* Copy + recovery */}
          <Reveal delay={40}>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-200/70 bg-red-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                404 · Page not found
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
                We couldn&apos;t find
                <br />
                <span className="bg-gradient-to-r from-[#30B54A] to-emerald-500 bg-clip-text text-transparent">
                  that page.
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
                The link may be broken, the house may have been removed, or the address
                may have a typo. Search the live listings below or use a shortcut.
              </p>

              <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-500">
                If the link still contains a house ID, we redirect you to the right
                listing automatically — even when someone added a title or tracking
                text to the address.
              </p>

              <NotFoundRecovery />
            </div>
          </Reveal>

          {/* Illustration */}
          <Reveal delay={140}>
            <HouseScene />
          </Reveal>
        </div>

        {/* Practical routes back */}
        <Reveal delay={220}>
          <section className="mt-12 sm:mt-16">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Where you can go next</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  These shortcuts usually get you to the right place faster than retyping the address.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ROUTES.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#30B54A]/40 hover:shadow-lg dark:border-slate-700/70 dark:bg-slate-900/70 dark:hover:border-[#30B54A]/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#30B54A]/10 text-[#30B54A] dark:bg-[#30B54A]/15 dark:text-[#6fdc84]">
                      <route.icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#30B54A] dark:text-gray-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{route.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{route.body}</p>
                </Link>
              ))}

              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-2xl border border-green-200/80 bg-green-50/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-400/60 hover:shadow-lg dark:border-green-900/60 dark:bg-green-950/20 dark:hover:border-green-500/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-300">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-green-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-green-600 dark:text-green-800" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">Talk to us</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  Send the broken link on WhatsApp and we will find the house.
                </p>
              </a>
            </div>
          </section>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-10 flex flex-col items-center gap-2 border-t border-gray-200/70 pt-6 text-center text-xs text-gray-400 dark:border-slate-800 dark:text-gray-500">
            <p className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              A listing link looks like <code className="font-mono text-gray-500 dark:text-gray-400">/listings/&lt;id&gt;</code>.
              Extra words after the ID are redirected automatically.
            </p>
            <Link href="/" className="font-medium text-[#30B54A] hover:underline dark:text-[#6fdc84]">
              Go to the homepage
            </Link>
          </div>
        </Reveal>
      </main>
    </div>
  )
}
