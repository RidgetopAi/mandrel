/**
 * Animation variants for Framer Motion
 */

export const nodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2 },
  },
  selected: {
    scale: 1.02,
    transition: { duration: 0.15 },
  },
};

export const panelVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25 },
  },
};

export const connectionVariants = {
  normal: { opacity: 0.6, strokeWidth: 1 },
  highlighted: { opacity: 1, strokeWidth: 2 },
  faded: { opacity: 0.15, strokeWidth: 1 },
};

// Scan loading animation variants
export const scanGridContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0.1,
    },
  },
};

export const scanGridCellVariants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  filled: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15 },
  },
  analyzing: {
    scale: [1, 1.1, 1],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const scanLogEntryVariants = {
  hidden: { opacity: 0, x: -20, height: 0 },
  visible: {
    opacity: 1,
    x: 0,
    height: 'auto',
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.15 },
  },
};

export const scanStatusVariants = {
  idle: { opacity: 0.5 },
  active: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
};

export const aiGlowVariants = {
  hidden: { opacity: 0, boxShadow: '0 0 0px rgba(168, 85, 247, 0)' },
  visible: {
    opacity: 1,
    boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)',
    transition: { duration: 0.3 },
  },
  pulse: {
    boxShadow: [
      '0 0 4px rgba(168, 85, 247, 0.3)',
      '0 0 12px rgba(168, 85, 247, 0.6)',
      '0 0 4px rgba(168, 85, 247, 0.3)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const scanOverlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

export const fadeInVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

export const slideUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};
