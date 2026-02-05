import { motion } from 'framer-motion';

interface StoryBeatProps {
  children: React.ReactNode;
  opacity: number;
  zIndex: number;
}

export function StoryBeat({ children, opacity, zIndex }: StoryBeatProps) {
  return (
    <motion.div
      initial={{ opacity }}
      animate={{ opacity }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex }}
    >
      {children}
    </motion.div>
  );
}
