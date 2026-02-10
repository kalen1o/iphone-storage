import { useState } from 'react';
import { ManagedInlineVideo } from '~/components/media/ManagedInlineVideo';
import { cn } from '~/lib/utils';

export function PreviewSection({ className }: { className?: string }) {
  const [hasEnded, setHasEnded] = useState(false);

  return (
    <section className={cn('relative w-full', className)}>
      <div
        className={cn(
          'mx-auto grid w-full max-w-6xl min-h-[100svh] items-center gap-10 px-6 py-16 md:py-24',
          'transition-[grid-template-columns] duration-500',
          hasEnded ? 'md:grid-cols-[0.7fr_1.3fr]' : 'md:grid-cols-[0.9fr_1.1fr]',
        )}
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            A quick preview
          </h2>
          <p className="mt-4 text-base text-foreground/80">
            Scroll here to auto-play the preview (muted). When it ends, the player grows for a closer look—hover
            the video to reveal a replay button, or scroll away and back to play again.
          </p>
        </div>

        <div
          className={cn(
            'overflow-hidden border border-foreground/10 bg-secondary/30 shadow-[0_28px_90px_-70px_rgba(0,0,0,0.85)] ring-1 ring-white/5',
            'transition-[border-radius] duration-500',
            hasEnded ? 'rounded-3xl' : 'rounded-2xl',
          )}
        >
          <ManagedInlineVideo
            src="/videos/preview.mp4"
            ariaLabel="iPhone preview video"
            autoplayInView
            muted
            playsInline
            preload="none"
            unloadOnLeave
            showReplayButton
            replayLabel="Replay preview"
            replayButtonMode="hover"
            className={cn(
              'w-full object-cover transition-[aspect-ratio] duration-500',
              hasEnded ? 'aspect-[4/3]' : 'aspect-video',
            )}
            onEnded={() => setHasEnded(true)}
          />
        </div>
      </div>
    </section>
  );
}
