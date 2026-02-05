import { VideoScrollPlayer, useScrollProgress } from '~/components/animation/VideoScrollPlayer';
import {
  HeroContent,
  EngineeringContent,
  PerformanceContent,
  CameraContent,
  ReassemblyContent,
} from '~/components/animation/content';
import { STORY_BEATS } from '~/constants/images';
import { motion } from 'framer-motion';
import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export function meta() {
  return [
    { title: 'iPhone 17 Pro Max - The Most Advanced iPhone Ever' },
    { description: 'Pro, taken further. The most advanced iPhone ever created.' },
    { viewport: 'width=device-width,initial-scale=1' },
  ];
}

export default function Home() {
  const progress = useScrollProgress();

  const getBeatOpacity = (beatStart: number, beatEnd: number): number => {
    const fadeRange = 0.05;

    if (progress < beatStart - fadeRange) return 0;
    if (progress > beatEnd + fadeRange) return 0;

    if (progress < beatStart) {
      return Math.max(0, (progress - (beatStart - fadeRange)) / fadeRange);
    }

    if (progress > beatEnd) {
      return Math.max(0, 1 - (progress - beatEnd) / fadeRange);
    }

    return 1;
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Sticky Canvas Container */}
      <div className="relative h-[400vh]">
        {/* Fixed Canvas */}
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <VideoScrollPlayer progress={progress} />

          {/* Story Beat Overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Hero Section (0-15%) */}
            <HeroContent
              opacity={getBeatOpacity(STORY_BEATS.HERO.start, STORY_BEATS.HERO.end)}
              zIndex={10}
            />

            {/* Engineering Section (15-40%) */}
            <EngineeringContent
              opacity={getBeatOpacity(STORY_BEATS.ENGINEERING.start, STORY_BEATS.ENGINEERING.end)}
              zIndex={20}
            />

            {/* Performance Section (40-65%) */}
            <PerformanceContent
              opacity={getBeatOpacity(STORY_BEATS.PERFORMANCE.start, STORY_BEATS.PERFORMANCE.end)}
              zIndex={30}
            />

            {/* Camera Section (65-85%) */}
            <CameraContent
              opacity={getBeatOpacity(STORY_BEATS.CAMERA.start, STORY_BEATS.CAMERA.end)}
              zIndex={40}
            />

            {/* Reassembly Section (85-100%) */}
            <ReassemblyContent
              opacity={getBeatOpacity(STORY_BEATS.REASSEMBLY.start, STORY_BEATS.REASSEMBLY.end)}
              zIndex={50}
            />
          </div>
        </div>
      </div>

      {/* Product CTA Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-20 bg-gradient-to-b from-background to-secondary py-20"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready to experience the future?
          </h2>
          <p className="text-xl text-foreground/80 mb-8 max-w-2xl mx-auto">
            Pre-order now and be among the first to receive your iPhone 17 Pro Max.
          </p>
          <Button asChild size="lg" className="text-lg px-8 py-6 rounded-lg">
            <Link to="/products">Shop Products</Link>
          </Button>
        </div>
      </motion.section>
    </div>
  );
}
