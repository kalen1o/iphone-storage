import { ManagedInlineVideo } from '~/components/media/ManagedInlineVideo';

export function PreviewSection() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-6 py-24">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            A quick preview
          </h2>
          <p className="mt-4 text-base text-foreground/80">
            Scroll here to play the preview. When it ends, you can replay it.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-secondary/30">
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
            className="aspect-video w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

