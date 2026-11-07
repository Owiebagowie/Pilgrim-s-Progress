/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { WoodenTableBackground } from './components/WoodenTableBackground';
import { LeatherBook } from './components/LeatherBook';
import { AmbientParticles } from './components/AmbientParticles';
import {
  ChapterOneIntroTransition,
  IntroPhase,
} from './components/ChapterOneIntroTransition';
import { InkPilgrimStage } from './components/InkPilgrimStage';
import { soundFX } from './utils/sound';

interface CandleLightState {
  flickerX: number;
  flickerY: number;
  intensity: number;
}

const PARCHMENT_BG_URL =
  '/assets/aistudio/pergament-papier-hintergrund-textur-1675507787Irq_f1634d4c.jpg';

export default function App() {
  const [candleState, setCandleState] = useState<CandleLightState>({
    flickerX: 0,
    flickerY: 0,
    intensity: 1,
  });

  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [introPhase, setIntroPhase] = useState<IntroPhase>('IDLE');
  const [isPaused, setIsPaused] = useState(false);
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  const introTimeoutsRef = useRef<number[]>([]);

  const clearIntroTimeouts = () => {
    for (const id of introTimeoutsRef.current) {
      window.clearTimeout(id);
    }
    introTimeoutsRef.current = [];
  };

  // Preload and pre-decode the parchment image on initial mount so it is already in GPU memory
  useEffect(() => {
    const img = new Image();
    img.src = PARCHMENT_BG_URL;
    if (img.decode) {
      img.decode().catch(() => {});
    }
  }, []);

  // Listen for "P" key or Bluetooth Controller "Y" button (buttons[3]) to pause/resume when playing a chapter
  useEffect(() => {
    if (activeChapter === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyP' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        soundFX.playPageTurn('next');
        setIsPaused((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    let gpFrameId: number;
    let prevYPressed = false;

    const pollGamepadPause = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let yPressed = false;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && pad.connected && pad.buttons[3]?.pressed) {
          yPressed = true;
          break;
        }
      }
      if (yPressed && !prevYPressed) {
        soundFX.playPageTurn('next');
        setIsPaused((prev) => !prev);
      }
      prevYPressed = yPressed;
      gpFrameId = requestAnimationFrame(pollGamepadPause);
    };

    gpFrameId = requestAnimationFrame(pollGamepadPause);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(gpFrameId);
    };
  }, [activeChapter]);

  useEffect(() => {
    // Pause background menu flicker calculations once the screen is covered by ink / in a chapter
    if (activeChapter !== null) return;

    let frameId: number;
    const startTime = performance.now();

    const animateCandleLight = (now: number) => {
      const t = (now - startTime) * 0.001;

      // Multi-frequency harmonic waves for organic top-left candlelight movement
      const flickerX =
        Math.sin(t * 3.7) * 0.45 +
        Math.sin(t * 7.9 + 1.2) * 0.3 +
        Math.cos(t * 14.3) * 0.15;

      const flickerY =
        Math.cos(t * 4.3) * 0.4 +
        Math.sin(t * 9.1 + 0.7) * 0.25 +
        Math.sin(t * 16.5) * 0.12;

      const intensity =
        1.0 +
        Math.sin(t * 5.2) * 0.065 +
        Math.cos(t * 11.8) * 0.04 +
        Math.sin(t * 21.0) * 0.02;

      setCandleState({
        flickerX,
        flickerY,
        intensity,
      });

      frameId = requestAnimationFrame(animateCandleLight);
    };

    frameId = requestAnimationFrame(animateCandleLight);
    return () => cancelAnimationFrame(frameId);
  }, [activeChapter]);

  const handleBeginChapter = (chapterNum: number) => {
    if (introPhase !== 'IDLE' || activeChapter !== null) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    clearIntroTimeouts();
    setIsPaused(false);
    setIsDialogueActive(chapterNum === 1);
    soundFX.playPageTurn('next');
    setIntroPhase('FADE_TO_BLACK');

    if (chapterNum === 1) {
      // Chapter 1: Fade to dark black -> display opening words -> fade to parchment paper
      introTimeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveChapter(1);
          setIntroPhase('QUOTE_VISIBLE');
        }, 1450),
        window.setTimeout(() => {
          setIntroPhase('QUOTE_FADE_OUT');
        }, 6200),
        window.setTimeout(() => {
          setIntroPhase('BLACK_FADE_TO_PARCHMENT');
        }, 7000),
        window.setTimeout(() => {
          setIntroPhase('COMPLETE');
        }, 8450)
      );
    } else {
      // Chapters 2–10: Fade to dark black -> fade directly into the parchment paper (no quote)
      introTimeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveChapter(chapterNum);
        }, 1450),
        window.setTimeout(() => {
          setIntroPhase('BLACK_FADE_TO_PARCHMENT');
        }, 1650),
        window.setTimeout(() => {
          setIntroPhase('COMPLETE');
        }, 3100)
      );
    }
  };

  const handleResumeChapter = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundFX.playPageTurn('next');
    setIsPaused(false);
  };

  const handleReturnToMainMenu = () => {
    clearIntroTimeouts();
    soundFX.playBookClose();
    setIsPaused(false);
    setIsDialogueActive(false);
    setActiveChapter(null);
    setIntroPhase('IDLE');
  };

  const handleNextChapter = (nextChapterNum: number) => {
    clearIntroTimeouts();
    setIsPaused(false);
    setIsDialogueActive(false);
    soundFX.playPageTurn('next');
    setIntroPhase('FADE_TO_BLACK');
    introTimeoutsRef.current.push(
      window.setTimeout(() => {
        setActiveChapter(nextChapterNum);
      }, 1450),
      window.setTimeout(() => {
        setIntroPhase('BLACK_FADE_TO_PARCHMENT');
      }, 1650),
      window.setTimeout(() => {
        setIntroPhase('COMPLETE');
      }, 3100)
    );
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden flex items-center justify-center bg-[#120804]">
      {/* Always-mounted GPU-composited Parchment Stage Layer */}
      <div
        className={`fixed inset-0 z-30 w-screen h-screen overflow-hidden will-change-opacity ${
          activeChapter !== null
            ? isPaused || isDialogueActive
              ? 'opacity-100 pointer-events-auto cursor-auto'
              : 'opacity-100 pointer-events-auto cursor-none'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <img
          src={PARCHMENT_BG_URL}
          alt="Parchment game stage"
          decoding="sync"
          fetchPriority="high"
          draggable={false}
          className="w-full h-full object-fill select-none pointer-events-none block"
        />
        <InkPilgrimStage
          active={activeChapter !== null}
          chapter={activeChapter}
          paused={isPaused}
          introPhase={introPhase}
          onDialogueModeChange={setIsDialogueActive}
          onReturnToMenu={handleReturnToMainMenu}
          onNextChapter={handleNextChapter}
        />

        {/* Pause Menu Overlay when pressing "P" or Controller "Y" during a chapter */}
        {activeChapter !== null && isPaused && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0C0502]/65 backdrop-blur-[2px] select-none">
            <div
              className="relative w-[440px] px-10 py-9 flex flex-col items-center text-center rounded-sm border-[3.5px] border-[#140603] shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
              style={{
                background:
                  'linear-gradient(180deg, #F6E6B8 0%, #EAD39C 55%, #D8BC82 100%)',
                fontFamily: "'IM Fell English', serif",
                textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
              }}
            >
              {/* Inner 17th-century double-ruled ink border */}
              <div className="pointer-events-none absolute inset-[7px] border-[1.8px] border-[#1A0803]/75" />

              <h2
                className="text-[38px] leading-tight tracking-wide text-[#0E0502]"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                Chapter Paused
              </h2>

              {/* Hand-inked ornamental divider */}
              <div className="my-3 flex items-center justify-center gap-2.5 w-56 opacity-85">
                <span className="h-[1.8px] flex-1 bg-[#1A0803]" />
                <span className="w-2 h-2 rotate-45 bg-[#1A0803]" />
                <span className="h-[1.8px] flex-1 bg-[#1A0803]" />
              </div>

              <div className="mt-4 flex flex-col items-center gap-5 w-full">
                {/* Option 1: Resume Chapter */}
                <button
                  type="button"
                  onClick={handleResumeChapter}
                  className="group flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
                  style={{
                    fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                  }}
                >
                  <span className="w-56 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                  <span className="text-[26px] leading-tight tracking-[0.06em] px-3 py-0.5">
                    Resume Chapter
                  </span>
                  <span className="w-56 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                </button>

                {/* Option 2: Return To Main Menu */}
                <button
                  type="button"
                  onClick={handleReturnToMainMenu}
                  className="group flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
                  style={{
                    fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                  }}
                >
                  <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                  <span className="text-[25px] leading-tight tracking-[0.06em] px-3 py-0.5">
                    Return To Main Menu
                  </span>
                  <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Menu Scene (Wooden Table, Leather-Bound Book, Ambient Particles) */}
      <div
        className={`relative w-full h-full flex items-center justify-center ${
          activeChapter !== null ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Wooden Table Surface with Knots, Striations & Dynamic Top-Left Candlelight */}
        <WoodenTableBackground
          flickerX={candleState.flickerX}
          flickerY={candleState.flickerY}
          intensity={candleState.intensity}
        />

        {/* Center of the Table: The Pilgrim's Progress Leather-Bound Book */}
        <div className="relative z-20 w-full max-w-[1440px] h-full flex items-center justify-center px-6">
          <LeatherBook
            flickerX={candleState.flickerX}
            flickerY={candleState.flickerY}
            intensity={candleState.intensity}
            onBeginChapter={handleBeginChapter}
          />
        </div>

        {/* Subtle Animated Ambient Dust Particles Drifting Across the Table */}
        <AmbientParticles
          flickerX={candleState.flickerX}
          flickerY={candleState.flickerY}
          intensity={candleState.intensity}
        />
      </div>

      {/* Chapter 1 Ink Spill, Opening Quote, and Black-to-Parchment Fade Overlay */}
      <ChapterOneIntroTransition phase={introPhase} />
    </main>
  );
}
