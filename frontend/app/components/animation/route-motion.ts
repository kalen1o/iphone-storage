import type { Transition, Variants } from "framer-motion";

export const springTransition: Transition = {
  damping: 24,
  mass: 0.7,
  stiffness: 140,
  type: "spring",
};

export const smoothTransition: Transition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1],
};

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, transition: smoothTransition, y: 0 },
};

export const fadeScaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: springTransition },
};

export const slideLeftVariants: Variants = {
  hidden: { opacity: 0, x: -36 },
  visible: { opacity: 1, transition: smoothTransition, x: 0 },
};

export const slideRightVariants: Variants = {
  hidden: { opacity: 0, x: 36 },
  visible: { opacity: 1, transition: smoothTransition, x: 0 },
};

export const staggerContainer = (delayChildren = 0, staggerChildren = 0.08): Variants => ({
  hidden: {},
  visible: {
    transition: {
      delayChildren,
      staggerChildren,
    },
  },
});

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, transition: smoothTransition, y: 0 },
};
