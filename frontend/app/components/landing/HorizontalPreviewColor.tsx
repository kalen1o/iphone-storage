import { useEffect, useRef, useState } from 'react';

import { PreviewSection } from '~/components/landing/PreviewSection';
import { ColorPickerSection } from '~/components/landing/ColorPickerSection';
import { FeaturesSection } from '~/components/landing/FeaturesSection';
import { cn } from '~/lib/utils';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HorizontalPreviewColor() {
  const pinRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [enableHorizontal, setEnableHorizontal] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prefersReducedMotion()) return;
    setEnableHorizontal(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enableHorizontal) return;

    const pinEl = pinRef.current;
    const trackEl = trackRef.current;
    if (!pinEl || !trackEl) return;

    let cancelled = false;
    let ctx: any = null;

    (async () => {
      const gsapModule: any = await import('gsap');
      const stModule: any = await import('gsap/ScrollTrigger');
      const gsap = gsapModule.gsap ?? gsapModule.default ?? gsapModule;
      const ScrollTrigger = stModule.ScrollTrigger ?? stModule.default ?? stModule;

      gsap.registerPlugin(ScrollTrigger);
      if (cancelled) return;

      ctx = gsap.context(() => {
        const getDistance = () => Math.max(0, trackEl.scrollWidth - pinEl.clientWidth);
        const getActiveIndex = (progress: number) => {
          const panelCount = Math.max(1, trackEl.children?.length ?? 0);
          if (panelCount <= 1) return 0;
          const clamped = Math.min(1, Math.max(0, progress));
          return Math.round(clamped * (panelCount - 1));
        };

        gsap.set(trackEl, { x: 0 });
        let lastIndex = -1;
        gsap.to(trackEl, {
          x: () => -getDistance(),
          ease: 'none',
          scrollTrigger: {
            trigger: pinEl,
            start: 'top top',
            end: () => `+=${getDistance()}`,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self: any) => {
              const nextIndex = getActiveIndex(self?.progress ?? 0);
              if (nextIndex === lastIndex) return;
              lastIndex = nextIndex;
              setActiveIndex(nextIndex);
            },
          },
        });

        ScrollTrigger.refresh();
      }, pinEl);
    })().catch((err) => {
      console.error('Failed to init horizontal scroll sections:', err);
    });

    return () => {
      cancelled = true;
      ctx?.revert?.();
    };
  }, [enableHorizontal]);

  const panelClass = (index: number) =>
    cn(
      enableHorizontal ? 'w-screen flex-none' : 'w-full',
      enableHorizontal && (activeIndex === index ? 'opacity-100' : 'opacity-90'),
      'transition-opacity duration-300 ease-out motion-reduce:transition-none',
    );

  return (
    <section className="relative w-full">
      <div
        ref={pinRef}
        className={cn('relative w-full', enableHorizontal && 'h-[100svh] overflow-hidden')}
      >
        <div
          ref={trackRef}
          className={cn(
            'flex',
            enableHorizontal ? 'h-full w-[200vw]' : 'w-full flex-col',
          )}
        >
          <div className={panelClass(0)}>
            <PreviewSection />
          </div>
          <div className={panelClass(1)}>
            <ColorPickerSection />
          </div>
        </div>
      </div>

      <FeaturesSection />
    </section>
  );
}
