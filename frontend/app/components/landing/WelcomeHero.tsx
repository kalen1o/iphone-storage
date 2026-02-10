import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ManagedInlineVideo } from '~/components/media/ManagedInlineVideo';
import { cn } from '~/lib/utils';

export function WelcomeHero() {
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
    <section className="relative h-screen w-full overflow-hidden">
      {showImage && (
        <picture className="absolute inset-0">
          <source srcSet="/images/welcome.png" type="image/png" />
          <img
            src="/images/welcome.png"
            alt="Welcome iPhone hero"
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
        </picture>
      )}

      <div className="absolute inset-0">
        <ManagedInlineVideo
          src="/videos/welcome.mp4"
          ariaLabel="Welcome iPhone hero video"
          autoplay
          muted
          playsInline
          preload="auto"
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

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background" />

      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-5xl px-6 pb-14">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl">
          iPhone 17 Pro Max
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-base text-foreground/80 md:text-lg">
          Pro, taken further. Scroll to explore the story.
        </p>
        <div className="mt-10 inline-flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-foreground/70 uppercase">
          <span>Scroll</span>
          <ChevronDown className="h-4 w-4 scroll-prompt motion-reduce:animate-none" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
