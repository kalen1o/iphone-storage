import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ManagedInlineVideoProps {
  src: string;
  ariaLabel: string;
  className?: string;

  autoplay?: boolean;
  autoplayInView?: boolean;
  inViewThreshold?: number;

  muted?: boolean;
  playsInline?: boolean;
  loop?: boolean;

  preload?: 'none' | 'metadata' | 'auto';

  showReplayButton?: boolean;
  replayLabel?: string;

  unloadOnEnd?: boolean;
  unloadOnLeave?: boolean;

  onEnded?: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ManagedInlineVideo({
  src,
  ariaLabel,
  className,
  autoplay = false,
  autoplayInView = false,
  inViewThreshold = 0.6,
  muted = true,
  playsInline = true,
  loop = false,
  preload = 'none',
  showReplayButton = false,
  replayLabel = 'Replay',
  unloadOnEnd = false,
  unloadOnLeave = false,
  onEnded,
}: ManagedInlineVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const loadSrc = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.getAttribute('src') === src) return;
    video.setAttribute('src', src);
    video.load();
    setHasLoadedOnce(true);
  }, [src]);

  const unloadSrc = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  const playFromStart = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    loadSrc();
    try {
      video.currentTime = 0;
    } catch {
      // ignore seek errors
    }
    setHasEnded(false);
    try {
      await video.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }, [loadSrc]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!autoplay) return;
    if (reducedMotion) return;
    void playFromStart();
  }, [autoplay, reducedMotion, playFromStart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!autoplayInView) return;
    if (reducedMotion) return;

    const el = containerRef.current;
    if (!el) return;

    let hasAutoPlayed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= inViewThreshold) {
          if (!hasAutoPlayed) {
            hasAutoPlayed = true;
            void playFromStart();
          }
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.pause();
        if (unloadOnLeave && hasEnded) {
          unloadSrc();
        }
      },
      { threshold: [0, inViewThreshold, 1] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoplayInView, inViewThreshold, reducedMotion, playFromStart, unloadOnLeave, hasEnded, unloadSrc]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!unloadOnLeave) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) return;
        if (!hasLoadedOnce) return;
        if (!hasEnded) return;
        unloadSrc();
      },
      { threshold: [0] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [unloadOnLeave, hasLoadedOnce, hasEnded, unloadSrc]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <video
        ref={videoRef}
        aria-label={ariaLabel}
        role="img"
        className={className}
        muted={muted}
        playsInline={playsInline}
        preload={preload}
        loop={loop}
        onEnded={() => {
          setHasEnded(true);
          onEnded?.();
          if (unloadOnEnd) unloadSrc();
        }}
      />

      {showReplayButton && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-6">
          {(hasEnded || reducedMotion || playbackBlocked) && (
            <button
              type="button"
              className="pointer-events-auto inline-flex items-center justify-center rounded-full bg-background/80 px-5 py-3 text-sm font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-background"
              onClick={() => void playFromStart()}
              aria-label={replayLabel}
            >
              {replayLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
