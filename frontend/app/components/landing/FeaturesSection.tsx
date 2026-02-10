import { useEffect, useState } from 'react';
import { ManagedInlineVideo } from '~/components/media/ManagedInlineVideo';
import { cn } from '~/lib/utils';

const FEATURES = [
  {
    title: 'Fast everywhere',
    description: 'Smooth scrolling, quick interactions, and responsive animations.',
  },
  {
    title: 'Focus on the details',
    description: 'Crisp visuals and subtle transitions that never feel heavy.',
  },
  {
    title: 'Designed for motion',
    description: 'Animations respect accessibility settings and degrade gracefully.',
  },
] as const;

export function FeaturesSection() {
  const [hasEnded, setHasEnded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoErrored, setVideoErrored] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    update();

    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  const showImage = reducedMotion || videoLoaded || videoErrored || hasEnded;

  return (
    <section className="relative w-full overflow-hidden">
      {showImage && (
        <picture className="absolute inset-0">
          <source srcSet="/images/feature.png" type="image/png" />
          <img
            src="/images/feature.png"
            alt="iPhone features background"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </picture>
      )}

      <div className="absolute inset-0">
        <ManagedInlineVideo
          src="/videos/features.mp4"
          ariaLabel="iPhone features video"
          autoplayInView
          muted
          playsInline
          preload="none"
          unloadOnEnd
          className={cn(
            'h-full w-full object-cover transition-opacity duration-500',
            hasEnded ? 'opacity-0' : 'opacity-100',
          )}
          onLoadedData={() => setVideoLoaded(true)}
          onError={() => setVideoErrored(true)}
          onEnded={() => setHasEnded(true)}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background" />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl min-h-[100svh] content-center gap-10 px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Features that feel effortless
          </h2>
          <p className="mt-4 text-base text-foreground/80 md:text-lg">
            Built for speed, comfort, and clarity—everyday details that add up.
          </p>
        </div>

        <div className="grid w-full max-w-xl gap-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className={cn(
                'group w-2/3 rounded-2xl border border-foreground/10 bg-background/60 p-6 backdrop-blur-xl ring-1 ring-white/5',
                'transition-[transform,background-color,border-color,box-shadow] duration-200 ease-fx-standard',
                'hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-background/70 hover:shadow-[0_26px_90px_-70px_rgba(0,0,0,0.9)]',
                'motion-reduce:transform-none motion-reduce:transition-none',
              )}
            >
              <div className="text-sm font-semibold text-foreground transition-colors group-hover:text-foreground">
                {feature.title}
              </div>
              <p className="mt-2 text-sm text-foreground/75 transition-colors group-hover:text-foreground/85">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
