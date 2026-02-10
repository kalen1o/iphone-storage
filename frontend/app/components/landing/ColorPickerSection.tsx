import { useEffect, useRef, useState } from 'react';
import { cn } from '~/lib/utils';

type ColorOption = {
  id: string;
  label: string;
  imageSrc: string;
};

const COLOR_OPTIONS: ColorOption[] = [
  { id: 'orange', label: 'Cosmic Orange', imageSrc: '/images/orange.png' },
  { id: 'white', label: 'Starlight', imageSrc: '/images/white.png' },
  { id: 'dark', label: 'Midnight', imageSrc: '/images/dark.png' },
];

export function ColorPickerSection({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState(COLOR_OPTIONS[0]?.id ?? 'orange');
  const [shouldPreload, setShouldPreload] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (shouldPreload) return;

    const node = sectionRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setShouldPreload(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShouldPreload(true);
          observer.disconnect();
          break;
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldPreload]);

  useEffect(() => {
    if (!shouldPreload) return;

    const imageSrcs = new Set(COLOR_OPTIONS.map((option) => option.imageSrc));
    for (const src of imageSrcs) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  }, [shouldPreload]);

  const selectColor = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
  };

  return (
    <section
      ref={sectionRef}
      className={cn('relative w-full overflow-hidden', className)}
    >
      <div className="absolute inset-0 z-0">
        {shouldPreload &&
          COLOR_OPTIONS.map((option) => {
            const isActive = option.id === activeId;
            return (
              <picture key={option.id} className="absolute inset-0">
                <source srcSet={option.imageSrc} type="image/png" />
                <img
                  src={option.imageSrc}
                  alt=""
                  aria-hidden={!isActive}
                  className={cn(
                    'h-full w-full object-cover transition-opacity duration-700',
                    'scale-[1.05] brightness-75 saturate-125',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  draggable={false}
                  loading={isActive ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </picture>
            );
          })}
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl min-h-[100svh] items-center gap-10 px-6 py-16 md:py-24">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Choose your finish
          </h2>
          <p className="mt-4 text-base text-foreground/80">
            Switch colors to preview the look. Transitions are kept lightweight for performance.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {COLOR_OPTIONS.map((option) => {
              const isActive = option.id === activeId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectColor(option.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
                    'transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-fx-snappy',
                    'active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:transform-none',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_18px_56px_-44px_hsl(var(--primary)/0.6)]'
                      : 'border-foreground/15 bg-background/40 hover:border-foreground/25 hover:bg-secondary/40 hover:shadow-[0_18px_60px_-48px_rgba(0,0,0,0.7)]',
                  )}
                  aria-pressed={isActive}
                >
                  <span
                    className={cn(
                      'h-3 w-3 rounded-full border border-foreground/10',
                      option.id === 'orange' && 'bg-orange-500',
                      option.id === 'white' && 'bg-neutral-200',
                      option.id === 'dark' && 'bg-neutral-800',
                    )}
                    aria-hidden="true"
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
