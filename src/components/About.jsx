import React from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, MapPin, RefreshCw, FileSpreadsheet, ShieldCheck, Fuel,
  ArrowRight, Clock, LogIn, LogOut, CheckCircle2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Signature hero element: a live-looking "ledger" — the actual chain of
// custody the product creates, rendered as timestamped, hash-addressed
// blocks. This is the product's real mechanism, not a decorative device.
// ---------------------------------------------------------------------------
const LEDGER_SAMPLE = [
  { event: 'ClockIn', wallet: '0x7a2d…44e', time: '6:58:02 AM', note: 'Inside geofence · 12m from gate' },
  { event: 'ClockOut', wallet: '0x7a2d…44e', time: '3:04:41 PM', note: '8h 6m worked · block confirmed' },
  { event: 'ClockIn', wallet: '0x8b1f…c36', time: '6:59:50 AM', note: 'Inside geofence · 4m from gate' },
  { event: 'ClockIn', wallet: '0x51ac…9f2', time: '7:01:15 AM', note: 'Inside geofence · 19m from gate' },
];

function LedgerBlock({ event, wallet, time, note, isLast }) {
  const isIn = event === 'ClockIn';
  return (
    <div className="relative pl-9">
      {!isLast && (
        <span className="absolute left-[9px] top-6 bottom-[-18px] w-px bg-[var(--line)]" />
      )}
      <span
        className={`absolute left-0 top-1.5 w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center ${
          isIn ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--accent2)] bg-[var(--accent2)]/15'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isIn ? 'bg-[var(--accent)]' : 'bg-[var(--accent2)]'}`} />
      </span>
      <div className="flex items-baseline justify-between gap-3 font-mono text-[13px]">
        <span className="flex items-center gap-1.5">
          {isIn ? <LogIn className="w-3.5 h-3.5 text-[var(--accent)]" /> : <LogOut className="w-3.5 h-3.5 text-[var(--accent2)]" />}
          <span className={isIn ? 'text-[var(--accent)]' : 'text-[var(--accent2)]'}>{event}</span>
          <span className="text-[var(--muted)]">· {wallet}</span>
        </span>
        <span className="text-[var(--muted)] whitespace-nowrap">{time}</span>
      </div>
      <div className="mt-0.5 mb-4 font-mono text-[11px] text-[var(--muted)]">{note}</div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Wallet,
    title: 'Wallets, not name tags',
    body: 'Every worker clocks in with their own wallet. You map wallets to names for reporting — the chain itself never stores anyone\u2019s identity.',
  },
  {
    icon: MapPin,
    title: 'Geofenced by contract',
    body: 'Clock-ins are validated against a fixed radius around the worksite at the smart-contract level, so a shift can\u2019t be logged from off-site.',
  },
  {
    icon: RefreshCw,
    title: 'Live, not batch',
    body: 'Events sync straight from the chain on a schedule or on demand — no waiting on a nightly export from a third party to see who\u2019s on shift.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Reports your payroll team already knows',
    body: 'Per-employee session history, worked minutes, and CSV export \u2014 the parts of a timesheet people actually use, without the parts they don\u2019t.',
  },
  {
    icon: ShieldCheck,
    title: 'Nothing to breach',
    body: 'There\u2019s no attendance database sitting on a vendor\u2019s server. The ledger is the opBNB chain itself \u2014 public, tamper-evident, and yours to read.',
  },
  {
    icon: Fuel,
    title: 'Cents, not seats',
    body: 'Gas on opBNB runs a fraction of a cent per clock event. One flat monthly charge replaces the usual per-seat workforce-management bill.',
  },
];

const STEPS = [
  {
    title: 'Workers clock in from their phone',
    body: 'A worker opens the app, connects their wallet, and taps clock in. The contract checks their GPS against the worksite geofence before it accepts the transaction.',
  },
  {
    title: 'The event lands on-chain',
    body: 'ClockIn and ClockOut are ordinary contract calls on opBNB \u2014 timestamped, geofenced, and final the moment they\u2019re confirmed. No server in the middle to go down or get hacked.',
  },
  {
    title: 'Managers see it immediately',
    body: 'The dashboard reads events straight from the chain, pairs each ClockIn with its ClockOut, and turns it into the reports and exports a manager actually needs.',
  },
];

