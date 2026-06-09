import { Cookie, Lock, Scale } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useI18n } from '@/lib/i18n';

const legalSections = [
  {
    id: 'privacy',
    icon: Lock,
    eyebrowKey: 'legal.privacy.eyebrow',
    titleKey: 'legal.privacy.title',
    bodyKeys: [
      'legal.privacy.body1',
      'legal.privacy.body2',
      'legal.privacy.body3',
    ],
  },
  {
    id: 'terms',
    icon: Scale,
    eyebrowKey: 'legal.terms.eyebrow',
    titleKey: 'legal.terms.title',
    bodyKeys: [
      'legal.terms.body1',
      'legal.terms.body2',
      'legal.terms.body3',
    ],
  },
  {
    id: 'cookies',
    icon: Cookie,
    eyebrowKey: 'legal.cookies.eyebrow',
    titleKey: 'legal.cookies.title',
    bodyKeys: [
      'legal.cookies.body1',
      'legal.cookies.body2',
      'legal.cookies.body3',
    ],
  },
];

export default function LegalPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <section className="hero-surface relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-25 dark:opacity-35" />
        <div className="absolute inset-0 scanlines-strong pointer-events-none" />

        <div className="relative mx-auto max-w-5xl px-4 py-14 md:py-20">
          <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-primary">
            <Scale className="h-3.5 w-3.5" />
            {t('legal.hero.eyebrow')}
          </div>
          <h1 className="mt-6 font-display text-5xl leading-none text-primary crt-glow-strong md:text-7xl">
            {t('legal.hero.title')}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {t('legal.hero.body')}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {legalSections.map((section) => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="border border-border bg-card/80 p-4 transition-colors hover:border-primary"
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t(section.eyebrowKey)}
                </div>
                <div className="mt-2 font-display text-2xl text-primary">{t(section.titleKey)}</div>
              </a>
            );
          })}
        </div>

        <div className="space-y-6">
          {legalSections.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="industrial-border scroll-mt-40 bg-card/88 p-6 md:p-8"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/40 bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      {t(section.eyebrowKey)}
                    </div>
                    <h2 className="mt-2 font-display text-3xl text-primary crt-glow">
                      {t(section.titleKey)}
                    </h2>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {section.bodyKeys.map((paragraphKey) => (
                    <p key={paragraphKey}>{t(paragraphKey)}</p>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <Footer />
    </div>
  );
}
