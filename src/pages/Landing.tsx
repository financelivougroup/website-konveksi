import {
  Factory,
  Scissors,
  Sparkles,
  Truck,
  Shield,
  Clock,
  ArrowRight,
  Star,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';

interface LandingProps {
  onEnterApp: () => void;
}

const stats = [
  { value: '8+', label: 'Years in production', icon: Clock },
  { value: '50+', label: 'Active brand partners', icon: Shield },
  { value: '1M+', label: 'Garments produced', icon: Sparkles },
  { value: '14d', label: 'Average lead time', icon: Truck },
];

const processSteps = [
  {
    title: 'Tech pack review',
    desc: 'We review measurements, fabrics, and trims. You receive a confirmed cost sheet within 48 hours.',
  },
  {
    title: 'Sample making',
    desc: 'Prototype sample sewn and shipped to you for fit approval before production starts.',
  },
  {
    title: 'Production run',
    desc: 'Cutting, sewing, and finishing with daily progress reports uploaded to your dashboard.',
  },
  {
    title: 'QC and ship',
    desc: 'Final inspection, AQL check, carton packing, and handoff to your forwarder.',
  },
];

export function Landing({ onEnterApp }: LandingProps) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-slate-900 relative overflow-x-hidden">
      {/* Floating blur orbs (background atmosphere) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -right-32 w-[480px] h-[480px] bg-sky-300/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-[420px] h-[420px] bg-cyan-200/50 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[360px] h-[360px] bg-blue-200/40 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 pt-4">
        <nav className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-5 py-2.5 rounded-2xl glass">
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-md shadow-sky-200/60">
              <Factory className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-slate-800 tracking-tight">Konveksi Pro</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-[13px] font-medium text-slate-600">
            <a href="#services" className="hover:text-slate-900 transition-colors">Services</a>
            <a href="#process" className="hover:text-slate-900 transition-colors">Process</a>
            <a href="#contact" className="hover:text-slate-900 transition-colors">Contact</a>
          </div>
          <button
            onClick={onEnterApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold text-white bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 rounded-xl transition-all shadow-md shadow-sky-200/60 hover:shadow-lg hover:shadow-sky-200/80 active:scale-[0.98]"
          >
            Open App <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-24 sm:pb-32">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-slate-900 tracking-tighter leading-[1.05]">
              Garment <em className="italic font-medium text-sky-600 not-italic">manufacturing</em>, simplified.
            </h1>
            <p className="mt-6 text-[16px] text-slate-600 leading-relaxed max-w-[55ch]">
              From fabric sourcing to final finishing, we handle every step of production for Indonesian fashion brands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-[14px] font-semibold text-white bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 rounded-xl transition-all shadow-lg shadow-sky-200/70 hover:shadow-xl hover:shadow-sky-300/60 active:scale-[0.98]"
              >
                Start a project <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#process"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-[14px] font-semibold text-slate-700 glass hover:bg-white/80 rounded-xl transition-all active:scale-[0.98]"
              >
                See the process
              </a>
            </div>
          </div>

          {/* Hero visual: glass card with real image */}
          <div className="relative">
            <div
              className="absolute -inset-6 bg-gradient-to-br from-sky-200/50 to-cyan-200/50 rounded-[32px] blur-2xl"
              aria-hidden="true"
            />
            <div className="relative glass rounded-3xl p-5 sm:p-6">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 mb-4">
                <img
                  src="https://picsum.photos/seed/konveksi-fabric-roll/800/600"
                  alt="Fabric rolls ready for the production floor"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Active order
                  </div>
                  <div className="text-[15px] font-semibold text-slate-800 mt-0.5">Rue Top, 200 pcs</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                    In production
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5">Step 3 of 5</div>
                </div>
              </div>
            </div>
            {/* Floating testimonial card */}
            <div className="absolute -bottom-5 -left-5 sm:-left-8 w-44 p-4 rounded-2xl glass-strong">
              <div className="flex items-center gap-0.5 mb-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 text-amber-400 fill-current" />
                ))}
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Reliable partner for our restock runs. Communication stays clear.
              </p>
              <p className="text-[10px] text-slate-400 mt-1.5">Cassca, brand partner</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass rounded-2xl p-5 text-center hover:-translate-y-0.5 transition-transform duration-300"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100/60 flex items-center justify-center mx-auto mb-3">
                <stat.icon className="w-4 h-4 text-sky-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {stat.value}
              </div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services — asymmetric 1+2 bento */}
      <section id="services" className="relative px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-14">
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tighter leading-[1.1]">
              Three workshops.
              <br />
              One workflow.
            </h2>
            <p className="mt-4 text-[15px] text-slate-600 leading-relaxed max-w-[55ch]">
              Each service runs in its own dedicated room, with supervisors tracking quality at every handoff.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-4 sm:gap-5">
            {/* Cutting — tall, large image (spans 2 rows) */}
            <div className="glass rounded-2xl overflow-hidden md:row-span-2 group hover:-translate-y-1 transition-transform duration-300">
              <div className="aspect-[4/3] md:aspect-[5/4] overflow-hidden bg-slate-100">
                <img
                  src="https://picsum.photos/seed/konveksi-cutting-table/900/800"
                  alt="Cutting workshop with fabric laid out"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-5 sm:p-6">
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100/60 flex items-center justify-center mb-3">
                  <Scissors className="w-4 h-4 text-sky-500" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-1.5">Cutting</h3>
                <p className="text-[13px] text-slate-600 leading-relaxed">
                  Pattern making, fabric relaxation, marker planning, and precision cutting for jersey, woven, and knit.
                </p>
              </div>
            </div>

            {/* Sewing — compact, image left */}
            <div className="glass rounded-2xl overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
              <div className="grid sm:grid-cols-[1fr_1.2fr]">
                <div className="aspect-[4/3] sm:aspect-auto overflow-hidden bg-slate-100">
                  <img
                    src="https://picsum.photos/seed/konveksi-sewing-line/600/500"
                    alt="Sewing line during a production run"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                </div>
                <div className="p-5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100/60 flex items-center justify-center mb-3">
                    <Factory className="w-4 h-4 text-sky-500" />
                  </div>
                  <h3 className="text-[16px] font-semibold text-slate-900 mb-1.5">Sewing</h3>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    Lines sized to your order, with inline QC checkpoints.
                  </p>
                </div>
              </div>
            </div>

            {/* Finishing — compact, image left */}
            <div className="glass rounded-2xl overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
              <div className="grid sm:grid-cols-[1fr_1.2fr]">
                <div className="aspect-[4/3] sm:aspect-auto overflow-hidden bg-slate-100">
                  <img
                    src="https://picsum.photos/seed/konveksi-finishing-press/600/500"
                    alt="Finishing and pressing station"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                </div>
                <div className="p-5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100/60 flex items-center justify-center mb-3">
                    <Sparkles className="w-4 h-4 text-sky-500" />
                  </div>
                  <h3 className="text-[16px] font-semibold text-slate-900 mb-1.5">Finishing</h3>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    Trimming, pressing, folding, poly-bagging, and carton packing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process — vertical stack of horizontal cards */}
      <section id="process" className="relative px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10 sm:mb-14">
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tighter leading-[1.1]">
              How a run moves through.
            </h2>
            <p className="mt-4 text-[15px] text-slate-600 leading-relaxed max-w-[55ch]">
              Every order follows the same four-step pipeline. You see live status from your dashboard.
            </p>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {processSteps.map((step, i) => (
              <div
                key={step.title}
                className="glass rounded-2xl p-5 sm:p-6 flex items-start gap-4 sm:gap-5 hover:-translate-y-0.5 transition-transform duration-300"
              >
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 border border-sky-200/60 flex items-center justify-center text-[13px] sm:text-[14px] font-bold text-sky-700 flex-shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="text-[15px] sm:text-[16px] font-semibold text-slate-900 mb-1">
                    {step.title}
                  </h3>
                  <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="relative px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="glass-strong rounded-3xl p-6 sm:p-10 md:p-12 grid md:grid-cols-[1.05fr_1fr] gap-8 md:gap-10 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tighter leading-[1.1]">
                Ready to scope your next run?
              </h2>
              <p className="mt-3 text-[14px] text-slate-600 leading-relaxed max-w-[50ch]">
                Send us your tech pack or a reference photo. We will reply with a cost estimate within one business day.
              </p>
              <div className="mt-6 space-y-2.5 text-[13px] text-slate-600">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-3.5 h-3.5 text-sky-500" />
                  hello@konveksipro.id
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="w-3.5 h-3.5 text-sky-500" />
                  +62 22 555 0123
                </div>
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-500" />
                  Bandung, West Java
                </div>
              </div>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                alert('Thanks. We will reach out within one business day.');
              }}
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Name
                </label>
                <input
                  required
                  type="text"
                  className="w-full h-11 px-3.5 text-[14px] bg-white/70 border border-white/80 rounded-xl outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/60 transition-all"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  required
                  type="email"
                  className="w-full h-11 px-3.5 text-[14px] bg-white/70 border border-white/80 rounded-xl outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/60 transition-all"
                  placeholder="you@brand.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Order summary
                </label>
                <textarea
                  required
                  rows={3}
                  className="w-full p-3.5 text-[14px] bg-white/70 border border-white/80 rounded-xl outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/60 transition-all resize-none"
                  placeholder="Quantity, fabric, deadline"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-[14px] font-semibold text-white bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 rounded-xl transition-all shadow-md shadow-sky-200/60 active:scale-[0.98]"
              >
                Send inquiry <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-4 sm:px-6 py-10 sm:py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-slate-500">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center">
              <Factory className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-slate-700">Konveksi Pro</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#services" className="hover:text-slate-900 transition-colors">Services</a>
            <a href="#process" className="hover:text-slate-900 transition-colors">Process</a>
            <a href="#contact" className="hover:text-slate-900 transition-colors">Contact</a>
            <button
              onClick={onEnterApp}
              className="hover:text-sky-600 transition-colors font-medium"
            >
              Open App
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}