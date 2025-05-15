import React from 'react';
import { Logo } from './Logo';
import { motion, useReducedMotion } from 'framer-motion';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  const shouldReduceMotion = useReducedMotion();

  // Split message into words for typewriter animation
  const words = message.split(' ');

  // Logo animation variants
  const logoVariants = {
    initial: { scale: 0, opacity: 0, y: 50 },
    animate: shouldReduceMotion
      ? { scale: 1, opacity: 1, y: 0 }
      : {
          scale: [1, 1.15, 1],
          opacity: 1,
          y: 0,
          transition: {
            scale: { repeat: Infinity, duration: 2, ease: 'easeInOut', times: [0, 0.5, 1] },
            opacity: { duration: 0.6 },
            y: { duration: 0.6, ease: 'easeOut' },
          },
        },
  };

  // Glow effect for logo
  const glowVariants = {
    animate: shouldReduceMotion
      ? {}
      : {
          boxShadow: [
            '0 0 10px rgba(220, 38, 38, 0.3)',
            '0 0 20px rgba(220, 38, 38, 0.5)',
            '0 0 10px rgba(220, 38, 38, 0.3)',
          ],
          transition: {
            repeat: Infinity,
            duration: 2,
            ease: 'easeInOut',
          },
        },
  };

  // Word animation for typewriter effect
  const wordVariants = {
    initial: { opacity: 0, x: -10 },
    animate: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: shouldReduceMotion ? 0 : i * 0.3 + 0.5,
        duration: 0.3,
        ease: 'easeOut',
      },
    }),
  };

  // Cursor blink for typewriter
  const cursorVariants = {
    animate: shouldReduceMotion
      ? { opacity: 0 }
      : {
          opacity: [1, 0, 1],
          transition: {
            repeat: Infinity,
            duration: 0.5,
            ease: 'linear',
          },
        },
  };

  // Progress bar animation
  const barVariants = {
    initial: { width: 0, opacity: 0 },
    animate: shouldReduceMotion
      ? { width: '8rem', opacity: 1 }
      : {
          width: '8rem',
          opacity: 1,
          transition: {
            width: { duration: 0.8, delay: 0.6, ease: 'easeOut' },
            opacity: { duration: 0.4, delay: 0.6 },
          },
        },
  };

  // Gradient pulse for progress bar
  const gradientVariants = {
    animate: shouldReduceMotion
      ? {}
      : {
          background: [
            'linear-gradient(to right, #b91c1c, #dc2626)',
            'linear-gradient(to right, #dc2626, #b91c1c)',
            'linear-gradient(to right, #b91c1c, #dc2626)',
          ],
          transition: {
            repeat: Infinity,
            duration: 3,
            ease: 'linear',
          },
        },
  };

  return (
    <div className="fixed inset-0 bg-white/95 flex flex-col items-center justify-center z-50">
      {/* Animated logo with glow */}
      <motion.div
        variants={logoVariants}
        initial="initial"
        animate="animate"
        className="relative mb-6"
        style={{ willChange: 'transform, opacity' }}
      >
        <motion.div
          variants={glowVariants}
          animate="animate"
          className="absolute inset-0"
          style={{ willChange: 'box-shadow' }}
        />
        <Logo size="md" />
      </motion.div>

      {/* Typewriter message with cursor */}
      <div className="flex flex-wrap justify-center gap-1 text-lg font-semibold text-gray-700 relative">
        {words.map((word, index) => (
          <motion.span
            key={index}
            variants={wordVariants}
            initial="initial"
            animate="animate"
            custom={index}
            style={{ willChange: 'opacity, transform' }}
          >
            {word}
            {index < words.length - 1 && '\u00A0'}
          </motion.span>
        ))}
        <motion.span
          variants={cursorVariants}
          animate="animate"
          className="inline-block w-1 h-5 bg-gray-700 ml-1"
          style={{ willChange: 'opacity' }}
        />
      </div>

      {/* Pulsating progress bar */}
      <motion.div
        variants={barVariants}
        initial="initial"
        animate="animate"
        className="mt-6 h-1 rounded-full overflow-hidden"
        style={{ width: '8rem', willChange: 'width, opacity' }}
      >
        <motion.div
          variants={gradientVariants}
          animate="animate"
          className="h-full"
          style={{ willChange: 'background' }}
        />
      </motion.div>

      <style jsx>{`
        @media (max-width: 640px) {
          .text-lg {
            font-size: 0.875rem;
          }
          [data-logo] {
            transform: scale(0.85);
          }
          .w-32 {
            width: 5rem;
          }
        }
        @media (min-width: 1280px) {
          .text-lg {
            font-size: 1.25rem;
          }
          [data-logo] {
            transform: scale(1.1);
          }
          .w-32 {
            width: 10rem;
          }
        }
      `}</style>
    </div>
  );
};