function About() {
  return (
    <div className="about-page -m-6 md:-m-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .about-page {
          --bg: #0d1418;
          --surface: #131b20;
          --surface2: #182229;
          --line: #24313a;
          --text: #e7edf0;
          --muted: #7d8f97;
          --accent: #f2a541;
          --accent2: #3ecf9a;
          background: var(--bg);
          color: var(--text);
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
        }
        .about-page h1, .about-page h2, .about-page .display {
          font-family: 'Space Grotesk', system-ui, sans-serif;
        }
        .about-page .mono { font-family: 'IBM Plex Mono', monospace; }
        .about-page .btn-glow {
          box-shadow: 0 0 0 1px rgba(242,165,65,0.35), 0 8px 24px -8px rgba(242,165,65,0.35);
        }
      `}</style>

      {/* ---------------- Hero ---------------- */}
      <section className="px-6 md:px-16 pt-16 pb-20 border-b border-[var(--line)]">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mono text-[11px] tracking-wide uppercase text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 rounded-full px-3 py-1 mb-6">
              <Clock className="w-3 h-3" /> Attendance, settled on-chain
            </div>
            <h1 className="display text-4xl md:text-[3.25rem] leading-[1.05] font-semibold tracking-tight">
              Your timeclock shouldn't need <span className="text-[var(--accent)]">a server</span> to trust.
            </h1>
            <p className="mt-6 text-lg text-[var(--muted)] max-w-lg leading-relaxed">
              ClockIn Manager records every shift straight to a public blockchain yet geofenced,
              timestamped, and tamper-evident, so field and site teams get real attendance
              records without paying for someone else's backend.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <a href="mailto:hello@clockinmanager.app" className="btn-glow bg-[var(--accent)] text-[#20150a] font-medium rounded-xl px-6 py-3 inline-flex items-center gap-2 hover:brightness-105 transition">
                Book a walkthrough <ArrowRight className="w-4 h-4" />
              </a>
              <Link to="/" className="border border-[var(--line)] hover:border-[var(--muted)] rounded-xl px-6 py-3 inline-flex items-center gap-2 text-[var(--text)] transition">
                See the live dashboard
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-2 mono text-xs text-[var(--muted)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent2)]" />
              Currently deployed on opBNB Testnet (currently for testing) - mainnet-ready
            </div>
          </div>

          {/* Signature: live ledger */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between mb-5">
              <span className="mono text-xs text-[var(--muted)] uppercase tracking-wide">clockinLogs · live feed</span>
              <span className="flex items-center gap-1.5 mono text-[11px] text-[var(--accent2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent2)] animate-pulse" /> synced
              </span>
            </div>
            <div>
              {LEDGER_SAMPLE.map((b, i) => (
                <LedgerBlock key={i} {...b} isLast={i === LEDGER_SAMPLE.length - 1} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Demo video ---------------- */}
      <section className="px-6 md:px-16 py-16 border-b border-[var(--line)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="display text-2xl font-semibold tracking-tight mb-6 text-center">
            See it in action
          </h2>

          <div className="aspect-video rounded-2xl overflow-hidden border border-[var(--line)] bg-black">
            <video
              className="w-full h-full object-cover"
              src="/media/demo.mp4"
              poster="/media/demo-poster.jpg"
              controls
              muted
              playsInline
            />
          </div>

          <p className="mt-3 text-center text-xs text-[var(--muted)] mono tracking-wide">
            Recorded from the live ClockIn Manager dashboard
          </p>
        </div>
      </section>

      {/* ---------------- Problem / positioning ---------------- */}
      <section className="px-6 md:px-16 py-16 border-b border-[var(--line)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="display text-2xl md:text-3xl font-semibold tracking-tight">
            Workforce software shouldn't be a monthly bill for someone else's database.
          </h2>
          <p className="mt-5 text-[var(--muted)] leading-relaxed">
            Most attendance platforms charge per employee, per month, to host a database you
            never see and can't verify. ClockIn Manager flips that: the record of who clocked in,
            where, and when lives on a public chain. You pay one flat fee to run the dashboard on
            top of it \u2014 not rent on the data itself.
          </p>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section className="px-6 md:px-16 py-16 border-b border-[var(--line)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="display text-2xl font-semibold tracking-tight mb-10">
            Built for crews on real worksites, not office punch clocks
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface2)] border border-[var(--line)] flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <h3 className="font-semibold text-[15px] mb-1.5">{title}</h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="px-6 md:px-16 py-16 border-b border-[var(--line)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="display text-2xl font-semibold tracking-tight mb-10">How a shift becomes a record</h2>
          <div className="space-y-8">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-5">
                <div className="mono text-sm text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 rounded-lg w-9 h-9 flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] mb-1">{s.title}</h3>
                  <p className="text-sm text-[var(--muted)] leading-relaxed max-w-xl">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 md:px-16 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="display text-2xl md:text-3xl font-semibold tracking-tight">
            One dashboard. One flat fee. No backend to babysit.
          </h2>
          <p className="mt-4 text-[var(--muted)]">
            Tell us about your site and crew size, and we'll walk you through what a rollout looks like.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a href="mailto:hello@clockinmanager.app" className="btn-glow bg-[var(--accent)] text-[#20150a] font-medium rounded-xl px-6 py-3 inline-flex items-center gap-2 hover:brightness-105 transition">
              Get in touch <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default About;
