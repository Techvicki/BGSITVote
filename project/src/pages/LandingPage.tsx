import { ArrowRight, CheckCircle2, GraduationCap, LockKeyhole, Menu, ShieldCheck, Vote, X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  onLogin: () => void;
};

const imagePath = '/images/ChatGPT_Image_Oct_21,_2026,_04_35_46_PM.png';

export default function LandingPage({ onLogin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-canvas text-navy-deep">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="max-w-page mx-auto px-4 py-5 lg:px-8">
          <nav className="flex items-center justify-between rounded-lg border border-white/30 bg-navy-deep/85 px-4 py-3 text-white shadow-tier2 backdrop-blur-md lg:px-5">
            <a href="#top" className="flex items-center gap-3" aria-label="BGSIT Vote home">
              <span className="flex h-9 w-9 items-center justify-center rounded bg-civic">
                <Vote className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight">BGSIT Vote</span>
                <span className="block text-[10px] uppercase tracking-label text-white/60">Institutional Portal</span>
              </span>
            </a>

            <div className="hidden items-center gap-7 text-sm text-white/80 md:flex">
              <a className="transition-colors hover:text-white" href="#about">About the portal</a>
              <a className="transition-colors hover:text-white" href="#trust">Why BGSIT Vote</a>
              <button onClick={onLogin} className="rounded bg-white px-4 py-2 font-semibold text-navy-deep transition-colors hover:bg-slate-wash">
                Sign in
              </button>
            </div>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded p-2 text-white md:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>

          {menuOpen && (
            <div className="mt-2 rounded-lg border border-slate-border bg-white p-3 shadow-tier2 md:hidden">
              <a onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm text-slate-text hover:bg-slate-wash" href="#about">About the portal</a>
              <a onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm text-slate-text hover:bg-slate-wash" href="#trust">Why BGSIT Vote</a>
              <button onClick={onLogin} className="mt-2 w-full rounded bg-civic px-3 py-2.5 text-sm font-semibold text-white">Sign in to vote</button>
            </div>
          )}
        </div>
      </header>

      <main id="top">
        <section className="relative isolate flex min-h-[680px] items-end overflow-hidden bg-navy-deep pt-32 lg:min-h-[760px] lg:items-center">
          <img src={imagePath} alt="BGS Institute of Technology campus" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep via-navy-deep/80 to-navy-deep/20" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-deep/90 via-transparent to-navy-deep/25" />

          <div className="max-w-page mx-auto w-full px-4 pb-16 lg:px-8 lg:pb-0">
            <div className="max-w-2xl animate-fadeIn">
              <div className="mb-5 inline-flex items-center gap-2 rounded border border-emerald-border/50 bg-emerald-deep/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-label text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-emerald-vote" />
                2026 Student Elections are open
              </div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">BGS Institute of Technology</p>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-headline text-white sm:text-5xl lg:text-7xl">
                Your campus.<br />Your voice.<br /><span className="text-primary-fixed">Your vote.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
                The official digital voting platform for BGSIT student governance. Participate in elections securely, transparently, and from anywhere.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button onClick={onLogin} className="group flex items-center justify-center gap-2 rounded bg-civic px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-navy-deep/30 transition-all hover:bg-civic-hover hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-navy-deep">
                  Enter Voting Portal
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <a href="#about" className="flex items-center justify-center rounded border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20">
                  Learn how it works
                </a>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-white/70">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-vote" /> Verified student identity</span>
                <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-emerald-vote" /> Secure vote receipts</span>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-b border-slate-border bg-white py-16 lg:py-24">
          <div className="max-w-page mx-auto px-4 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="label-text mb-3 text-civic">A better way to participate</p>
                <h2 className="text-3xl font-bold leading-tight tracking-headline2 text-navy-deep sm:text-4xl">Democracy built for the BGSIT community.</h2>
                <p className="mt-5 text-base leading-relaxed text-slate-text">Every student deserves a clear, trusted way to shape the future of their institution. BGSIT Vote brings the complete election experience into one focused portal.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FeatureCard icon={GraduationCap} title="Institutional access" text="Faculty-aware elections help every student find the contests where their voice matters." />
                <FeatureCard icon={ShieldCheck} title="Verified participation" text="Your student identity is confirmed before you enter an active ballot." />
                <FeatureCard icon={LockKeyhole} title="Private by design" text="Your selection stays private while your participation remains verifiable." />
                <FeatureCard icon={CheckCircle2} title="Clear confirmation" text="Receive a secure receipt after every successful vote submission." />
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="bg-slate-canvas py-14 lg:py-20">
          <div className="max-w-page mx-auto px-4 text-center lg:px-8">
            <p className="label-text mb-3 text-amber-academic">Built for trust</p>
            <h2 className="text-2xl font-bold tracking-headline2 text-navy-deep sm:text-3xl">A formal process, made simple.</h2>
            <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-3">
              <ProcessStep number="01" title="Sign in" text="Use your verified student account to securely access your eligible elections." />
              <ProcessStep number="02" title="Make your choice" text="Review each candidate manifesto and select the candidate you support." />
              <ProcessStep number="03" title="Keep your receipt" text="Submit once and receive a cryptographic receipt for your records." />
            </div>
            <button onClick={onLogin} className="btn-civic mt-10 inline-flex items-center gap-2">Access the portal <ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
      </main>

      <footer className="bg-navy-deep py-7 text-white">
        <div className="max-w-page mx-auto flex flex-col gap-3 px-4 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© 2026 BGS Institute of Technology · Student Governance Council</p>
          <p className="uppercase tracking-label">Official institutional voting portal</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-border bg-slate-canvas p-5 transition-all duration-200 hover:-translate-y-1 hover:border-civic/30 hover:shadow-tier1">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded bg-civic-wash text-civic"><Icon className="h-5 w-5" /></div>
      <h3 className="font-semibold text-navy-deep">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-text">{text}</p>
    </div>
  );
}

function ProcessStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div>
      <p className="text-sm font-bold tracking-label text-civic">{number}</p>
      <h3 className="mt-2 text-lg font-semibold text-navy-deep">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-text">{text}</p>
    </div>
  );
}
