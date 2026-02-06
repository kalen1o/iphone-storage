import { useEffect, useRef, useState } from 'react';

import { PreviewSection } from '~/components/landing/PreviewSection';
import { ColorPickerSection } from '~/components/landing/ColorPickerSection';
import { cn } from '~/lib/utils';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HorizontalPreviewColor() {
  const pinRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [enableHorizontal, setEnableHorizontal] = useState(false);

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

        gsap.set(trackEl, { x: 0 });
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
          <PreviewSection className={enableHorizontal ? 'w-screen flex-none' : undefined} />
          <ColorPickerSection className={enableHorizontal ? 'w-screen flex-none' : undefined} />
        </div>
      </div>
    </section>
  );
}
