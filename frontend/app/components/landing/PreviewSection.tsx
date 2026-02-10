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
          'md:grid-cols-[0.85fr_1.15fr]',
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
            'rounded-2xl transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
            hasEnded &&
              'hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-secondary/35 hover:shadow-[0_34px_110px_-78px_rgba(0,0,0,0.95)]',
            'motion-reduce:transition-none motion-reduce:hover:transform-none',
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
              'w-full aspect-video object-cover',
              hasEnded &&
                'will-change-transform transition-transform duration-200 ease-fx-standard group-hover:scale-[1.01] motion-reduce:transition-none motion-reduce:transform-none',
            )}
            onPlayFromStart={() => setHasEnded(false)}
            onEnded={() => setHasEnded(true)}
          />
        </div>
      </div>
    </section>
  );
}
