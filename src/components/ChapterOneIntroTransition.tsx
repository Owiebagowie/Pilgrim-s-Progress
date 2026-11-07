import React from 'react';

export type IntroPhase =
  | 'IDLE'
  | 'FADE_TO_BLACK'
  | 'QUOTE_VISIBLE'
  | 'QUOTE_FADE_OUT'
  | 'BLACK_FADE_TO_PARCHMENT'
  | 'COMPLETE';

interface ChapterOneIntroTransitionProps {
  phase: IntroPhase;
}

export const ChapterOneIntroTransition: React.FC<ChapterOneIntroTransitionProps> = ({
  phase,
}) => {
  const isBlackVisible =
    phase === 'FADE_TO_BLACK' ||
    phase === 'QUOTE_VISIBLE' ||
    phase === 'QUOTE_FADE_OUT';

  const isQuoteVisible = phase === 'QUOTE_VISIBLE';

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#050201] flex items-center justify-center transition-opacity duration-[1400ms] ease-in-out ${
        isBlackVisible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* White Opening Lines of The Pilgrim's Progress */}
      <div
        className={`relative z-10 max-w-4xl px-10 text-center transition-all duration-700 ease-out ${
          isQuoteVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-2 scale-[0.99]'
        }`}
      >
        <p
          className="text-white text-[28px] sm:text-[34px] md:text-[38px] leading-[1.55] tracking-wide select-none"
          style={{
            fontFamily: "'IM Fell English', serif",
            textShadow: '0 2px 18px rgba(255, 255, 255, 0.18)',
          }}
        >
          &ldquo;As I walked through the wilderness of this world, I lighted on a
          certain place where was a Den, and I laid me down in that place to
          sleep: and, as I slept, I dreamed a dream.&rdquo;
        </p>
      </div>
    </div>
  );
};
