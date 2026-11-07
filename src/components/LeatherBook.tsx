import React, { useState, useEffect, useRef } from 'react';
import { soundFX } from '../utils/sound';

interface LeatherBookProps {
  flickerX: number;
  flickerY: number;
  intensity: number;
  onBeginChapter?: (chapterNum: number) => void;
}

interface FlipState {
  direction: 'next' | 'prev';
  fromSpread: number;
  toSpread: number;
  pastMidpoint: boolean;
}

export const LeatherBook: React.FC<LeatherBookProps> = ({
  flickerX,
  flickerY,
  intensity,
  onBeginChapter,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingCover, setIsAnimatingCover] = useState(false);
  // 7 spreads total:
  // Spread 0 -> Left: Table of Contents (0), Right: Chapter 1 (1)
  // Spread 1 -> Left: Chapter 2 (2), Right: Chapter 3 (3)
  // Spread 2 -> Left: Chapter 4 (4), Right: Chapter 5 (5)
  // Spread 3 -> Left: Chapter 6 (6), Right: Chapter 7 (7)
  // Spread 4 -> Left: Chapter 8 (8), Right: Chapter 9 (9)
  // Spread 5 -> Left: Chapter 10 (10), Right: THE END (11)
  // Spread 6 -> Left: HOW TO PLAY (12), Right: SETTINGS (13)
  const [currentSpread, setCurrentSpread] = useState(0);
  const [flipState, setFlipState] = useState<FlipState | null>(null);
  const [isHoveringBegin, setIsHoveringBegin] = useState(false);
  const [highlightedChapter, setHighlightedChapter] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const totalSpreads = 7; // Table of Contents + Chapters 1..10 + THE END + How To Play + Settings

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen API is blocked by browser environment
    }
  };

  const handleOpenBook = () => {
    if (isOpen || isAnimatingCover) return;
    soundFX.playBookOpen();
    setIsAnimatingCover(true);
    setCurrentSpread(0);
    setIsOpen(true);
    setTimeout(() => {
      setIsAnimatingCover(false);
    }, 820);
  };

  const handleCloseBook = () => {
    if (!isOpen || isAnimatingCover || flipState) return;
    soundFX.playBookClose();
    setIsAnimatingCover(true);
    setIsOpen(false);
    setTimeout(() => {
      setIsAnimatingCover(false);
      setCurrentSpread(0);
    }, 820);
  };

  const handleNextSpread = () => {
    if (!isOpen || isAnimatingCover || flipState) return;
    if (currentSpread < totalSpreads - 1) {
      soundFX.playPageTurn('next');
      const next = currentSpread + 1;
      setFlipState({
        direction: 'next',
        fromSpread: currentSpread,
        toSpread: next,
        pastMidpoint: false,
      });
      setTimeout(() => {
        setFlipState((prev) => (prev ? { ...prev, pastMidpoint: true } : null));
      }, 300);
    }
  };

  const handlePrevSpread = () => {
    if (!isOpen || isAnimatingCover || flipState) return;
    if (currentSpread > 0) {
      soundFX.playPageTurn('prev');
      const prev = currentSpread - 1;
      setFlipState({
        direction: 'prev',
        fromSpread: currentSpread,
        toSpread: prev,
        pastMidpoint: false,
      });
      setTimeout(() => {
        setFlipState((prev) => (prev ? { ...prev, pastMidpoint: true } : null));
      }, 300);
    } else {
      // On Spread 0, clicking the left page closes the book smoothly
      handleCloseBook();
    }
  };

  const handlePageFlipAnimationEnd = () => {
    if (!flipState) return;
    setCurrentSpread(flipState.toSpread);
    setFlipState(null);
  };

  const handleNextSpreadRef = useRef(handleNextSpread);
  handleNextSpreadRef.current = handleNextSpread;
  const handlePrevSpreadRef = useRef(handlePrevSpread);
  handlePrevSpreadRef.current = handlePrevSpread;

  // Allow keyboard Left / Right / Escape navigation when book is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight') {
        handleNextSpread();
      } else if (e.key === 'ArrowLeft') {
        handlePrevSpread();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        handleCloseBook();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Allow Bluetooth Controller Left Bumper (buttons[4]) and Right Bumper (buttons[5]) to switch pages in the book
  useEffect(() => {
    if (!isOpen) return;
    let rafId: number;
    let prevLB = false;
    let prevRB = false;

    const pollBookBumpers = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let lbPressed = false;
      let rbPressed = false;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && pad.connected) {
          if (pad.buttons[4]?.pressed) lbPressed = true;
          if (pad.buttons[5]?.pressed) rbPressed = true;
          break;
        }
      }
      if (rbPressed && !prevRB) {
        handleNextSpreadRef.current();
      } else if (lbPressed && !prevLB) {
        handlePrevSpreadRef.current();
      }
      prevLB = lbPressed;
      prevRB = rbPressed;
      rafId = requestAnimationFrame(pollBookBumpers);
    };

    rafId = requestAnimationFrame(pollBookBumpers);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  const handleJumpToChapter = (chapterNum: number) => {
    if (!isOpen || isAnimatingCover || flipState) return;
    const targetSpread = Math.floor(chapterNum / 2);
    setHighlightedChapter(chapterNum);
    setTimeout(() => {
      setHighlightedChapter((prev) => (prev === chapterNum ? null : prev));
    }, 1100);

    if (targetSpread !== currentSpread) {
      const dir = targetSpread > currentSpread ? 'next' : 'prev';
      soundFX.playPageTurn(dir);
      setFlipState({
        direction: dir,
        fromSpread: currentSpread,
        toSpread: targetSpread,
        pastMidpoint: false,
      });
      setTimeout(() => {
        setFlipState((prev) => (prev ? { ...prev, pastMidpoint: true } : null));
      }, 300);
    } else {
      soundFX.playPageTurn('next');
    }
  };

  // Compute left and right page indices for a given spread index (shifted down by 1 page for Table of Contents at 0)
  const getLeftChapter = (spread: number) => spread * 2; // 0 (Table of Contents), 2, 4, 6, 8, 10, 12 (How To Play)
  const getRightChapter = (spread: number) => spread * 2 + 1; // 1, 3, 5, 7, 9, 11 (THE END), 13 (Settings)

  const chapterData: Record<
    number,
    { title: string; summary: string; verse: string; reference: string }
  > = {
    1: {
      title: 'The City Of Destruction',
      summary:
        'Christian learns of the coming judgment and leaves his old life in search of the Celestial City.',
      verse:
        'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
      reference: 'Matthew 11:28',
    },
    2: {
      title: 'The Slough Of Despond',
      summary:
        'Overwhelmed by guilt and fear, Christian falls into the Slough of Despond and struggles to continue his journey.',
      verse:
        'Why art thou cast down, O my soul? and why art thou disquieted within me? hope thou in God.',
      reference: 'Psalm 42:11',
    },
    3: {
      title: 'The Wicket Gate',
      summary:
        'Christian ignores worldly advice and reaches the Wicket Gate, where he is welcomed onto the path of life.',
      verse: 'Enter ye in at the strait gate.',
      reference: 'Matthew 7:13',
    },
    4: {
      title: "The Interpreter's House",
      summary:
        'Christian receives important lessons that teach him about faith, obedience, and the Christian life.',
      verse: 'Thy word is a lamp unto my feet, and a light unto my path.',
      reference: 'Psalm 119:105',
    },
    5: {
      title: 'The Cross And The Burden',
      summary:
        'Christian arrives at the Cross, where his burden finally falls from his back and rolls away forever.',
      verse: 'Looking unto Jesus the author and finisher of our faith.',
      reference: 'Hebrews 12:2',
    },
    6: {
      title: 'Hill Difficulty',
      summary:
        'Christian must persevere through a steep and challenging climb while others choose easier paths.',
      verse: 'Let us run with patience the race that is set before us.',
      reference: 'Hebrews 12:1',
    },
    7: {
      title: 'Palace Beautiful',
      summary:
        'Christian finds rest, encouragement, and new armor from fellow believers before continuing onward.',
      verse: 'Put on the whole armour of God.',
      reference: 'Ephesians 6:11',
    },
    8: {
      title: 'The Valley Of Humiliation',
      summary:
        'Christian confronts Apollyon, a fierce enemy who seeks to turn him away from his journey.',
      verse: 'Resist the devil, and he will flee from you.',
      reference: 'James 4:7',
    },
    9: {
      title: 'The Valley Of The Shadow Of Death',
      summary:
        'Christian travels through a terrifying valley filled with darkness, danger, and fear, trusting God to guide him.',
      verse:
        'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
      reference: 'Psalm 23:4',
    },
    10: {
      title: 'The Celestial City',
      summary:
        'After crossing the River of Death, Christian and Hopeful are welcomed into the Celestial City. Their long journey comes to an end as they enter the presence of the King and receive their eternal reward.',
      verse:
        'Well done, thou good and faithful servant: thou hast been faithful over a few things, I will make thee ruler over many things: enter thou into the joy of thy lord.',
      reference: 'Matthew 25:21',
    },
  };

  const renderChapterPageContent = (chapterNum: number) => {
    // Page 0 (first left page, where Chapter 1 used to be): Table of Contents
    if (chapterNum === 0) {
      const tocEntries: Array<{ pageNum: number; prefix?: string; label: string }> = [
        { pageNum: 1, prefix: 'Chapter 1:', label: chapterData[1].title },
        { pageNum: 2, prefix: 'Chapter 2:', label: chapterData[2].title },
        { pageNum: 3, prefix: 'Chapter 3:', label: chapterData[3].title },
        { pageNum: 4, prefix: 'Chapter 4:', label: chapterData[4].title },
        { pageNum: 5, prefix: 'Chapter 5:', label: chapterData[5].title },
        { pageNum: 6, prefix: 'Chapter 6:', label: chapterData[6].title },
        { pageNum: 7, prefix: 'Chapter 7:', label: chapterData[7].title },
        { pageNum: 8, prefix: 'Chapter 8:', label: chapterData[8].title },
        { pageNum: 9, prefix: 'Chapter 9:', label: chapterData[9].title },
        { pageNum: 10, prefix: 'Chapter 10:', label: chapterData[10].title },
        { pageNum: 12, label: 'How To Play' },
        { pageNum: 13, label: 'Settings' },
      ];
      return (
        <div
          className="w-full h-full flex flex-col items-center text-center text-[#0E0502] pb-3"
          style={{
            fontFamily: "'IM Fell English', serif",
            textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
          }}
        >
          <h2
            className="text-[29px] leading-tight tracking-wide text-[#0E0502]"
            style={{
              fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            }}
          >
            Table of Contents
          </h2>

          {/* Subtle 17th-century hand-inked divider */}
          <div className="my-1.5 flex items-center justify-center gap-2 w-48 opacity-80">
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
            <span className="w-1.5 h-1.5 rotate-45 bg-[#1A0803]" />
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
          </div>

          {/* All chapters + How To Play + Settings listed vertically down the page with an arrow after each */}
          <div className="mt-0.5 flex flex-col w-full flex-1 justify-between py-0.5 px-1">
            {tocEntries.map((entry) => (
              <button
                key={entry.pageNum}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleJumpToChapter(entry.pageNum);
                }}
                className="group w-full flex items-center justify-between gap-2 py-[1px] px-1.5 rounded text-left text-[#120602] hover:text-[#6B1A0E] hover:bg-[#3A1608]/[0.06] transition-all duration-150 cursor-pointer bg-transparent border-0 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English', serif",
                }}
              >
                <span className="text-[15px] leading-snug tracking-[0.01em] truncate">
                  {entry.prefix ? (
                    <>
                      <span
                        className="mr-1.5 text-[#0E0502] group-hover:text-[#6B1A0E]"
                        style={{
                          fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                        }}
                      >
                        {entry.prefix}
                      </span>
                      <span>{entry.label}</span>
                    </>
                  ) : (
                    <span
                      className="text-[#0E0502] group-hover:text-[#6B1A0E]"
                      style={{
                        fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                      }}
                    >
                      {entry.label}
                    </span>
                  )}
                </span>

                {/* Hand-inked arrow after each entry indicating click-to-navigate */}
                <span
                  aria-hidden="true"
                  className="inline-flex items-center shrink-0 text-[#120602] group-hover:text-[#6B1A0E] group-hover:translate-x-1 transition-transform duration-150"
                >
                  <svg
                    width="19"
                    height="11"
                    viewBox="0 0 20 12"
                    fill="none"
                    className="overflow-visible"
                  >
                    <path
                      d="M1 6H17.5M13 1.5L18 6L13 10.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Page 11 (immediately after Chapter 10): only says "THE END" in a large 17th-century font
    if (chapterNum === 11) {
      return (
        <div
          className="w-full h-full flex items-center justify-center text-center text-[#0E0502] pb-12"
          style={{
            fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
          }}
        >
          <h2 className="text-[64px] leading-none tracking-[0.08em]">
            THE END
          </h2>
        </div>
      );
    }

    // Page 12 (immediately after THE END): HOW TO PLAY page (Keyboard & Bluetooth Controller Controls)
    if (chapterNum === 12) {
      const isHighlighted = highlightedChapter === 12;
      const keyboardControls = [
        { key: 'Hold A / D', action: 'Run Left / Right & Swing Rope' },
        { key: 'Hold W / Shift (Rope)', action: 'Climb Up / Slide Down Rope' },
        { key: 'Space / Hold Space', action: 'Jump / Wall Jump / Mantle' },
        { key: 'Hold Shift (Ground)', action: 'Army Crawl Under Obstacles' },
        { key: 'Press Shift (At Door)', action: 'Enter / Exit Door' },
        { key: 'Press P', action: 'Pause Game' },
      ];
      const controllerControls = [
        { key: 'Left Stick Left / Right', action: 'Move Left / Right & Swing' },
        { key: 'Left Stick Up / Down', action: 'Climb Up / Lower On Rope' },
        { key: 'Press A', action: 'Jump / Wall Jump / Rope Jump' },
        { key: 'Hold A (At Ledge)', action: 'Mantle Ledge' },
        { key: 'Hold B (Ground)', action: 'Army Crawl Under Obstacles' },
        { key: 'Press X (At Door)', action: 'Enter / Exit Door' },
        { key: 'Press Y', action: 'Pause Game' },
      ];
      return (
        <div
          className={`w-full h-full flex flex-col items-center text-center text-[#0E0502] pb-3 transition-transform duration-300 ${
            isHighlighted ? 'scale-[1.02]' : 'scale-100'
          }`}
          style={{
            fontFamily: "'IM Fell English', serif",
            textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
          }}
        >
          <h2
            className="text-[27px] leading-tight tracking-wide text-[#0E0502]"
            style={{
              fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            }}
          >
            How To Play
          </h2>

          {/* Subtle 17th-century hand-inked divider */}
          <div className="my-1 flex items-center justify-center gap-2 w-48 opacity-80">
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
            <span className="w-1.5 h-1.5 rotate-45 bg-[#1A0803]" />
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
          </div>

          <div className="flex flex-col w-full flex-1 justify-between px-1 text-left">
            {/* Keyboard Controls Section */}
            <div className="w-full">
              <div
                className="text-[13.5px] font-bold tracking-[0.08em] uppercase text-[#0E0502] border-b-[1.5px] border-[#1A0803]/60 pb-0.5 mb-0.5 text-center"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                Keyboard Controls
              </div>
              <div className="flex flex-col">
                {keyboardControls.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 py-[1.5px] border-b border-[#2B1107]/20 last:border-b-0"
                  >
                    <span
                      className="text-[12.5px] text-[#0E0502] tracking-wide shrink-0"
                      style={{
                        fontFamily:
                          "'IM Fell English SC', 'IM Fell English', serif",
                      }}
                    >
                      {item.key}
                    </span>
                    <span className="text-[12.5px] text-[#160703] text-right">
                      {item.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bluetooth Controller Controls Section */}
            <div className="w-full mt-1">
              <div
                className="text-[13.5px] font-bold tracking-[0.08em] uppercase text-[#0E0502] border-b-[1.5px] border-[#1A0803]/60 pb-0.5 mb-0.5 text-center"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                Bluetooth Controller
              </div>
              <div className="flex flex-col">
                {controllerControls.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 py-[1.5px] border-b border-[#2B1107]/20 last:border-b-0"
                  >
                    <span
                      className="text-[12.5px] text-[#0E0502] tracking-wide shrink-0"
                      style={{
                        fontFamily:
                          "'IM Fell English SC', 'IM Fell English', serif",
                      }}
                    >
                      {item.key}
                    </span>
                    <span className="text-[12.5px] text-[#160703] text-right">
                      {item.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Page 13 (immediately after How To Play): SETTINGS page (only Full Screen option + Escape notice)
    if (chapterNum === 13) {
      const isHighlighted = highlightedChapter === 13;
      return (
        <div
          className={`w-full h-full flex flex-col items-center text-center text-[#0E0502] pb-7 transition-transform duration-300 ${
            isHighlighted ? 'scale-[1.02]' : 'scale-100'
          }`}
          style={{
            fontFamily: "'IM Fell English', serif",
            textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
          }}
        >
          <h2
            className="text-[32px] leading-tight tracking-wide text-[#0E0502]"
            style={{
              fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            }}
          >
            Settings
          </h2>

          {/* Subtle 17th-century hand-inked divider */}
          <div className="my-2.5 flex items-center justify-center gap-2 w-48 opacity-80">
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
            <span className="w-1.5 h-1.5 rotate-45 bg-[#1A0803]" />
            <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
          </div>

          <div className="my-auto flex flex-col items-center justify-center gap-5 w-full px-3">
            {/* Full Screen Option */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFullscreen();
              }}
              className="group flex flex-col items-center gap-1.5 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-2 focus:outline-none"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                textShadow: '0 1px 0 rgba(255, 248, 220, 0.65)',
              }}
            >
              <span className="w-52 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
              <div className="flex items-center justify-center gap-3 px-3 py-1">
                {/* Hand-inked checkbox */}
                <span className="w-5 h-5 border-2 border-[#120602] group-hover:border-[#6B1A0E] flex items-center justify-center text-[16px] leading-none">
                  {isFullscreen ? '✓' : ''}
                </span>
                <span className="text-[24px] leading-tight tracking-[0.06em]">
                  Full Screen: {isFullscreen ? 'On' : 'Off'}
                </span>
              </div>
              <span className="w-52 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
            </button>

            {/* Clear instruction that Escape exits Full Screen */}
            <p className="text-[17px] italic leading-relaxed text-[#1A0803] max-w-[290px]">
              Press{' '}
              <span
                className="not-italic font-semibold text-[#0E0502]"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                Escape (ESC)
              </span>{' '}
              at any time to exit Full Screen.
            </p>
          </div>
        </div>
      );
    }

    if (chapterNum > 13) {
      return null;
    }

    const content = chapterData[chapterNum];
    const isHighlighted = highlightedChapter === chapterNum;

    return (
      <div
        className={`w-full h-full flex flex-col items-center text-center text-[#0E0502] pb-7 transition-transform duration-300 ${
          isHighlighted ? 'scale-[1.02]' : 'scale-100'
        }`}
        style={{
          fontFamily: "'IM Fell English', serif",
          textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
        }}
      >
        <h2 className="text-[34px] leading-tight tracking-wide">
          Chapter {chapterNum}
        </h2>

        {content && (
          <div className="mt-2 flex flex-col items-center w-full flex-1 px-1">
            {/* Chapter Title */}
            <h3
              className="text-[23px] leading-snug tracking-wide text-[#120602]"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              {content.title}
            </h3>

            {/* Subtle 17th-century hand-inked divider */}
            <div className="my-2.5 flex items-center justify-center gap-2 w-44 opacity-75">
              <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
              <span className="w-1.5 h-1.5 rotate-45 bg-[#1A0803]" />
              <span className="h-[1.5px] flex-1 bg-[#1A0803]" />
            </div>

            {/* Summary */}
            <p className="mt-0.5 text-[17.5px] leading-[1.42] text-[#160703] max-w-[320px]">
              {content.summary}
            </p>

            {/* Subtle ink flourish */}
            <div className="my-3 w-24 h-[1px] bg-[#2B1107]/45" />

            {/* Bible Verse */}
            <blockquote className="mt-0.5 max-w-[315px]">
              <p className="text-[16.5px] italic leading-[1.42] text-[#1A0803]">
                &ldquo;{content.verse}&rdquo;
              </p>
              <footer
                className="mt-1.5 text-[16px] not-italic tracking-wide text-[#120602]"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                {content.reference}
              </footer>
            </blockquote>

            {/* "Begin Chapter" Interactive Text Button with Top & Bottom Ink Lines */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBeginChapter?.(chapterNum);
              }}
              className="group mt-auto flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-0 focus:outline-none"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                textShadow: '0 1px 0 rgba(255, 248, 220, 0.65)',
              }}
            >
              <span className="w-44 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
              <span className="text-[23px] leading-tight tracking-[0.07em] px-2">
                Begin Chapter
              </span>
              <span className="w-44 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Update the destination static page once the turning leaf passes the 90deg midpoint
  // so both the landing sheet and the static page underneath display the exact same chapter number.
  const displayedLeftSpread = !flipState
    ? currentSpread
    : flipState.direction === 'prev'
      ? flipState.toSpread
      : flipState.pastMidpoint
        ? flipState.toSpread
        : flipState.fromSpread;

  const displayedRightSpread = !flipState
    ? currentSpread
    : flipState.direction === 'next'
      ? flipState.toSpread
      : flipState.pastMidpoint
        ? flipState.toSpread
        : flipState.fromSpread;

  // Dynamic candlelight reflection coordinates for the gold lettering and leather spine
  const goldShimmerOffset = 36 + flickerX * 9 + (isHoveringBegin ? 8 : 0);
  const candleGlowStrength = intensity * (isHoveringBegin ? 1.35 : 1);

  return (
    <div
      className="relative flex items-center justify-center z-20 select-none"
      style={{
        perspective: '2400px',
      }}
    >
      {/* "Return To Start" Button above the open book */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 -top-[62px] z-40 transition-all duration-300 ${
          isOpen && !isAnimatingCover
            ? 'opacity-100 pointer-events-auto translate-y-0'
            : 'opacity-0 pointer-events-none translate-y-2'
        }`}
      >
        <button
          type="button"
          onClick={handleCloseBook}
          className="group relative px-6 py-1.5 rounded-sm border-[2.5px] border-[#140603] shadow-[0_6px_18px_rgba(0,0,0,0.75)] text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer focus:outline-none"
          style={{
            background:
              'linear-gradient(180deg, #F6E6B8 0%, #EAD39C 60%, #D6B87C 100%)',
            fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            textShadow: '0 1px 0 rgba(255, 248, 220, 0.65)',
          }}
        >
          <span className="pointer-events-none absolute inset-[3px] border border-[#1A0803]/65" />
          <span className="relative text-[20px] leading-tight tracking-[0.08em]">
            Return To Start
          </span>
        </button>
      </div>

      {/* Book Container shifts right when opened so the 2-page spread is centered on the table */}
      <div
        className="relative transition-transform duration-800 ease-[cubic-bezier(0.32,0.08,0.24,1)]"
        style={{
          width: '440px',
          height: '580px',
          transform: isOpen ? 'translateX(220px)' : 'translateX(0px)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* ================= CAST SHADOW ON THE WOODEN TABLE (Strictly bottom-right away from top-left light) ================= */}
        <div
          className="absolute pointer-events-none rounded-xl"
          style={{
            top: `${28 - flickerY * 2}px`,
            left: `${32 - flickerX * 2}px`,
            width: '432px',
            height: '574px',
            background: 'rgba(12, 4, 2, 0.78)',
            filter: 'blur(8px)',
            transform: 'translateZ(-12px)',
          }}
        />

        {/* ================= RIGHT HALF OF THE BOOK (BACK BOARD + RIGHT PAGE: CHAPTER 2, 4, 6, 8, 10) ================= */}
        <div
          className="absolute inset-0"
          style={{
            visibility: isOpen || isAnimatingCover ? 'visible' : 'hidden',
            pointerEvents: isOpen && !isAnimatingCover ? 'auto' : 'none',
            transform: 'translateZ(0px)',
          }}
        >
          <svg viewBox="0 0 440 580" className="w-full h-full block">
            <defs>
              {/* Symmetrical Leather Board Gradient (Right Side) */}
              <linearGradient id="board-leather-right" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2B0705" />
                <stop offset="8%" stopColor="#4A100D" />
                <stop offset="55%" stopColor="#6B1814" />
                <stop offset="100%" stopColor="#58120F" />
              </linearGradient>

              {/* Symmetrical Gold Tooling Trim Gradient (Right Side) */}
              <linearGradient id="gold-trim-right" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="50%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#92400E" />
              </linearGradient>

              {/* Symmetrical Aged Parchment Page Gradient (Right Side) */}
              <linearGradient id="page-parchment-right" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8C6B3E" />
                <stop offset="6%" stopColor="#C8A96E" />
                <stop offset="18%" stopColor="#EAD39C" />
                <stop offset="60%" stopColor="#F6E6B8" />
                <stop offset="94%" stopColor="#EEDBA6" />
                <stop offset="100%" stopColor="#D6B97E" />
              </linearGradient>
            </defs>

            {/* Right Leather Cover Board */}
            <path
              d="M0,0 L426,0 Q440,0 440,14 L440,566 Q440,580 426,580 L0,580 Z"
              fill="url(#board-leather-right)"
              stroke="#120502"
              strokeWidth="5"
            />

            {/* Symmetrical Gold-Tooled Inner Border on Right Leather Board */}
            <path
              d="M2,10 L424,10 Q430,10 430,16 L430,564 Q430,570 424,570 L2,570"
              fill="none"
              stroke="url(#gold-trim-right)"
              strokeWidth="2.2"
              opacity="0.75"
            />

            {/* Brass Corner Mounts (Top-Right & Bottom-Right) */}
            <g fill="#D97706" stroke="#120502" strokeWidth="3.2" strokeLinejoin="round">
              <polygon points="440,0 402,0 440,38" />
              <polygon points="440,580 402,580 440,542" />
            </g>

            {/* Stacked Parchment Page Block Thickness (Right Side) */}
            <path
              d="M0,28 L424,22 L426,558 L0,552 Z"
              fill="#C7A86C"
              stroke="#140603"
              strokeWidth="3.8"
              strokeLinejoin="round"
            />
            <path
              d="M419,26 L421,554 M414,28 L416,552"
              stroke="#5A3D1E"
              strokeWidth="1.6"
            />

            {/* Right Parchment Page Surface */}
            <path
              d="M0,30 Q205,16 412,24 L412,548 Q205,538 0,550 Z"
              fill="url(#page-parchment-right)"
              stroke="#140603"
              strokeWidth="3.8"
              strokeLinejoin="round"
            />

            {/* Subtle Symmetrical Parchment Striations */}
            <g stroke="#B89558" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
              <path d="M355,52 L394,54 M345,522 L392,519 M388,240 L402,240" />
            </g>

            {/* Bottom-right subtle dog-ear curl affordance when more chapters remain */}
            {displayedRightSpread < totalSpreads - 1 && (
              <g className="opacity-85">
                <path
                  d="M384,548 L412,520 L412,548 Z"
                  fill="#B8965A"
                  stroke="#140603"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M384,548 Q394,530 412,520 Q392,524 384,548 Z"
                  fill="#FFF6D6"
                  stroke="#140603"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </svg>

          {/* Right Page Interactive Click Zone & Chapter Heading (Chapter 2, 4, 6, 8, 10) */}
          <div
            onClick={handleNextSpread}
            data-controller-clickable={currentSpread < totalSpreads - 1 ? 'true' : undefined}
            title={
              currentSpread < totalSpreads - 1
                ? `Turn page to Chapter ${getLeftChapter(currentSpread + 1)}`
                : 'Chapter 10'
            }
            className={`absolute top-[24px] left-0 w-[412px] h-[524px] flex flex-col items-center pt-10 px-10 ${
              currentSpread < totalSpreads - 1 ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            {renderChapterPageContent(getRightChapter(displayedRightSpread))}
          </div>
        </div>

        {/* ================= 3D HINGED LEFT BOARD (FRONT = CLOSED COVER, BACK = LEFT PAGE: CHAPTER 1, 3, 5, 7, 9) ================= */}
        <div
          className="absolute inset-0 transition-transform duration-800 ease-[cubic-bezier(0.32,0.08,0.24,1)]"
          style={{
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
            transform: isOpen ? 'rotateY(-180deg)' : 'rotateY(0deg)',
            pointerEvents: isAnimatingCover ? 'none' : 'auto',
          }}
        >
          {/* ================= FACE 1 (0deg): FRONT COVER OF THE CLOSED BOOK ================= */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'translateZ(1px)',
              pointerEvents: isOpen ? 'none' : 'auto',
            }}
          >
            <svg viewBox="0 0 440 580" className="w-full h-full overflow-visible">
              <defs>
                {/* Rich Vibrant Cartoon Oxblood / Mahogany Leather Gradient */}
                <linearGradient id="cover-leather" x1="0%" y1="0%" x2="100%" y2="35%">
                  <stop offset="0%" stopColor="#A62D24" />
                  <stop offset="22%" stopColor="#7F1D18" />
                  <stop offset="62%" stopColor="#56110E" />
                  <stop offset="100%" stopColor="#2D0706" />
                </linearGradient>

                {/* Dynamic Top-Left Candlelight Warm Glow on the Leather Cover */}
                <radialGradient
                  id="cover-candle-glow"
                  cx={`${10 + flickerX * 4}%`}
                  cy={`${10 + flickerY * 4}%`}
                  r={`${78 * intensity}%`}
                >
                  <stop offset="0%" stopColor="#FDE047" stopOpacity={0.56 * intensity} />
                  <stop offset="35%" stopColor="#EA580C" stopOpacity={0.26 * intensity} />
                  <stop offset="75%" stopColor="#7C2D12" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#1E0504" stopOpacity="0" />
                </radialGradient>

                {/* Tarnished Brass Corner Gradient */}
                <linearGradient id="brass-corner" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FDE047" />
                  <stop offset="45%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#78350F" />
                </linearGradient>
              </defs>

              {/* Fore-edge Stacked Parchment Pages Peeking out on Right & Bottom when Closed */}
              <path
                d="M426,14 L442,22 L442,566 L26,582 L14,572 L426,568 Z"
                fill="#D6B87C"
                stroke="#120502"
                strokeWidth="4.5"
                strokeLinejoin="round"
              />
              <path
                d="M432,22 L432,564 M437,24 L437,564 M28,574 L436,571 M34,578 L438,575"
                stroke="#5C3D1E"
                strokeWidth="2"
              />

              {/* Main Heavy Leather Cover Board */}
              <rect
                x="0"
                y="0"
                width="428"
                height="570"
                rx="12"
                fill="url(#cover-leather)"
                stroke="#120502"
                strokeWidth="5.5"
              />

              {/* Dynamic Top-Left Candlelight Sheen Overlay across the Leather */}
              <rect
                x="3"
                y="3"
                width="422"
                height="564"
                rx="10"
                fill="url(#cover-candle-glow)"
              />

              {/* Left Bound Spine Ridge & Stitched Raised Cords */}
              <path d="M46,3 L46,567" stroke="#120502" strokeWidth="4.5" />
              <path
                d="M51,6 L51,564"
                stroke="#F59E0B"
                strokeWidth="2"
                opacity={0.48 * intensity}
              />

              {/* Bright Top-Left Candlelight Rim Highlight on Top & Left Spine Edges */}
              <path
                d="M6,530 L6,14 Q6,6 14,6 L360,6"
                fill="none"
                stroke="#FDE047"
                strokeWidth="4.5"
                strokeLinecap="round"
                opacity={0.85 * intensity}
              />
              <path
                d="M12,24 L12,460"
                stroke="#F59E0B"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={0.55 * intensity}
              />

              {/* 5 Raised Horizontal Spine Ribs on the Left */}
              {[95, 195, 285, 375, 475].map((ribY) => (
                <g key={ribY}>
                  <path
                    d={`M0,${ribY} Q23,${ribY - 6} 46,${ribY} L46,${ribY + 14} Q23,${ribY + 8} 0,${ribY + 14} Z`}
                    fill="#6B1612"
                    stroke="#120502"
                    strokeWidth="3.6"
                  />
                  <path
                    d={`M4,${ribY + 2} Q23,${ribY - 3} 42,${ribY + 2}`}
                    fill="none"
                    stroke="#FDE047"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    opacity={0.75 * intensity}
                  />
                </g>
              ))}

              {/* Ornate 17th-Century Blind-Tooled Recessed Inner Frame */}
              <rect
                x="70"
                y="28"
                width="332"
                height="514"
                rx="6"
                fill="none"
                stroke="#1A0503"
                strokeWidth="3.8"
              />
              <rect
                x="78"
                y="36"
                width="316"
                height="498"
                rx="4"
                fill="none"
                stroke="#1A0503"
                strokeWidth="2.2"
              />
              <path
                d="M72,30 L400,30 M72,30 L72,540"
                fill="none"
                stroke="#D97706"
                strokeWidth="1.6"
                opacity={0.42 * intensity}
              />

              {/* Subtle Cartoon Leather Grain Striations & Scuffs */}
              <g stroke="#240604" strokeWidth="2.2" strokeLinecap="round" opacity="0.7">
                <path d="M98,245 Q132,238 158,252 M112,256 Q135,250 148,258" />
                <path d="M310,310 Q345,302 372,318 M328,322 Q352,317 366,324" />
                <path d="M140,380 Q175,392 205,382" />
                <path d="M350,185 L378,205 M358,180 L382,198" />
              </g>

              {/* Tarnished Brass Corner Brackets (Top-Right & Bottom-Right) */}
              <g fill="url(#brass-corner)" stroke="#120502" strokeWidth="3.8" strokeLinejoin="round">
                <path d="M372,0 L428,0 L428,56 L410,56 L410,18 L372,18 Z" />
                <circle cx="418" cy="10" r="3" fill="#120502" />
                <circle cx="384" cy="9" r="2.5" fill="#120502" />
                <circle cx="419" cy="44" r="2.5" fill="#120502" />

                <path d="M372,570 L428,570 L428,514 L410,514 L410,552 L372,552 Z" />
                <circle cx="418" cy="560" r="3" fill="#120502" />
                <circle cx="384" cy="561" r="2.5" fill="#120502" />
                <circle cx="419" cy="526" r="2.5" fill="#120502" />
              </g>

              {/* ================= TOP MIDDLE TITLE IN BLACK INK (17th Century Font) ================= */}
              <g transform="translate(236, 98)">
                <path
                  d="M-95,-26 L95,-26 M-68,-32 L68,-32"
                  stroke="#0C0402"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="-29" r="4" fill="#0C0402" />
                <circle cx="-78" cy="-26" r="2.8" fill="#0C0402" />
                <circle cx="78" cy="-26" r="2.8" fill="#0C0402" />

                <text
                  x="0"
                  y="2"
                  textAnchor="middle"
                  fill="#0B0402"
                  style={{
                    fontFamily: "'IM Fell English', serif",
                    fontSize: '26px',
                    fontStyle: 'italic',
                    letterSpacing: '0.06em',
                  }}
                >
                  The
                </text>

                <text
                  x="0"
                  y="46"
                  textAnchor="middle"
                  fill="#090301"
                  stroke="#090301"
                  strokeWidth="0.6"
                  style={{
                    fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                    fontSize: '46px',
                    letterSpacing: '0.03em',
                  }}
                >
                  Pilgrim&rsquo;s
                </text>

                <text
                  x="0"
                  y="90"
                  textAnchor="middle"
                  fill="#090301"
                  stroke="#090301"
                  strokeWidth="0.6"
                  style={{
                    fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                    fontSize: '44px',
                    letterSpacing: '0.04em',
                  }}
                >
                  Progress
                </text>

                <path
                  d="M-105,112 L-18,112 M18,112 L105,112"
                  stroke="#0C0402"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                <path d="M0,104 L10,112 L0,120 L-10,112 Z" fill="#0C0402" />
                <path
                  d="M-65,119 L65,119"
                  stroke="#0C0402"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </g>

              {/* Subtle 17th-century blind-stamped central emblem in dark ink */}
              <g transform="translate(236, 295)" opacity="0.52" stroke="#160402" fill="none">
                <circle cx="0" cy="0" r="36" strokeWidth="3" />
                <circle cx="0" cy="0" r="28" strokeWidth="1.8" strokeDasharray="4 4" />
                <path
                  d="M0,-24 L6,-6 L24,0 L6,6 L0,24 L-6,6 L-24,0 L-6,-6 Z"
                  strokeWidth="2.4"
                  fill="#2A0705"
                />
              </g>
            </svg>

            {/* ================= LOWER PART OF THE BOOK: "Begin Journey" TEXT ONLY (NO BUTTON) ================= */}
            <div className="absolute left-[46px] right-0 bottom-[74px] flex justify-center items-center pointer-events-none">
              <span
                role="button"
                tabIndex={0}
                onClick={handleOpenBook}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenBook();
                  }
                }}
                onMouseEnter={() => setIsHoveringBegin(true)}
                onMouseLeave={() => setIsHoveringBegin(false)}
                className="pointer-events-auto cursor-pointer relative inline-block tracking-[0.08em] transition-transform duration-200 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English', serif",
                  fontSize: '34px',
                  transform: isHoveringBegin ? 'scale(1.03)' : 'scale(1)',
                  backgroundImage: `
                    radial-gradient(
                      circle at ${goldShimmerOffset}% ${35 + flickerY * 10}%,
                      #FFFBEB 0%,
                      #FDE047 22%,
                      #D97706 52%,
                      #78350F 74%,
                      #F59E0B 88%,
                      #92400E 100%
                    )
                  `,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  filter: `
                    drop-shadow(0px 2px 1px rgba(15, 4, 2, 0.92))
                    drop-shadow(${-2 + flickerX}px ${-2 + flickerY}px ${8 * candleGlowStrength}px rgba(251, 191, 36, ${0.52 * candleGlowStrength}))
                    drop-shadow(0px 0px ${18 * candleGlowStrength}px rgba(245, 158, 11, ${0.32 * candleGlowStrength}))
                  `,
                }}
              >
                Begin Journey
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-45"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 18% 65%, #3B0A07 1.5px, transparent 2.5px), radial-gradient(circle at 46% 28%, #3B0A07 1.2px, transparent 2.2px), radial-gradient(circle at 73% 72%, #3B0A07 1.6px, transparent 2.6px), radial-gradient(circle at 86% 35%, #3B0A07 1.3px, transparent 2.2px), radial-gradient(circle at 31% 48%, #3B0A07 1px, transparent 2px)',
                  }}
                />
              </span>
            </div>
          </div>

          {/* ================= FACE 2 (-180deg): INSIDE LEFT HALF OF THE BOOK (CHAPTER 1, 3, 5, 7, 9) ================= */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg) translateZ(1px)',
              pointerEvents: isOpen && !isAnimatingCover ? 'auto' : 'none',
            }}
          >
            {/* Bottom-right shadow under the opened left board (tucked 36px inside left edge so it never spreads toward top-left light) */}
            <div
              className="absolute pointer-events-none rounded-xl"
              style={{
                top: `${26 - flickerY * 2}px`,
                left: '36px',
                right: '0px',
                height: '572px',
                background: 'rgba(12, 4, 2, 0.72)',
                filter: 'blur(8px)',
                zIndex: -1,
              }}
            />
            <svg viewBox="0 0 440 580" className="w-full h-full block">
              <defs>
                {/* Symmetrical Leather Board Gradient (Left Side, mirror of Right Side) */}
                <linearGradient id="board-leather-left" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#58120F" />
                  <stop offset="45%" stopColor="#6B1814" />
                  <stop offset="92%" stopColor="#4A100D" />
                  <stop offset="100%" stopColor="#2B0705" />
                </linearGradient>

                {/* Symmetrical Gold Tooling Trim Gradient (Left Side) */}
                <linearGradient id="gold-trim-left" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#F59E0B" />
                  <stop offset="50%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#92400E" />
                </linearGradient>

                {/* Symmetrical Aged Parchment Page Gradient (Left Side: mirror of Right Side) */}
                <linearGradient id="page-parchment-left" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#D6B97E" />
                  <stop offset="6%" stopColor="#EEDBA6" />
                  <stop offset="40%" stopColor="#F6E6B8" />
                  <stop offset="82%" stopColor="#EAD39C" />
                  <stop offset="94%" stopColor="#C8A96E" />
                  <stop offset="100%" stopColor="#8C6B3E" />
                </linearGradient>
              </defs>

              {/* Left Leather Cover Board (Exact mirror of Right Board) */}
              <path
                d="M440,0 L14,0 Q0,0 0,14 L0,566 Q0,580 14,580 L440,580 Z"
                fill="url(#board-leather-left)"
                stroke="#120502"
                strokeWidth="5"
              />

              {/* Symmetrical Gold-Tooled Inner Border on Left Leather Board */}
              <path
                d="M438,10 L16,10 Q10,10 10,16 L10,564 Q10,570 16,570 L438,570"
                fill="none"
                stroke="url(#gold-trim-left)"
                strokeWidth="2.2"
                opacity="0.75"
              />

              {/* Brass Corner Mounts (Top-Left & Bottom-Left) */}
              <g fill="#D97706" stroke="#120502" strokeWidth="3.2" strokeLinejoin="round">
                <polygon points="0,0 38,0 0,38" />
                <polygon points="0,580 38,580 0,542" />
              </g>

              {/* Stacked Parchment Page Block Thickness (Left Side) */}
              <path
                d="M440,28 L16,22 L14,558 L440,552 Z"
                fill="#C7A86C"
                stroke="#140603"
                strokeWidth="3.8"
                strokeLinejoin="round"
              />
              <path
                d="M21,26 L19,554 M26,28 L24,552"
                stroke="#5A3D1E"
                strokeWidth="1.6"
              />

              {/* Left Parchment Page Surface (Exact mirror of Right Page) */}
              <path
                d="M440,30 Q235,16 28,24 L28,548 Q235,538 440,550 Z"
                fill="url(#page-parchment-left)"
                stroke="#140603"
                strokeWidth="3.8"
                strokeLinejoin="round"
              />

              {/* Center Spine Binding Line */}
              <line
                x1="440"
                y1="28"
                x2="440"
                y2="552"
                stroke="#140603"
                strokeWidth="4.2"
              />

              {/* Subtle Symmetrical Parchment Striations */}
              <g stroke="#B89558" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
                <path d="M46,54 L85,52 M48,519 L95,522 M38,240 L52,240" />
              </g>

              {/* Bottom-left subtle dog-ear curl affordance */}
              <g className="opacity-85">
                <path
                  d="M56,548 L28,520 L28,548 Z"
                  fill="#B8965A"
                  stroke="#140603"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M56,548 Q46,530 28,520 Q48,524 56,548 Z"
                  fill="#FFF6D6"
                  stroke="#140603"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
              </g>
            </svg>

            {/* Left Page Interactive Click Zone & Chapter Heading (Chapter 1, 3, 5, 7, 9) */}
            <div
              onClick={handlePrevSpread}
              data-controller-clickable="true"
              title={
                currentSpread === 0
                  ? 'Click left page to close book'
                  : `Turn back to Chapter ${getLeftChapter(currentSpread - 1)}`
              }
              className="absolute top-[24px] left-[28px] w-[412px] h-[524px] cursor-pointer flex flex-col items-center pt-10 px-10"
            >
              {renderChapterPageContent(getLeftChapter(displayedLeftSpread))}
            </div>
          </div>
        </div>

        {/* ================= 3D ANIMATED TURNING PAGE LEAF (Between Chapters 1..10 & THE END) ================= */}
        {flipState && (
          <div
            onAnimationEnd={handlePageFlipAnimationEnd}
            className="absolute inset-0 pointer-events-none"
            style={{
              transformOrigin: 'left center',
              transformStyle: 'preserve-3d',
              transform: 'translateZ(4px)',
              animation:
                flipState.direction === 'next'
                  ? 'pageTurnNext 600ms cubic-bezier(0.4, 0.0, 0.2, 1) forwards'
                  : 'pageTurnPrev 600ms cubic-bezier(0.4, 0.0, 0.2, 1) forwards',
            }}
          >
            {/* Front Face of Turning Sheet (Exact match of Right Page SVG + dog-ear corner) */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'translateZ(1px)',
              }}
            >
              <svg viewBox="0 0 440 580" className="w-full h-full block">
                <path
                  d="M0,30 Q205,16 412,24 L412,548 Q205,538 0,550 Z"
                  fill="url(#page-parchment-right)"
                  stroke="#140603"
                  strokeWidth="3.8"
                  strokeLinejoin="round"
                />
                <g stroke="#B89558" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
                  <path d="M355,52 L394,54 M345,522 L392,519 M388,240 L402,240" />
                </g>
                {(flipState.direction === 'next'
                  ? flipState.fromSpread
                  : flipState.toSpread) <
                  totalSpreads - 1 && (
                  <g className="opacity-85">
                    <path
                      d="M384,548 L412,520 L412,548 Z"
                      fill="#B8965A"
                      stroke="#140603"
                      strokeWidth="2.8"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M384,548 Q394,530 412,520 Q392,524 384,548 Z"
                      fill="#FFF6D6"
                      stroke="#140603"
                      strokeWidth="2.8"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </svg>
              <div className="absolute top-[24px] left-0 w-[412px] h-[524px] flex flex-col items-center pt-10 px-10">
                {renderChapterPageContent(
                  getRightChapter(
                    flipState.direction === 'next'
                      ? flipState.fromSpread
                      : flipState.toSpread
                  )
                )}
              </div>
            </div>

            {/* Back Face of Turning Sheet (Exact match of Left Page SVG + dog-ear corner) */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg) translateZ(1px)',
              }}
            >
              <svg viewBox="0 0 440 580" className="w-full h-full block">
                <path
                  d="M440,30 Q235,16 28,24 L28,548 Q235,538 440,550 Z"
                  fill="url(#page-parchment-left)"
                  stroke="#140603"
                  strokeWidth="3.8"
                  strokeLinejoin="round"
                />
                <line
                  x1="440"
                  y1="28"
                  x2="440"
                  y2="552"
                  stroke="#140603"
                  strokeWidth="4.2"
                />
                <g stroke="#B89558" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
                  <path d="M46,54 L85,52 M48,519 L95,522 M38,240 L52,240" />
                </g>
                <g className="opacity-85">
                  <path
                    d="M56,548 L28,520 L28,548 Z"
                    fill="#B8965A"
                    stroke="#140603"
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M56,548 Q46,530 28,520 Q48,524 56,548 Z"
                    fill="#FFF6D6"
                    stroke="#140603"
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                  />
                </g>
              </svg>
              <div className="absolute top-[24px] left-[28px] w-[412px] h-[524px] flex flex-col items-center pt-10 px-10">
                {renderChapterPageContent(
                  getLeftChapter(
                    flipState.direction === 'next'
                      ? flipState.toSpread
                      : flipState.fromSpread
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
