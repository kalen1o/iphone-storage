import { useEffect, useRef, useState } from 'react';

interface VideoScrollPlayerProps {
  progress: number; // 0 to 1
}

export function VideoScrollPlayer({ progress }: VideoScrollPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const hasInitialized = useRef(false);

  // Handle video ready state using ref callback for more reliable initialization
  const handleVideoRef = (video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (!video || hasInitialized.current) return;
    hasInitialized.current = true;

    console.log('Video ref attached, setting up listeners');
    console.log('Video src:', video.src);

    const handleReady = () => {
      console.log('Video is ready, duration:', video.duration, 'readyState:', video.readyState);
      setIsReady(true);
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      const error = (e.target as HTMLVideoElement).error;
      if (error) {
        console.error('Video error code:', error.code);
        console.error('Video error message:', error.message);
      }
    };

    const handleLoadStart = () => {
      console.log('Video load started');
    };

    const handleCanPlay = () => {
      console.log('Video can play, readyState:', video.readyState);
    };

    // Listen for multiple events to ensure we catch when video is ready
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('canplaythrough', handleReady);
    video.addEventListener('error', handleError);

    // Explicitly trigger video loading
    setTimeout(() => {
      console.log('Calling video.load()');
      video.load();
    }, 100);
  };

  // Sync video playback position with scroll progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isReady || !video.duration) return;

    // Debounce seeks to prevent performance issues during rapid scrolling
    if (isSeeking) return;

    const seekTime = progress * video.duration;

    // Only seek if difference is significant (prevents unnecessary seeks)
    // 0.05s threshold = 3 frames at 60fps, provides smooth experience
    if (Math.abs(video.currentTime - seekTime) > 0.05) {
      setIsSeeking(true);
      video.currentTime = seekTime;

      // Reset seeking flag after seek completes
      const resetSeeking = () => {
        setIsSeeking(false);
      };
      video.addEventListener('seeked', resetSeeking, { once: true });
    }
  }, [progress, isReady, isSeeking]);

  return (
    <>
      {/* Loading overlay */}
      {!isReady && (
        <div className="fixed inset-0 flex items-center justify-center bg-background-primary z-50">
          <div className="text-center">
            <div className="w-16 h-16 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">Loading experience...</p>
          </div>
        </div>
      )}

      {/* Video element (always rendered) */}
      <video
        ref={handleVideoRef}
        src="/videos/iphone-4k.mp4"
        className="fixed inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      />
    </>
  );
}

// Hook to track scroll progress (reused from ImageSequencePlayer)
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollProgress = Math.min(scrollTop / docHeight, 1);
      setProgress(scrollProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return progress;
}
