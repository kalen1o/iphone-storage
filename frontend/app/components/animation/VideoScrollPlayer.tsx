import { useEffect, useRef, useState } from "react";

interface VideoScrollPlayerProps {
  progress: number; // 0 to 1
}

const STORY_SCROLL_SELECTOR = "#story-scroll";

function prefersReducedMotion(): boolean {
  if (typeof globalThis.window === "undefined" || !("matchMedia" in globalThis)) {
    return false;
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getElementScrollProgress(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const startY = rect.top + window.scrollY;
  const endY = startY + element.offsetHeight - window.innerHeight;
  const denom = Math.max(1, endY - startY);
  return clamp01((window.scrollY - startY) / denom);
}

export function VideoScrollPlayer({ progress }: VideoScrollPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const hasInitialized = useRef(false);
  const quickSetTimeRef = useRef<null | ((time: number) => void)>(null);

  // Handle video ready state using ref callback for more reliable initialization
  const handleVideoRef = (video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (!video || hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const handleReady = () => {
      setIsReady(true);
    };

    // Listen for multiple events to ensure we catch when video is ready
    video.addEventListener("loadedmetadata", handleReady);
    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("canplay", handleReady);
    video.addEventListener("canplaythrough", handleReady);

    // Explicitly trigger video loading
    setTimeout(() => {
      video.load();
    }, 100);
  };

  // Optional GSAP-powered smoothing when updating currentTime
  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const video = videoRef.current;
    if (!video || !isReady || !video.duration) {
      return;
    }

    let cancelled = false;
    let quickTo: any = null;

    (async () => {
      const gsapModule: any = await import("gsap");
      const gsap = gsapModule.gsap ?? gsapModule.default ?? gsapModule;
      if (cancelled) {
        return;
      }

      quickTo = gsap.quickTo(video, "currentTime", { duration: 0.08, ease: "none" });
      quickSetTimeRef.current = (time: number) => quickTo(time);
    })().catch((error) => {
      console.error("Failed to init GSAP video scrubbing:", error);
    });

    return () => {
      cancelled = true;
      quickSetTimeRef.current = null;
      quickTo?.tween?.kill?.();
    };
  }, [isReady]);

  // Sync video playback position with scroll progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isReady || !video.duration) {
      return;
    }

    const seekTime = progress * video.duration;

    const quickSetTime = quickSetTimeRef.current;
    if (quickSetTime) {
      quickSetTime(seekTime);
      return;
    }

    // Debounce seeks to prevent performance issues during rapid scrolling
    if (isSeeking) {
      return;
    }

    // Only seek if difference is significant (prevents unnecessary seeks)
    // 0.05s threshold = 3 frames at 60fps, provides smooth experience
    if (Math.abs(video.currentTime - seekTime) > 0.05) {
      setIsSeeking(true);
      video.currentTime = seekTime;

      // Reset seeking flag after seek completes
      const resetSeeking = () => {
        setIsSeeking(false);
      };
      video.addEventListener("seeked", resetSeeking, { once: true });
    }
  }, [progress, isReady, isSeeking]);

  return (
    <>
      {/* Loading overlay */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20">
          <div className="text-center">
            <div className="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">Loading experience...</p>
          </div>
        </div>
      )}

      {/* Video element (always rendered) */}
      <video
        ref={handleVideoRef}
        src="/videos/iphone-4k.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      />
    </>
  );
}

// Hook to track scroll progress for the hero story section.
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof globalThis.window === "undefined") {
      return;
    }

    const storyEl = document.querySelector(STORY_SCROLL_SELECTOR) as HTMLElement | null;
    if (!storyEl) {
      const handleScroll = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(clamp01(scrollTop / Math.max(1, docHeight)));
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener("scroll", handleScroll);
    }

    if (prefersReducedMotion()) {
      const handleScroll = () => setProgress(getElementScrollProgress(storyEl));
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleScroll);
      handleScroll();
      return () => {
        window.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleScroll);
      };
    }

    let cancelled = false;
    let trigger: any = null;

    const fallback = () => setProgress(getElementScrollProgress(storyEl));

    (async () => {
      const gsapModule: any = await import("gsap");
      const stModule: any = await import("gsap/ScrollTrigger");
      const gsap = gsapModule.gsap ?? gsapModule.default ?? gsapModule;
      const ScrollTrigger = stModule.ScrollTrigger ?? stModule.default ?? stModule;

      gsap.registerPlugin(ScrollTrigger);
      if (cancelled) {
        return;
      }

      trigger = ScrollTrigger.create({
        end: "bottom bottom",
        onUpdate: (self: any) => setProgress(self.progress),
        start: "top top",
        trigger: storyEl,
      });

      setProgress(trigger?.progress ?? 0);
      ScrollTrigger.refresh();
    })().catch((error) => {
      console.error("Failed to init GSAP ScrollTrigger progress:", error);
      fallback();
      window.addEventListener("scroll", fallback, { passive: true });
      window.addEventListener("resize", fallback);
    });

    return () => {
      cancelled = true;
      trigger?.kill?.();
      window.removeEventListener("scroll", fallback);
      window.removeEventListener("resize", fallback);
    };
  }, []);

  return progress;
}
