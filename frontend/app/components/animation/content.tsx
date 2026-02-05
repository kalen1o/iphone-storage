import { StoryBeat } from './StoryBeat';
import { STORY_BEAT_CONTENT } from '~/constants/content';
import { motion } from 'framer-motion';
import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export function HeroContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col items-center justify-center text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl"
        >
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 tracking-tight">
            {STORY_BEAT_CONTENT.HERO.headline}
          </h1>
          <p className="text-2xl md:text-3xl text-white/80 mb-8">
            {STORY_BEAT_CONTENT.HERO.subheadline}
          </p>
          <p className="text-lg text-primary font-medium">
            {STORY_BEAT_CONTENT.HERO.tagline}
          </p>
          <Button asChild size="lg" className="mt-8 text-xl px-8 py-6 rounded-lg">
            <Link to="/products">Buy Now</Link>
          </Button>
        </motion.div>
      </div>
    </StoryBeat>
  );
}

export function EngineeringContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col justify-center px-6 md:px-20">
        <div className="max-w-3xl">
          <motion.h2
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-white mb-8"
          >
            {STORY_BEAT_CONTENT.ENGINEERING.headline}
          </motion.h2>
          {STORY_BEAT_CONTENT.ENGINEERING.subcopy.map((line, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="text-xl md:text-2xl text-white/80 mb-6"
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
    </StoryBeat>
  );
}

export function PerformanceContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col justify-center px-6 md:px-20 items-end">
        <div className="max-w-3xl text-right">
          <motion.h2
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-white mb-8"
          >
            {STORY_BEAT_CONTENT.PERFORMANCE.headline}
          </motion.h2>
          {STORY_BEAT_CONTENT.PERFORMANCE.subcopy.map((line, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="text-xl md:text-2xl text-white/80 mb-6"
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
    </StoryBeat>
  );
}

export function CameraContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-white mb-8"
          >
            {STORY_BEAT_CONTENT.CAMERA.headline}
          </motion.h2>
          {STORY_BEAT_CONTENT.CAMERA.subcopy.map((line, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="text-xl md:text-2xl text-white/80 mb-6"
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
    </StoryBeat>
  );
}

export function ReassemblyContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-white mb-6"
          >
            {STORY_BEAT_CONTENT.REASSEMBLY.headline}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl md:text-3xl text-white/80 mb-8"
          >
            {STORY_BEAT_CONTENT.REASSEMBLY.subheadline}
          </motion.p>
          <Button asChild size="lg" className="text-xl px-8 py-6 rounded-lg">
            <Link to="/products">{STORY_BEAT_CONTENT.REASSEMBLY.cta}</Link>
          </Button>
        </div>
      </div>
    </StoryBeat>
  );
}
