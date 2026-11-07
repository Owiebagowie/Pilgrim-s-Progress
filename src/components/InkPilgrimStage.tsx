import React, { useEffect, useRef, useState } from 'react';
import { soundFX } from '../utils/sound';

interface InkPilgrimStageProps {
  active: boolean;
  chapter?: number | null;
  paused?: boolean;
  introPhase?: string;
  onDialogueModeChange?: (inDialogue: boolean) => void;
  onOverlayMenuChange?: (inOverlayMenu: boolean) => void;
  onReturnToMenu?: () => void;
  onNextChapter?: (nextChapter: number) => void;
}

export interface DialogueLine {
  speaker: 'Evangelist' | 'Christian' | 'Pliable' | 'Obstinate';
  text: string;
}

const CHAPTER_1_OPENING_DIALOGUE: DialogueLine[] = [
  {
    speaker: 'Evangelist',
    text: '"Wherefore dost thou cry?"',
  },
  {
    speaker: 'Christian',
    text: '"I am condemned to die, and after that to come to judgment.”',
  },
  {
    speaker: 'Evangelist',
    text: '"Flee from the wrath to come."',
  },
  {
    speaker: 'Christian',
    text: '"Whither must I fly?"',
  },
  {
    speaker: 'Evangelist',
    text: '"Do you see the brightly shining wicket-gate yonder? So shalt thou see the gate; at which, when thou knowest, it shall be told thee what thou shalt do."',
  },
];

const CHAPTER_1_ENDING_DIALOGUE: DialogueLine[] = [
  {
    speaker: 'Obstinate',
    text: 'Christian, why art thou leaving thy home?',
  },
  {
    speaker: 'Christian',
    text: 'I flee the City of Destruction.',
  },
  {
    speaker: 'Pliable',
    text: 'And where dost thou go?',
  },
  {
    speaker: 'Christian',
    text: 'To the Celestial City.',
  },
  {
    speaker: 'Pliable',
    text: 'Is it truly glorious?',
  },
  {
    speaker: 'Christian',
    text: 'More glorious than words can tell.',
  },
  {
    speaker: 'Obstinate',
    text: 'Empty dreams!',
  },
  {
    speaker: 'Christian',
    text: 'Nay. I must go.',
  },
  {
    speaker: 'Pliable',
    text: 'Then I shall go with thee.',
  },
];

type DialogueScenePhase =
  | 'WAITING_FOR_FADE'
  | 'EVANGELIST_WALK_IN'
  | 'DIALOGUE_ACTIVE'
  | 'EVANGELIST_WALK_OUT'
  | 'ZOOMING_OUT'
  | 'COMPLETE';

type EndingScenePhase =
  | 'INACTIVE'
  | 'RUN_PAST_OBSTACLE'
  | 'ZOOM_AND_WALK'
  | 'DIALOGUE_ACTIVE'
  | 'WALK_OFF'
  | 'COMPLETE';

interface DustPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface LegIKTarget {
  ankleX: number; // relative to character ground origin (x=0 is hip center X)
  ankleY: number; // relative to ground (y=0 is ground surface, negative is up)
  footPitch: number; // rad: + pitches toe UP (heel strike), - pitches toe DOWN (push-off / airborne)
  toeBend: number; // rad: + bends toe box relative to boot sole (metatarsal roll)
}

interface LimbJoints {
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  ankleX: number;
  ankleY: number;
  thighAngle: number;
  shinAngle: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Analytical 2-Bone Inverse Kinematics solver for a human leg.
 * In character local coordinates:
 * +X is forward (direction of face), +Y is downward toward ground (Y = 0).
 * Knee always bends forward (+X direction relative to the hip-ankle line).
 */
function solveLegIK(
  hipX: number,
  hipY: number,
  targetAnkleX: number,
  targetAnkleY: number,
  thighLen: number,
  shinLen: number
): LimbJoints {
  const dx = targetAnkleX - hipX;
  const dy = targetAnkleY - hipY;
  const rawDist = Math.hypot(dx, dy);

  // Allow near-full anatomical leg extension with a smooth C-infinity soft-knee roll-off
  // so the knee never snaps or stutters when approaching full extension
  const maxReach = (thighLen + shinLen) * 0.995;
  const minReach = Math.abs(thighLen - shinLen) + 6;
  const kneeSoftStart = maxReach - 7;
  let dist = rawDist;
  if (dist > kneeSoftStart) {
    const excess = dist - kneeSoftStart;
    dist = kneeSoftStart + 7 * (1 - Math.exp(-excess / 7));
  }
  dist = clamp(dist, minReach, maxReach);

  // Angle of hip->ankle vector measured from +Y (downward vertical), where + is forward (+X)
  const baseAngle = Math.atan2(dx, dy);

  // Law of cosines for internal hip angle offset
  const cosAlpha = clamp(
    (thighLen * thighLen + dist * dist - shinLen * shinLen) /
      (2 * thighLen * dist),
    -1,
    1
  );
  const alpha = Math.acos(cosAlpha);

  // Human knee bends forward (+alpha)
  const thighAngle = baseAngle + alpha;

  const kneeX = hipX + Math.sin(thighAngle) * thighLen;
  const kneeY = hipY + Math.cos(thighAngle) * thighLen;

  // Adjusted ankle if clamped
  const scale = rawDist > 0.0001 ? dist / rawDist : 1;
  const ankleX = hipX + dx * scale;
  const ankleY = hipY + dy * scale;

  const shinAngle = Math.atan2(ankleX - kneeX, ankleY - kneeY);

  return {
    hipX,
    hipY,
    kneeX,
    kneeY,
    ankleX,
    ankleY,
    thighAngle,
    shinAngle,
  };
}

/**
 * Computes natural, ground-locked biomechanical foot trajectory & foot-roll angles
 * for WALKING at normalized phase p in [0, 1).
 *
 * Key biomechanical features:
 * - Wide, long-reaching stride almost 2x bigger (frontReach = +48px, backReach = -82px, 130px stance span)
 *   centered under/behind the tall upright torso.
 * - 100% C1/C2 boundary-matched transitions between Stance and Swing (zero position or velocity snaps).
 * - Single unbroken Cubic Hermite swing trajectory: upon Toe-Off, the lower leg (calf & foot)
 *   naturally continues folding backward behind the advancing knee first, then sweeps smoothly
 *   forward in one slow, continuous pendulum arc into Heel-Strike with zero mid-air pauses.
 */
function computeWalkFootTarget(p: number): LegIKTarget {
  const phase = ((p % 1) + 1) % 1;
  const frontReach = 48; // Long, sweeping forward step planting cleanly on the heel
  const backReach = -82; // Deep posterior extension behind the body (130px total stride span)
  const ankleBaseH = -11.5; // Ankle height when boot is flat on ground (y=0)
  const heelOffset = -11.5;
  const ballOffset = 12.5;

  const strikePitch = 0.28; // Natural heel-strike dorsiflexion
  const pushOffPitch = -0.64; // Terminal stance heel-off plantarflexion

  // Exact ankle coordinates at Heel-Strike (u = 0) and Toe-Off (u = 1) for seamless C1 continuity
  const startHeelX = frontReach + heelOffset;
  const startAnkleX =
    startHeelX -
    heelOffset * Math.cos(strikePitch) +
    ankleBaseH * Math.sin(strikePitch);
  const startAnkleY =
    heelOffset * Math.sin(strikePitch) +
    ankleBaseH * Math.cos(strikePitch);

  const endBallX = backReach + ballOffset;
  const endAnkleX =
    endBallX -
    ballOffset * Math.cos(pushOffPitch) +
    ankleBaseH * Math.sin(pushOffPitch);
  const endAnkleY =
    ballOffset * Math.sin(pushOffPitch) +
    ankleBaseH * Math.cos(pushOffPitch);

  const stanceEnd = 0.52;

  if (phase < stanceEnd) {
    // STANCE PHASE (u in 0..1)
    const u = phase / stanceEnd;
    // Constant-speed horizontal progression of foot contact point from +48px to -82px
    const groundContactX = lerp(frontReach, backReach, u);

    if (u < 0.18) {
      // 1. Heel-Strike Roll: Heel plants cleanly, rolling flat onto sole
      const r = smoothstep(0, 0.18, u);
      const pitch = strikePitch * (1 - r);
      const heelX = groundContactX + heelOffset;
      const ankleX =
        heelX - heelOffset * Math.cos(pitch) + ankleBaseH * Math.sin(pitch);
      const ankleY =
        heelOffset * Math.sin(pitch) + ankleBaseH * Math.cos(pitch);
      return {
        ankleX,
        ankleY,
        footPitch: pitch,
        toeBend: 0,
      };
    } else if (u < 0.56) {
      // 2. Flat-Foot Mid-Stance: Tall upright pass over planted boot
      return {
        ankleX: groundContactX,
        ankleY: ankleBaseH,
        footPitch: 0,
        toeBend: 0,
      };
    } else {
      // 3. Terminal Stance Heel-Off: Continuous power curve (zero kink at u=0.56, active velocity at u=1.0)
      const r = Math.pow((u - 0.56) / 0.44, 1.65);
      const heelLift = pushOffPitch * r;
      const ballX = groundContactX + ballOffset;
      const ankleX =
        ballX - ballOffset * Math.cos(heelLift) + ankleBaseH * Math.sin(heelLift);
      const ankleY =
        ballOffset * Math.sin(heelLift) + ankleBaseH * Math.cos(heelLift);
      return {
        ankleX,
        ankleY,
        footPitch: heelLift,
        toeBend: -heelLift * 0.92,
      };
    }
  } else {
    // SWING PHASE (v in 0..1) — Single C2-continuous Cubic Hermite spline (zero mid-air stops!)
    const v = (phase - stanceEnd) / (1 - stanceEnd);
    const v2 = v * v;
    const v3 = v2 * v;
    const h00 = 2 * v3 - 3 * v2 + 1;
    const h10 = v3 - 2 * v2 + v;
    const h01 = -2 * v3 + 3 * v2;
    const h11 = v3 - v2;

    // Horizontal trajectory:
    // Starts at endAnkleX with rearward tangent M0 = -95 so the calf & foot naturally fold backward
    // behind the advancing knee during early swing, then sweeps forward in one long, slow
    // pendulum arc to startAnkleX with terminal retraction tangent M1 = -42
    const M0 = -95;
    const M1 = -42;
    const ankleX = h00 * endAnkleX + h10 * M0 + h01 * startAnkleX + h11 * M1;

    // Vertical trajectory:
    // Single smooth asymmetric bell curve connecting endAnkleY to startAnkleY, peaking in early-mid
    // swing (v ~ 0.36) as the calf and heel tuck up behind the flexed knee
    const baseLineY = lerp(endAnkleY, startAnkleY, v);
    const liftCurve =
      Math.sin(Math.PI * Math.pow(v, 0.74)) *
      Math.pow(Math.sin(Math.PI * v), 0.65);
    const ankleY = baseLineY - liftCurve * 38;

    // Foot pitch & toe bend:
    // Single Cubic Hermite curve from pushOffPitch (-0.64) dipping slightly more negative (-0.76)
    // as the calf folds back, then rotating smoothly upward to strikePitch (+0.28) at Heel-Strike
    const footPitch =
      h00 * pushOffPitch + h10 * -0.9 + h01 * strikePitch + h11 * 0.35;
    const toeBend = -pushOffPitch * 0.92 * Math.pow(1 - v, 2.2);

    return {
      ankleX,
      ankleY,
      footPitch,
      toeBend,
    };
  }
}

/**
 * Computes wide, powerful biomechanical foot trajectory for RUNNING at normalized phase p in [0, 1).
 *
 * Full athletic stride (strideHalf = 78px, 156px span):
 * - Full rear leg extension at push-off
 * - High hamstring recovery fold (62px ankle lift)
 * - High forward knee drive and active paw-back into foot strike
 */
function computeRunFootTarget(p: number): LegIKTarget {
  const phase = ((p % 1) + 1) % 1;
  const strideHalf = 78; // Big, energetic 156px running stride
  const ankleBaseH = -11.5;
  const heelOffset = -11.5;
  const ballOffset = 12.5;

  const stanceEnd = 0.35;

  if (phase < stanceEnd) {
    const u = phase / stanceEnd;
    const groundContactX = lerp(strideHalf * 0.84, -strideHalf * 0.96, u);

    if (u < 0.16) {
      // Rapid athletic strike
      const r = smoothstep(0, 0.16, u);
      const pitch = lerp(0.32, 0.0, r);
      const heelX = groundContactX + heelOffset;
      const ankleX =
        heelX - heelOffset * Math.cos(pitch) + ankleBaseH * Math.sin(pitch);
      const ankleY =
        0 + heelOffset * Math.sin(pitch) + ankleBaseH * Math.cos(pitch);
      return {
        ankleX,
        ankleY,
        footPitch: pitch,
        toeBend: 0,
      };
    } else if (u < 0.46) {
      // Mid-stance support
      return {
        ankleX: groundContactX,
        ankleY: ankleBaseH,
        footPitch: 0,
        toeBend: 0.05,
      };
    } else {
      // Explosive rear leg extension & forefoot push-off
      const r = smoothstep(0.46, 1.0, u);
      const heelLift = lerp(0.0, -0.86, r);
      const ballX = groundContactX + ballOffset;
      const ankleX =
        ballX - ballOffset * Math.cos(heelLift) + ankleBaseH * Math.sin(heelLift);
      const ankleY =
        0 + ballOffset * Math.sin(heelLift) + ankleBaseH * Math.cos(heelLift);
      return {
        ankleX,
        ankleY,
        footPitch: heelLift,
        toeBend: -heelLift * 0.85,
      };
    }
  } else {
    // RUN SWING & FLIGHT PHASE (v in 0..1)
    const v = (phase - stanceEnd) / (1 - stanceEnd);

    let ankleX: number;
    if (v < 0.22) {
      // Rear kick extension behind the hip
      const t = smoothstep(0, 0.22, v);
      ankleX = lerp(-strideHalf * 0.96 - 8, -strideHalf * 1.08, t);
    } else if (v < 0.82) {
      // High-knee forward drive sweeping to front extension
      const t = smoothstep(0.22, 0.82, v);
      ankleX = lerp(-strideHalf * 1.08, strideHalf * 1.0, t);
    } else {
      // Active paw-back right before foot strike
      const t = smoothstep(0.82, 1.0, v);
      ankleX = lerp(strideHalf * 1.0, strideHalf * 0.84, t);
    }

    // High heel fold toward glutes (62px lift) followed by high knee reach
    let ankleY: number;
    if (v < 0.36) {
      const t = smoothstep(0, 0.36, v);
      ankleY = lerp(ankleBaseH - 7, ankleBaseH - 62, t);
    } else if (v < 0.74) {
      const t = smoothstep(0.36, 0.74, v);
      ankleY = lerp(ankleBaseH - 62, ankleBaseH - 34, t);
    } else {
      const t = smoothstep(0.74, 1.0, v);
      ankleY = lerp(ankleBaseH - 34, ankleBaseH - 2, t);
    }

    let footPitch: number;
    let toeBend: number;
    if (v < 0.35) {
      const t = smoothstep(0, 0.35, v);
      footPitch = lerp(-0.86, -1.28, t);
      toeBend = lerp(0.7, 0.25, t);
    } else if (v < 0.76) {
      const t = smoothstep(0.35, 0.76, v);
      footPitch = lerp(-1.28, -0.1, t);
      toeBend = lerp(0.25, 0.0, t);
    } else {
      const t = smoothstep(0.76, 1.0, v);
      footPitch = lerp(-0.1, 0.32, t);
      toeBend = 0.0;
    }

    return {
      ankleX,
      ankleY,
      footPitch,
      toeBend,
    };
  }
}

export const InkPilgrimStage: React.FC<InkPilgrimStageProps> = ({
  active,
  chapter = 1,
  paused = false,
  introPhase = 'COMPLETE',
  onDialogueModeChange,
  onOverlayMenuChange,
  onReturnToMenu,
  onNextChapter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chapterRef = useRef<number | null | undefined>(chapter);
  chapterRef.current = chapter;
  const pausedRef = useRef<boolean>(paused);
  pausedRef.current = paused;
  const introPhaseRef = useRef<string>(introPhase);
  introPhaseRef.current = introPhase;
  const onDialogueModeChangeRef = useRef(onDialogueModeChange);
  onDialogueModeChangeRef.current = onDialogueModeChange;

  const [dialogueUI, setDialogueUI] = useState<{
    visible: boolean;
    speaker: DialogueLine['speaker'];
    visibleText: string;
    fadingOut: boolean;
  }>({
    visible: false,
    speaker: 'Evangelist',
    visibleText: '',
    fadingOut: false,
  });

  const [levelComplete, setLevelComplete] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [levelResetKey, setLevelResetKey] = useState(0);
  const [collectedKeysCount, setCollectedKeysCount] = useState(0);
  const [lockedGateWarning, setLockedGateWarning] = useState(false);
  const skipDialogueOnRestartRef = useRef(false);
  const warpToMissingKeyRef = useRef<(() => void) | null>(null);

  const skipDialogueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onOverlayMenuChange?.(Boolean(active && (isDead || levelComplete)));
  }, [active, isDead, levelComplete, onOverlayMenuChange]);

  useEffect(() => {
    if (!active) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLevelComplete(false);
    setIsDead(false);
    setCollectedKeysCount(0);
    setLockedGateWarning(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1920;
    const H = 1080;
    const GROUND_Y = 855;
    // Uniform scale factor to make the character slightly smaller by an even 1:1 ratio
    const CHAR_SCALE = 0.82;
    const isChapterOne = (chapterRef.current ?? 1) === 1;
    let LEVEL_WIDTH = isChapterOne ? 54000 : W;

    // Exact visual character heights (including spiky hair tufts) so Christian's head NEVER morphs through blocks:
    // Standing top of hair is ~207.5px above state.y -> STANDING_H = 210
    // Belly Army Crawl top of burden/head is ~74px above state.y -> CRAWL_H = 82
    // Walk-under obstacles have bottomY <= surfaceY - 226 (226px clearance > 210px standing height)
    // Belly-crawl obstacles have bottomY = surfaceY - 106 (106px clearance: blocks standing, leaves 24px gap above army-crawling back & head!)
    const CHAR_RADIUS_X = 22;
    const STANDING_H = 210;
    const CRAWL_H = 82;

    interface LevelBlock {
      x1: number;
      x2: number;
      topY: number;
      bottomY: number;
      canWallJumpLeft?: boolean;
      canWallJumpRight?: boolean;
      canMountLeft?: boolean;
      canMountRight?: boolean;
      ignoreRopeCollision?: boolean;
    }

    interface CollapsingPlatform {
      x1: number;
      x2: number;
      baseY: number;
      currentY: number;
      vy: number;
      state: 'IDLE' | 'STEPPED' | 'FALLING';
      timer: number;
      respawnTimer: number;
      shakeOffsetX: number;
      shakeAngle: number;
      splashed: boolean;
    }

    const createCollapsingPlatform = (
      x1: number,
      x2: number,
      baseY: number
    ): CollapsingPlatform => ({
      x1,
      x2,
      baseY,
      currentY: baseY,
      vy: 0,
      state: 'IDLE',
      timer: 0,
      respawnTimer: 0,
      shakeOffsetX: 0,
      shakeAngle: 0,
      splashed: false,
    });

    interface MovingPlatform {
      minX: number;
      maxX: number;
      y: number;
      width: number;
      speed: number;
      dir: 1 | -1;
      x: number;
      prevX: number;
      deltaX: number;
      pauseTimer: number;
      wheelAngle: number;
    }

    const createMovingPlatform = (
      minX: number,
      maxX: number,
      y: number,
      width: number,
      speed: number,
      startX: number,
      dir: 1 | -1
    ): MovingPlatform => ({
      minX,
      maxX,
      y,
      width,
      speed,
      dir,
      x: startX,
      prevX: startX,
      deltaX: 0,
      pauseTimer: 0,
      wheelAngle: 0,
    });

    interface SwingingRope {
      pivotX: number;
      pivotY: number;
      length: number;
      baseAmp: number;
      freq: number;
      phase: number;
      angle: number;
      angularVel: number;
    }

    // 3 Black Silhouette Keys — 1 key inside each of the 3 Door Dimensions!
    // All 3 keys are required to unlock the single Final City Exit Gate at x = 48550 on the Main Course and enter the ending dialogue.
    interface SilhouetteKey {
      id: 1 | 2 | 3;
      dimension: 1 | 2 | 3;
      label: string;
      x: number;
      y: number;
      collected: boolean;
      collectAnim: number;
    }

    const chapterKeys: SilhouetteKey[] = isChapterOne
      ? [
          {
            id: 1,
            dimension: 1,
            label: 'First Key (Door Dimension I)',
            x: 7330,
            y: 485,
            collected: false,
            collectAnim: 0,
          },
          {
            id: 2,
            dimension: 2,
            label: 'Second Key (Door Dimension II)',
            x: 8050,
            y: 465,
            collected: false,
            collectAnim: 0,
          },
          {
            id: 3,
            dimension: 3,
            label: 'Third Key (Door Dimension III)',
            x: 7980,
            y: 465,
            collected: false,
            collectAnim: 0,
          },
        ]
      : [];

    // Simple Character-Height Doors (height = STANDING_H = 210px, matching Christian's exact height!):
    // - 3 Doors on separate elevated rope-climb dead-end platforms off the Main Course (dimension 0) that open Door Dimensions 1, 2, and 3.
    // - Both the Start Door (at x = 240, before getting the key) and the End Return Door (after getting the key) in each Door Dimension
    //   can be entered by pressing Shift to return Christian to the exact door he entered on the Main Course!
    interface CourseDoor {
      id: string;
      dimension: 0 | 1 | 2 | 3;
      x: number;
      y: number;
      targetDimension: 0 | 1 | 2 | 3;
      targetDoorId: string;
      spawnX: number;
      spawnY: number;
      keyId: 1 | 2 | 3;
    }

    const courseDoors: CourseDoor[] = isChapterOne
      ? [
          // --- MAIN COURSE DOORS (Dimension 0 -> Door Dimensions 1, 2, 3) ---
          {
            id: 'main-door-1',
            dimension: 0,
            x: 6380,
            y: 160, // High dead-end platform (6150..6620, topY = 160) reached by climbing the rope over the tar pit (6620..7220) and jumping left!
            targetDimension: 1,
            targetDoorId: 'dim1-start-door',
            spawnX: 240,
            spawnY: GROUND_Y,
            keyId: 1,
          },
          {
            id: 'main-door-2',
            dimension: 0,
            x: 19160,
            y: 720, // Lower door platform (18980..19320, topY = 720) reached by climbing Rope 10A really high -> High Platform -> Rope 10B lower down!
            targetDimension: 2,
            targetDoorId: 'dim2-start-door',
            spawnX: 240,
            spawnY: GROUND_Y,
            keyId: 2,
          },
          {
            id: 'main-door-3',
            dimension: 0,
            x: 36760,
            y: 200, // Upper dead-end alcove (36540..36980, topY = 200) moved to the right past the staircase (36210..36490) so you never have to crawl down the stairs!
            targetDimension: 3,
            targetDoorId: 'dim3-start-door',
            spawnX: 240,
            spawnY: GROUND_Y,
            keyId: 3,
          },

          // --- DOOR DIMENSION 1 DOORS (Start Door & End Return Door -> both return to main-door-1) ---
          {
            id: 'dim1-start-door',
            dimension: 1,
            x: 240,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-1',
            spawnX: 6380,
            spawnY: 160,
            keyId: 1,
          },
          {
            id: 'dim1-return-door',
            dimension: 1,
            x: 7620,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-1',
            spawnX: 6380,
            spawnY: 160,
            keyId: 1,
          },

          // --- DOOR DIMENSION 2 DOORS (Start Door & End Return Door -> both return to main-door-2) ---
          {
            id: 'dim2-start-door',
            dimension: 2,
            x: 240,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-2',
            spawnX: 19160,
            spawnY: 720,
            keyId: 2,
          },
          {
            id: 'dim2-return-door',
            dimension: 2,
            x: 8320,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-2',
            spawnX: 19160,
            spawnY: 720,
            keyId: 2,
          },

          // --- DOOR DIMENSION 3 DOORS (Start Door & End Return Door -> both return to main-door-3) ---
          {
            id: 'dim3-start-door',
            dimension: 3,
            x: 240,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-3',
            spawnX: 36760,
            spawnY: 200,
            keyId: 3,
          },
          {
            id: 'dim3-return-door',
            dimension: 3,
            x: 8260,
            y: GROUND_Y,
            targetDimension: 0,
            targetDoorId: 'main-door-3',
            spawnX: 36760,
            spawnY: 200,
            keyId: 3,
          },
        ]
      : [];

    // --- MAIN COURSE (DIMENSION 0) OBSTACLE DEFINITIONS ---
    const mainSludgePits: { x1: number; x2: number }[] = isChapterOne
      ? [
          { x1: 1900, x2: 2130 }, // Simple Tar Pit #1 (230px): straightforward running jump over bubbling tar
          { x1: 2540, x2: 3180 }, // Simple Tar Pit #2 (640px): two-jump tar pit with a stationary stepping island block in the middle
          { x1: 3520, x2: 3750 }, // Centered tar pit directly beneath Normal Wall-Jump Shaft #1 (3520..3750)
          { x1: 4520, x2: 5850 }, // 1,330px Pure Rope Swing Tar Chasm: Swing off Rope #1 (4860) -> Rope #2 (5510, 650px apart, 340px from platforms!)
          { x1: 6570, x2: 7250 }, // 680px Tar Pit directly beneath Door #1's Climb Rope (at x = 6910, 340px from both sides!)
          { x1: 8510, x2: 8740 }, // Centered tar pit directly beneath Taller Wall-Jump Shaft #2 (8510..8740)
          { x1: 9350, x2: 10830 }, // 1,480px First Falling Platform Long-Pan Chasm: Swing off Rope #4 -> Elevated Falling Platform -> Rope #5
          { x1: 11000, x2: 12660 }, // 1,660px Tar Slough crossed by Calibrated Pair #1 of Moving Platforms (<-->)
          { x1: 12830, x2: 14220 }, // 1,390px tar gorge beneath Spaced Rope #6 (13180, Slide-Down under Ceiling Gate) & Rope #7 (13860, 680px apart!)
          { x1: 15100, x2: 15800 }, // Centered tar abyss directly beneath Double Wall-Jump Citadel #1 (15100..15800)
          { x1: 16440, x2: 18260 }, // 1,820px High Long-Pan Tar Chasm: Rope #8 -> Falling Platform -> Rope #9 -> Falling Platform
          { x1: 18420, x2: 21260 }, // 2,840px Door #2 Rope & Platform Chasm: Climb Rope 10A really high -> High Platform -> Rope 10B (halfway to Continue Platform at 19880..20120, or lower down to Door #2 at 18980..19320) -> Falling Platform -> Rope #11
          { x1: 22100, x2: 22750 }, // 650px tar pit with Moving Platform #1 (<-->) that carries Christian right into Wall-Jump Tower #4 (22520..22750)
          { x1: 23420, x2: 25920 }, // 2,500px Grand Tar Chasm: Calibrated Pair #2 of Moving Platforms -> Rope #12 -> Falling Platform -> Rope #13
          { x1: 26080, x2: 26760 }, // 680px tar pit beneath Long Climb-Up Rope #14 (at 26420) to Stepped Courtyard Cliff
          { x1: 28060, x2: 28790 }, // Centered tar abyss directly beneath Stepped Double Wall-Jump Citadel #2 (28060..28790)
          { x1: 29820, x2: 31180 }, // 1,360px Tar Slough: Double Staggered Falling Platforms -> Single Rope Swing #15 (at 30840)
          { x1: 31360, x2: 33120 }, // 1,760px Tar Abyss crossed by Elevated Calibrated Moving Platforms (<-->) flanking a Central Stone Pier
          { x1: 33300, x2: 34680 }, // 1,380px tar gorge beneath Spaced Ropes #16 (33640) & #17 (34320, 680px apart!) to High Keep
          { x1: 35320, x2: 35950 }, // 630px tar pit with Elevated Moving Platform (<-->) into Taller Wall-Jump Shaft #5 (35720..35950)
          { x1: 36880, x2: 38590 }, // 1,710px Tar Abyss: Triple Ascending Falling Platforms -> Climb-Up Rope #19 (at 38240)
          { x1: 39120, x2: 41000 }, // 1,880px Descending Canopy Chasm: High Rope #20 -> High Falling Platform -> Mid Rope #21 -> Low Falling Platform
          { x1: 41800, x2: 42500 }, // Centered tar abyss directly beneath Elevated-Entry Double Wall-Jump Citadel #3 (41800..42500)
          { x1: 43600, x2: 45940 }, // 2,340px Great Tar Slough: Rope #22 -> Falling Platform -> Rope #23 -> Falling Platform -> Climb-Up Rope #24
          { x1: 47340, x2: 47570 }, // Centered tar pit directly beneath Final City Gate Wall-Jump Tower #6 (47340..47570)
        ]
      : [];

    const mainLevelBlocks: LevelBlock[] = isChapterOne
      ? [
          // --- SECTION 1: OPENING — BELLY-CRAWL ARCH & SIMPLE TAR PIT JUMPS (x: 1480..3520) ---
          {
            // 1. Opening Belly-Crawl Arch (Hold Shift to army-crawl underneath)
            x1: 1480,
            x2: 1700,
            topY: 420,
            bottomY: GROUND_Y - 106, // 749
          },
          {
            // 2. Launch Block between Simple Tar Pit #1 (1900..2130) and Simple Tar Pit #2 (2540..3180)
            x1: 2130,
            x2: 2540,
            topY: GROUND_Y - 105, // 750
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 3. Stationary Mid-Pit Stepping Island inside Simple Tar Pit #2 (2540..3180)
            x1: 2760,
            x2: 2960,
            topY: GROUND_Y - 135, // 720
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 4. Landing & Launch Block after Simple Tar Pit #2 (x: 3180..3520)
            x1: 3180,
            x2: 3520,
            topY: GROUND_Y - 110, // 745
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 2: NORMAL WALL-JUMP SHAFT #1 WITH STEPPED PLATEAU DESCENT ---
          {
            // 5. Left Wall-Jump Pillar 1
            x1: 3420,
            x2: 3520,
            topY: 160,
            bottomY: GROUND_Y - 435, // 420
            canWallJumpRight: true,
          },
          {
            // 6A. High Plateau 1A on the far side of Tar Pit (x1 = 3750, shaft width = 230px, topY = 340)
            x1: 3750,
            x2: 4120,
            topY: 340,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 6B. Stepped Lower Terrace 1B descending from High Plateau 1A
            x1: 4120,
            x2: 4320,
            topY: 520,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 3: PURE ROPE SWING CHASM (SPACED 650PX APART) + GROUND CRAWL & HIGH ROPE CLIMB TO DOOR #1 ---
          {
            // 7. Launch Block before 1,330px Rope Swing Tar Chasm (4520..5850: Rope #1 at 4860 -> Rope #2 at 5510, 340px from platforms!)
            x1: 4320,
            x2: 4520,
            topY: GROUND_Y - 150, // 705
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 8. Landing Block after Rope #2 (5850..6000)
            x1: 5850,
            x2: 6000,
            topY: GROUND_Y - 140, // 715
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 9. Low Belly-Crawl Tunnel on solid ground with generous standing room on both sides
            x1: 6080,
            x2: 6240,
            topY: 420,
            bottomY: GROUND_Y - 106, // 749
          },
          {
            // 9B. Thick Bottom Dead-End Platform for Main Course Door #1 (90px thick: topY = 160, bottomY = 250)
            x1: 6150,
            x2: 6570,
            topY: 160,
            bottomY: 250,
            canMountLeft: true,
            canMountRight: true,
            ignoreRopeCollision: true,
          },
          {
            // 9C. Thick Dead-End Left Wall on Main Course Door #1 Platform (90px thick: x1 = 6150, x2 = 6240)
            x1: 6150,
            x2: 6240,
            topY: -170,
            bottomY: 160,
            ignoreRopeCollision: true,
          },
          {
            // 9D. Thick Overhead Roof of the Dead-End (90px thick: topY = -260, bottomY = -170), extended out over the Tar Pit (x2 = 6980) to hold up the climb rope at x = 6910!
            x1: 6150,
            x2: 6980,
            topY: -260,
            bottomY: -170,
            ignoreRopeCollision: true,
          },

          // --- SECTION 4: TAR PIT UNDER DOOR #1 CLIMB ROPE (6570..7250) — CLIMB ROPE & JUMP LEFT TO DOOR #1 OR JUMP RIGHT TO HIGH BASTION CLIFF ---
          {
            // 10A. Launch Block before Tar Pit (6570..7250) — jump right onto the rope hanging at x = 6910 over the tar pit!
            x1: 6390,
            x2: 6570,
            topY: GROUND_Y - 120, // 735
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 11. High Bastion Cliff across Tar Pit (7250..8000, topY = 375: jump right from the rope at x = 6910 to continue the main course!)
            x1: 7250,
            x2: 8000,
            topY: 375,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 11B. Stepped Backtrack Terrace on right side of High Bastion Cliff (so player can always backtrack left!)
            x1: 8000,
            x2: 8140,
            topY: 615,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 12. Low Belly-Crawl Gate atop the High Bastion Cliff
            x1: 7520,
            x2: 7820,
            topY: 110,
            bottomY: 375 - 106, // 269
          },

          // --- SECTION 5: TALLER NORMAL WALL-JUMP SHAFT #2 WITH ROOFTOP BELLY-CRAWL ---
          {
            // 13. Launch Block before Wall-Jump Shaft #2 (8510..8740)
            x1: 8220,
            x2: 8510,
            topY: GROUND_Y - 140, // 715
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 14. Left Wall-Jump Pillar 2
            x1: 8410,
            x2: 8510,
            topY: 140,
            bottomY: GROUND_Y - 455, // 400
            canWallJumpRight: true,
          },
          {
            // 15A. Tall Tower Plateau 2 across Tar Pit (x1 = 8740, shaft width = 230px, topY = 310)
            x1: 8740,
            x2: 9120,
            topY: 310,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 15B. Overhead Belly-Crawl Arch atop Tall Tower Plateau 2
            x1: 8830,
            x2: 9010,
            topY: 70,
            bottomY: 310 - 106, // 204
          },
          {
            // 15C. Stepped Backtrack Terrace between Tall Tower Plateau 2 (310) and Launch Block 16 (705)
            x1: 9120,
            x2: 9240,
            topY: 510,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 6: FIRST FALLING PLATFORM LONG-PAN CHASM (9350..10830) ---
          {
            // 16. Launch Block before Tar Slough (9350..10830: Rope #4 -> Elevated Falling Platform #1 -> Rope #5)
            x1: 9240,
            x2: 9350,
            topY: GROUND_Y - 150, // 705
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 17. Landing Block after Rope #5 & Level Launch Block for Moving Platforms 1A–1B (11000..12660, level at topY = 700!)
            x1: 10830,
            x2: 11000,
            topY: GROUND_Y - 155, // 700
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 7: CALIBRATED MOVING PLATFORMS #1 (11000..12660) + SPACED SLIDE-DOWN & CLIMB-UP ROPES (12830..14220) ---
          {
            // 18. High Swamp Cliff at right end of Moving Platforms — launches onto Rope #6 over Tar Gorge (12830..14220)
            x1: 12660,
            x2: 12830,
            topY: GROUND_Y - 155, // 700
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 19. Hanging Ceiling Gate between Rope #6 (13180) and Rope #7 (13860, 680px apart!) — raised higher (bottomY = 215) so jumping from the bottom of Rope #6 clears it easily!
            x1: 13490,
            x2: 13610,
            topY: 85,
            bottomY: 215,
          },
          {
            // 20. High Watchtower Platform across Tar Gorge (topY = 365: climb up Rope #7 with W!)
            x1: 14220,
            x2: 14720,
            topY: 365,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 20B. Stepped Backtrack Terrace on right side of High Watchtower Platform (so player can always backtrack left!)
            x1: 14720,
            x2: 14860,
            topY: 610,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 21. Low Belly-Crawl Gate atop the High Watchtower Platform
            x1: 14340,
            x2: 14560,
            topY: 110,
            bottomY: 365 - 106, // 259
          },

          // --- SECTION 8: DOUBLE WALL-JUMP CITADEL #1 OVER CENTERED TAR ABYSS (15100..15800) ---
          {
            // 22. Entry Wall-Jump Pillar 3A
            x1: 15000,
            x2: 15100,
            topY: 190,
            bottomY: GROUND_Y - 385, // 470
            canWallJumpRight: true,
          },
          {
            // 23. Central Wall-Jump Column extending down into Tar Pit (15330..15570, topY = 365)
            x1: 15330,
            x2: 15570,
            topY: 365,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canWallJumpRight: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 24. Upper Hanging Wall-Jump Pillar 3B above the right edge of Central Column
            x1: 15470,
            x2: 15570,
            topY: -120,
            bottomY: 40,
            canWallJumpRight: true,
          },
          {
            // 25. High Citadel Plateau 3 on the right bank of Tar Pit (topY = 265)
            x1: 15800,
            x2: 16440,
            topY: 265,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 26. Low Belly-Crawl Gate atop the High Citadel Plateau
            x1: 15980,
            x2: 16260,
            topY: 20,
            bottomY: 265 - 106, // 159
          },

          // --- SECTION 9: HIGH LONG-PAN CHASM (16440..18260: ROPE #8 -> FALLING PLATFORM #2 -> ROPE #9 -> FALLING PLATFORM #3) ---
          {
            // 27. Launch Block after Long-Pan Chasm #3 (18260..18420, topY = 720) before Door #2's High Climb Rope 10A (at x = 18720)
            x1: 18260,
            x2: 18420,
            topY: 720,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 10: DOOR #2 ROPE & PLATFORM TOWER (CLIMB ROPE 10A HIGH -> JUMP ON HIGH PLATFORM -> USE ROPE 10B HALFWAY TO CONTINUE OR LOWER DOWN FOR DOOR #2) ---
          {
            // 29A. High Overpass Platform (18980..19320, topY = 230, bottomY = 310):
            // Climb Rope 10A (at x = 18720) really high and jump onto this platform, then jump right onto Rope 10B (at x = 19600)!
            x1: 18980,
            x2: 19320,
            topY: 230,
            bottomY: 310,
            canMountLeft: true,
            canMountRight: true,
            ignoreRopeCollision: true,
          },
          {
            // 29B. Solid Left Dividing Wall under High Overpass Platform (18980..19060, topY = 310, bottomY = 720):
            // Forms the back wall of Door #2's lower chamber so you must climb Rope 10A to the High Platform first and descend Rope 10B on the right!
            x1: 18980,
            x2: 19060,
            topY: 310,
            bottomY: 720,
            ignoreRopeCollision: true,
          },
          {
            // 29C. Lower Door #2 Chamber Floor extending into the Tar Pit (18980..19320, topY = 720):
            // Reached by going lower down Rope 10B (at x = 19600) and jumping left! Door #2 sits here at x = 19160, y = 720.
            x1: 18980,
            x2: 19320,
            topY: 720,
            bottomY: GROUND_Y + 6,
            canMountRight: true,
            ignoreRopeCollision: true,
          },
          {
            // 30. Halfway Continue-Level Platform (19880..20120, topY = 475):
            // Reached by going down halfway on Rope 10B (at x = 19600) and jumping right to continue the level!
            x1: 19880,
            x2: 20120,
            topY: 475,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 31. High Sanctuary Cliff after Rope #11 (topY = 375)
            x1: 21260,
            x2: 21820,
            topY: 375,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 31B. Stepped Backtrack Terrace between High Sanctuary Cliff (375) and Step Block 33A (735)
            x1: 21820,
            x2: 21960,
            topY: 555,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 32. Low Belly-Crawl Gate atop the High Sanctuary Cliff
            x1: 21450,
            x2: 21690,
            topY: 110,
            bottomY: 375 - 106, // 269
          },

          // --- SECTION 11: MOVING PLATFORM WALL-JUMP OBSTACLE #1 (22100..22750) ---
          {
            // 33A. Level Launch Step Block at base of High Sanctuary Cliff (topY = 735, level with Moving Platform!)
            x1: 21960,
            x2: 22100,
            topY: GROUND_Y - 120, // 735
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 33B. Left Wall-Jump Pillar 4
            x1: 22420,
            x2: 22520,
            topY: 150,
            bottomY: GROUND_Y - 385, // 470
            canWallJumpRight: true,
          },
          {
            // 34. Tower Ridge Block 4 — topY = 330
            x1: 22750,
            x2: 23420,
            topY: 330,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 35. Low Belly-Crawl Gate atop Tower Ridge 4
            x1: 22920,
            x2: 23220,
            topY: 85,
            bottomY: 330 - 106, // 224
          },

          // --- SECTION 12 & 13: GRAND CHASM (23420..25920) + CLIMB-UP ROPE #14 TO STEPPED COURTYARD CLIFF ---
          {
            // 36. Launch Block between Rope #13 and Climb-Up Rope #14 over Tar Pit (26080..26760)
            x1: 25920,
            x2: 26080,
            topY: GROUND_Y - 125, // 730
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 37A. High Spire Cliff 14A across Tar Pit (topY = 365: climb up Rope #14 with W!)
            x1: 26760,
            x2: 27100,
            topY: 365,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 37B. Stepped Courtyard Terrace 14B descending from High Spire Cliff (topY = 585 so player can easily backtrack up from ground!)
            x1: 27100,
            x2: 27420,
            topY: 585,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 14: WIDER STEPPED DOUBLE WALL-JUMP CITADEL #2 WITH ROOFTOP HURDLE ---
          {
            // 38A. Ground Belly-Crawl Arch after Stepped Courtyard Cliff
            x1: 27560,
            x2: 27780,
            topY: 420,
            bottomY: GROUND_Y - 106, // 749
          },
          {
            // 38B. Entry Wall-Jump Pillar
            x1: 27960,
            x2: 28060,
            topY: 195,
            bottomY: GROUND_Y - 370, // 485
            canWallJumpRight: true,
          },
          {
            // 39. Wider Central Wall-Jump Column extending down into Tar Pit (28060..28790, topY = 385)
            x1: 28290,
            x2: 28560,
            topY: 385,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canWallJumpRight: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 40. Upper Hanging Wall-Jump Pillar above Central Column
            x1: 28460,
            x2: 28560,
            topY: -100,
            bottomY: 55,
            canWallJumpRight: true,
          },
          {
            // 41A. High Citadel Overlook on the right bank of Tar Pit (topY = 285)
            x1: 28790,
            x2: 29220,
            topY: 285,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 42. Stepped East Terrace descending from High Citadel Overlook
            x1: 29220,
            x2: 29480,
            topY: 475,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 15: DOUBLE STAGGERED FALLING PLATFORMS (#6 & #7) -> SINGLE SWINGING ROPE #15 (29820..31180) ---
          {
            // 43. High Launch Block before Tar Slough (29820..31180)
            x1: 29480,
            x2: 29820,
            topY: GROUND_Y - 195, // 660
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 44. Landing Block after Rope #15 & Level Launch Block for Elevated Moving Platforms 3A–3B (level at topY = 650!)
            x1: 31180,
            x2: 31360,
            topY: 650,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 16: ELEVATED MOVING PLATFORMS WITH CENTRAL STONE PIER + SPACED HIGH-TO-LOW ROPES (33300..34680) ---
          {
            // 45A. Stationary Central Stone Pier in the middle of the 1,760px Tar Abyss (level at topY = 650!)
            x1: 32140,
            x2: 32340,
            topY: 650,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 45B. High Keep Cliff Launch at right end of Moving Platforms 3A–3B (level at topY = 650) before Tar Gorge (33300..34680)
            x1: 33120,
            x2: 33300,
            topY: 650,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 46. High Keep Platform across Tar Gorge (topY = 355: climb up Rope #17 with W!)
            x1: 34680,
            x2: 35040,
            topY: 355,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 46B. Stepped Backtrack Terrace between High Keep Platform (355) and Step Block 48A (705)
            x1: 35040,
            x2: 35180,
            topY: 530,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },

          // --- SECTION 17: ELEVATED MOVING PLATFORM WALL-JUMP OBSTACLE #2 (35320..35950) + UPPER ALCOVE TO DOOR #3 (NO ROPE!) ---
          {
            // 48A. Level Launch Step Block at base of High Keep Platform (topY = 705, level with Moving Platform!)
            x1: 35180,
            x2: 35320,
            topY: 705,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 48B. Left Wall-Jump Pillar 5 (high bottomY = 420 so jumping off the Moving Platform at y = 705 has 285px of clearance!)
            x1: 35620,
            x2: 35720,
            topY: 140,
            bottomY: 420,
            canWallJumpRight: true,
          },
          {
            // 49A. Tall Tower Plateau 5A across Tar Pit (x1 = 35950, shaft width = 230px, topY = 300)
            // From here, jump right across the 160px gap onto Door #3's Upper Alcove (36370, topY = 200) OR step down the terrace to continue!
            x1: 35950,
            x2: 36210,
            topY: 300,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 49B-1. Upper Stepped Battlement Terrace descending from Tall Tower Plateau 5A (135px step so you can also jump back up to Door #3!)
            x1: 36210,
            x2: 36350,
            topY: 435,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 49B-2. Lower Stepped Battlement Terrace (135px step between 435 and 700!)
            x1: 36350,
            x2: 36490,
            topY: 570,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 49C. Thick Upper Dead-End Alcove Floor for Main Course Door #3 (moved right to 36540..36980 so it never overhangs the staircase 36210..36490!)
            x1: 36540,
            x2: 36980,
            topY: 200,
            bottomY: 290,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 49D. Thick Right Dead-End Wall of Door #3 Alcove (90px thick)
            x1: 36890,
            x2: 36980,
            topY: -110,
            bottomY: 200,
          },
          {
            // 49E. Thick Overhead Roof of Door #3 Alcove (90px thick)
            x1: 36540,
            x2: 36980,
            topY: -200,
            bottomY: -110,
          },

          // --- SECTION 18: TRIPLE ASCENDING FALLING PLATFORMS -> CLIMB-UP ROPE #19 (36880..38590) ---
          {
            // 50. Launch Block before 1,710px Tar Abyss (36880..38590)
            x1: 36490,
            x2: 36880,
            topY: GROUND_Y - 155, // 700
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 51. High Bastion Platform after Rope #19 (topY = 375: climb up Rope #19 with W!)
            x1: 38590,
            x2: 39120,
            topY: 375,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 52. Low Belly-Crawl Gate atop the High Bastion Platform
            x1: 38730,
            x2: 38970,
            topY: 110,
            bottomY: 375 - 106, // 269
          },

          // --- SECTION 19: DESCENDING CANOPY CHASM (39120..41000: HIGH ROPE #20 -> FALLING PLATFORM #10 -> MID ROPE #21 -> FALLING PLATFORM #11) ---
          {
            // 53. Mire Bastion Pillar at the right end of Chasm (41000..41150)
            x1: 41000,
            x2: 41150,
            topY: GROUND_Y - 135, // 720
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 54. Ground Belly-Crawl Arch after Mire Bastion Pillar (with 240px open standing room after!)
            x1: 41260,
            x2: 41420,
            topY: 420,
            bottomY: GROUND_Y - 106, // 749
          },

          // --- SECTION 20: ELEVATED-ENTRY DOUBLE WALL-JUMP CITADEL #3 OVER TAR ABYSS (41800..42500) ---
          {
            // 55A. Elevated Launch Step before Double Wall-Jump Citadel #3
            x1: 41640,
            x2: 41800,
            topY: GROUND_Y - 120, // 735
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 55B. Entry Wall-Jump Pillar
            x1: 41700,
            x2: 41800,
            topY: 165,
            bottomY: 440,
            canWallJumpRight: true,
          },
          {
            // 56. Higher Central Wall-Jump Column extending down into Tar Pit (41800..42500, topY = 340)
            x1: 42030,
            x2: 42270,
            topY: 340,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canWallJumpRight: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 57. Upper Hanging Wall-Jump Pillar above Central Column
            x1: 42170,
            x2: 42270,
            topY: -135,
            bottomY: 25,
            canWallJumpRight: true,
          },
          {
            // 58. High Citadel Summit on the right bank of Tar Pit (topY = 245)
            x1: 42500,
            x2: 43080,
            topY: 245,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 58B. Stepped Backtrack Terrace between High Citadel Summit (245) and Launch Block 60 (710)
            x1: 43080,
            x2: 43220,
            topY: 480,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 59. Low Belly-Crawl Gate atop the High Citadel Summit
            x1: 42650,
            x2: 42930,
            topY: 10,
            bottomY: 245 - 106, // 139
          },

          // --- SECTION 21: GRAND LONG-PAN FINALE (43600..45940: ROPE #22 -> FALLING PLATFORM #12 -> ROPE #23 -> FALLING PLATFORM #13 -> ROPE #24) ---
          {
            // 60. Launch Block before 2,340px Great Tar Slough (43600..45940)
            x1: 43220,
            x2: 43600,
            topY: GROUND_Y - 145, // 710
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 61. High Outer Wall Platform after Rope #24 (topY = 370)
            x1: 45940,
            x2: 46400,
            topY: 370,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 61B. Stepped Backtrack Terrace on right side of High Outer Wall Platform (so player can always backtrack left!)
            x1: 46400,
            x2: 46540,
            topY: 610,
            bottomY: GROUND_Y + 6,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 62. Low Belly-Crawl Gate atop the High Outer Wall Platform
            x1: 46060,
            x2: 46280,
            topY: 105,
            bottomY: 370 - 106, // 264
          },
          {
            // 63. Final Ground Belly-Crawl Arch before Final City Gate Wall-Jump Tower
            x1: 46680,
            x2: 46960,
            topY: 420,
            bottomY: GROUND_Y - 106, // 749
          },

          // --- SECTION 22: NORMAL WALL-JUMP SHAFT #3 — FINAL CITY GATE TOWER (47340..48500) ---
          {
            // 64. Final Left Wall-Jump Pillar 6
            x1: 47240,
            x2: 47340,
            topY: 150,
            bottomY: GROUND_Y - 385, // 470
            canWallJumpRight: true,
          },
          {
            // 65. Final City Boundary Ridge Block (ends at x2 = 48456 flush against the left edge of the final black exit line at 48456..48504!)
            x1: 47570,
            x2: 48456,
            topY: 330,
            bottomY: GROUND_Y + 6,
            canWallJumpLeft: true,
            canMountLeft: true,
            canMountRight: true,
          },
          {
            // 66. Final Belly-Crawl Gate atop the City Boundary Ridge
            x1: 47820,
            x2: 48180,
            topY: 85,
            bottomY: 330 - 106, // 224
          },
        ]
      : [];

    const createMainCollapsingPlatforms = (): CollapsingPlatform[] =>
      isChapterOne
        ? [
            createCollapsingPlatform(10010, 10190, 575),
            createCollapsingPlatform(17110, 17280, 555),
            createCollapsingPlatform(17920, 18100, 585),
            createCollapsingPlatform(20340, 20580, 550),
            createCollapsingPlatform(25100, 25270, 580),
            createCollapsingPlatform(29960, 30160, 635),
            createCollapsingPlatform(30300, 30500, 585),
            createCollapsingPlatform(37000, 37200, 625),
            createCollapsingPlatform(37350, 37550, 580),
            createCollapsingPlatform(37700, 37900, 535),
            createCollapsingPlatform(39790, 39970, 505),
            createCollapsingPlatform(40630, 40820, 605),
            createCollapsingPlatform(44280, 44450, 560),
            createCollapsingPlatform(45110, 45280, 550),
          ]
        : [];

    const createMainMovingPlatforms = (): MovingPlatform[] =>
      isChapterOne
        ? [
            createMovingPlatform(11170, 11630, 700, 250, 240, 11170, 1),
            createMovingPlatform(12030, 12490, 700, 250, 240, 12490, -1),
            createMovingPlatform(22240, 22615, 735, 250, 235, 22240, 1),
            createMovingPlatform(23585, 23905, 560, 250, 250, 23585, 1),
            createMovingPlatform(24145, 24445, 560, 250, 250, 24445, -1),
            createMovingPlatform(31500, 31870, 650, 250, 255, 31500, 1),
            createMovingPlatform(32610, 32980, 650, 250, 255, 32980, -1),
            createMovingPlatform(35455, 35815, 705, 250, 250, 35455, 1),
          ]
        : [];

    const createMainSwingingRopes = (): SwingingRope[] =>
      isChapterOne
        ? [
            // Section 3 Spaced Twin Ropes (650px apart, 340px from launch/landing platforms!)
            { pivotX: 4860, pivotY: 135, length: 420, baseAmp: 0.65, freq: 2.2, phase: 0.0, angle: 0, angularVel: 0 },
            { pivotX: 5510, pivotY: 135, length: 420, baseAmp: 0.65, freq: 2.2, phase: 1.1, angle: 0, angularVel: 0 },
            // Climb Rope over Tar Pit #5 (6570..7250) — held up by the extended Top Roof (9D, bottomY = -170): climb up & jump left to Door #1 or jump right to continue!
            { pivotX: 6910, pivotY: -166, length: 715, baseAmp: 0.0, freq: 2.0, phase: 0.0, angle: 0, angularVel: 0 },
            // Section 6 Ropes flanking Falling Platform #1
            { pivotX: 9690, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 0.2, angle: 0, angularVel: 0 },
            { pivotX: 10510, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 1.45, angle: 0, angularVel: 0 },
            // Section 7 Spaced Slide-Down & Climb-Up Ropes (680px apart!)
            { pivotX: 13180, pivotY: 105, length: 510, baseAmp: 0.68, freq: 2.15, phase: 0.5, angle: 0, angularVel: 0 },
            { pivotX: 13860, pivotY: 105, length: 510, baseAmp: 0.68, freq: 2.15, phase: 1.9, angle: 0, angularVel: 0 },
            // Section 9 Ropes
            { pivotX: 16790, pivotY: 125, length: 405, baseAmp: 0.65, freq: 2.2, phase: 0.3, angle: 0, angularVel: 0 },
            { pivotX: 17600, pivotY: 125, length: 410, baseAmp: 0.65, freq: 2.2, phase: 1.5, angle: 0, angularVel: 0 },
            // Section 10 Door #2 Tower Ropes:
            // - Climb Rope 10A (18720): climb really high to jump onto High Platform (18980..19320, topY = 230)
            // - Descent Rope 10B (19600): go down halfway to jump right onto Continue Platform (19880..20120, topY = 475), OR go lower down the rope to jump left to Door #2 (topY = 720)!
            { pivotX: 18720, pivotY: 25, length: 550, baseAmp: 0.0, freq: 2.0, phase: 0.0, angle: 0, angularVel: 0 },
            { pivotX: 19600, pivotY: 25, length: 560, baseAmp: 0.0, freq: 2.0, phase: 0.5, angle: 0, angularVel: 0 },
            // Section 10 Climb-Up Rope #11 (after Falling Platform at 20340..20580)
            { pivotX: 20920, pivotY: 105, length: 500, baseAmp: 0.65, freq: 2.15, phase: 1.6, angle: 0, angularVel: 0 },
            // Section 12 & 13 Ropes
            { pivotX: 24780, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 0.4, angle: 0, angularVel: 0 },
            { pivotX: 25590, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 1.7, angle: 0, angularVel: 0 },
            { pivotX: 26420, pivotY: 105, length: 500, baseAmp: 0.65, freq: 2.15, phase: 0.4, angle: 0, angularVel: 0 },
            // Section 15 Rope
            { pivotX: 30840, pivotY: 135, length: 405, baseAmp: 0.65, freq: 2.2, phase: 0.8, angle: 0, angularVel: 0 },
            // Section 16 Spaced High-to-Low Ropes (680px apart!)
            { pivotX: 33640, pivotY: 105, length: 430, baseAmp: 0.68, freq: 2.2, phase: 0.8, angle: 0, angularVel: 0 },
            { pivotX: 34320, pivotY: 105, length: 500, baseAmp: 0.68, freq: 2.15, phase: 2.1, angle: 0, angularVel: 0 },
            // Section 18, 19, 21 Ropes
            { pivotX: 38240, pivotY: 105, length: 500, baseAmp: 0.65, freq: 2.15, phase: 1.8, angle: 0, angularVel: 0 },
            { pivotX: 39460, pivotY: 135, length: 375, baseAmp: 0.65, freq: 2.25, phase: 0.5, angle: 0, angularVel: 0 },
            { pivotX: 40300, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 1.9, angle: 0, angularVel: 0 },
            { pivotX: 43950, pivotY: 105, length: 445, baseAmp: 0.65, freq: 2.15, phase: 0.0, angle: 0, angularVel: 0 },
            { pivotX: 44780, pivotY: 105, length: 445, baseAmp: 0.65, freq: 2.15, phase: 1.4, angle: 0, angularVel: 0 },
            { pivotX: 45600, pivotY: 105, length: 495, baseAmp: 0.65, freq: 2.15, phase: 2.8, angle: 0, angularVel: 0 },
          ]
        : [];

    // --- ENLARGED DOOR DIMENSION 1 COURSE (LEVEL_WIDTH = 7800; Holds Key #1 at x = 7330, y = 485; Return Door at x = 7620) ---
    const dim1SludgePits: { x1: number; x2: number }[] = [
      { x1: 600, x2: 1300 }, // Wide Stepping-Stone Tar Slough
      { x1: 1980, x2: 3320 }, // Spaced Twin Swinging Ropes Chasm (Rope 1 at 2320 -> Rope 2 at 2970, 650px apart, 340px from platforms!)
      { x1: 3500, x2: 3730 }, // Normal Wall-Jump Shaft Tar Pit
      { x1: 4400, x2: 5840 }, // Calibrated Pair of Level Moving Platforms (<-->)
      { x1: 6000, x2: 7220 }, // Rope Swing (6340) -> High Collapsing Platform -> Key #1 Sanctum
    ];
    const dim1LevelBlocks: LevelBlock[] = [
      { x1: 440, x2: 600, topY: 745, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 740, x2: 920, topY: 720, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 1040, x2: 1200, topY: 680, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 1450, x2: 1630, topY: 420, bottomY: GROUND_Y - 106 }, // Ground belly-crawl tunnel with 210px open standing room after!
      { x1: 1840, x2: 1980, topY: 705, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 3320, x2: 3500, topY: 715, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 3400, x2: 3500, topY: 160, bottomY: 420, canWallJumpRight: true },
      { x1: 3730, x2: 4240, topY: 330, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canMountLeft: true, canMountRight: true },
      { x1: 3890, x2: 4050, topY: 85, bottomY: 330 - 106 }, // Rooftop belly-crawl gate with 190px open standing room after!
      { x1: 4240, x2: 4400, topY: 700, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 5840, x2: 6000, topY: 700, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 7220, x2: 7480, topY: 565, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true }, // Key #1 Sanctum (Key at x=7330, y=485)
    ];
    const createDim1CollapsingPlatforms = (): CollapsingPlatform[] => [
      createCollapsingPlatform(6680, 6930, 565),
    ];
    const createDim1MovingPlatforms = (): MovingPlatform[] => [
      createMovingPlatform(4560, 4940, 700, 250, 240, 4560, 1),
      createMovingPlatform(5300, 5680, 700, 250, 240, 5680, -1),
    ];
    const createDim1SwingingRopes = (): SwingingRope[] => [
      { pivotX: 2320, pivotY: 135, length: 415, baseAmp: 0.65, freq: 2.2, phase: 0.2, angle: 0, angularVel: 0 },
      { pivotX: 2970, pivotY: 135, length: 415, baseAmp: 0.65, freq: 2.2, phase: 1.3, angle: 0, angularVel: 0 },
      { pivotX: 6340, pivotY: 135, length: 415, baseAmp: 0.65, freq: 2.2, phase: 0.6, angle: 0, angularVel: 0 },
    ];

    // --- ENLARGED DOOR DIMENSION 2 COURSE (LEVEL_WIDTH = 8500; Holds Key #2 at x = 8050, y = 465; Return Door at x = 8320) ---
    const dim2SludgePits: { x1: number; x2: number }[] = [
      { x1: 580, x2: 2040 }, // Calibrated Pair of Level Moving Platforms (<-->)
      { x1: 2360, x2: 2590 }, // Centered tar pit beneath Normal Wall-Jump Shaft
      { x1: 3220, x2: 4820 }, // Rope 1 (3560) -> Collapsing Platform -> Climb-Up Rope 2 (4460)
      { x1: 5820, x2: 6450 }, // Moving-Platform Wall-Jump Pit
      { x1: 6640, x2: 7960 }, // Spaced Twin Swinging Ropes Gorge (6980 -> 7630, 650px apart!) to Key #2 Sanctum
    ];
    const dim2LevelBlocks: LevelBlock[] = [
      { x1: 420, x2: 580, topY: 700, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 2040, x2: 2360, topY: 700, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 2260, x2: 2360, topY: 160, bottomY: 425, canWallJumpRight: true },
      { x1: 2590, x2: 3100, topY: 340, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canMountLeft: true, canMountRight: true },
      { x1: 2740, x2: 2910, topY: 95, bottomY: 340 - 106 }, // Rooftop belly-crawl gate with 190px open standing room after!
      { x1: 3100, x2: 3220, topY: 705, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 4820, x2: 5120, topY: 385, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 5260, x2: 5440, topY: 420, bottomY: GROUND_Y - 106 }, // Ground belly-crawl tunnel with 240px open standing room after!
      { x1: 5680, x2: 5820, topY: 735, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 6120, x2: 6220, topY: 155, bottomY: 470, canWallJumpRight: true },
      { x1: 6450, x2: 6640, topY: 330, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canMountLeft: true, canMountRight: true },
      { x1: 7960, x2: 8180, topY: 545, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true }, // Key #2 Sanctum (Key at x=8050, y=465)
    ];
    const createDim2CollapsingPlatforms = (): CollapsingPlatform[] => [
      createCollapsingPlatform(3900, 4120, 555),
    ];
    const createDim2MovingPlatforms = (): MovingPlatform[] => [
      createMovingPlatform(740, 1120, 700, 250, 240, 740, 1),
      createMovingPlatform(1500, 1880, 700, 250, 240, 1880, -1),
      createMovingPlatform(5960, 6315, 735, 250, 235, 5960, 1),
    ];
    const createDim2SwingingRopes = (): SwingingRope[] => [
      { pivotX: 3560, pivotY: 120, length: 420, baseAmp: 0.65, freq: 2.2, phase: 0.2, angle: 0, angularVel: 0 },
      { pivotX: 4460, pivotY: 105, length: 495, baseAmp: 0.65, freq: 2.15, phase: 1.4, angle: 0, angularVel: 0 },
      { pivotX: 6980, pivotY: 135, length: 415, baseAmp: 0.65, freq: 2.2, phase: 0.4, angle: 0, angularVel: 0 },
      { pivotX: 7630, pivotY: 135, length: 415, baseAmp: 0.65, freq: 2.2, phase: 1.5, angle: 0, angularVel: 0 },
    ];

    // --- ENLARGED DOOR DIMENSION 3 COURSE (LEVEL_WIDTH = 8400; Holds Key #3 at x = 7980, y = 465; Return Door at x = 8260) ---
    const dim3SludgePits: { x1: number; x2: number }[] = [
      { x1: 560, x2: 1210 }, // Moving-Platform Wall-Jump Pit
      { x1: 1760, x2: 3120 }, // Double Staggered Falling Platforms -> Rope Swing Chasm
      { x1: 3300, x2: 4680 }, // Spaced Slide-Down & Climb-Up Ropes Gorge (3640 -> 4320, 680px apart!)
      { x1: 5360, x2: 6920 }, // Elevated Calibrated Moving Platforms (<-->) flanking a Central Stone Pier
      { x1: 7140, x2: 7840 }, // Double Wall-Jump Citadel over Centered Tar Abyss
    ];
    const dim3LevelBlocks: LevelBlock[] = [
      { x1: 420, x2: 560, topY: 735, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 880, x2: 980, topY: 155, bottomY: 470, canWallJumpRight: true },
      { x1: 1210, x2: 1580, topY: 330, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canMountLeft: true, canMountRight: true },
      { x1: 1580, x2: 1760, topY: 660, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 3120, x2: 3300, topY: 685, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 3950, x2: 4070, topY: 85, bottomY: 215 }, // Hanging Ceiling Gate between Rope 3640 & Rope 4320 (raised so jumping from the bottom of the rope clears it easily!)
      { x1: 4680, x2: 5180, topY: 365, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 4820, x2: 4990, topY: 110, bottomY: 365 - 106 }, // Rooftop belly-crawl gate with 190px open standing room after!
      { x1: 5180, x2: 5360, topY: 650, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 6040, x2: 6240, topY: 650, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true }, // Central Stone Pier
      { x1: 6920, x2: 7140, topY: 720, bottomY: GROUND_Y + 6, canMountLeft: true, canMountRight: true },
      { x1: 7040, x2: 7140, topY: 180, bottomY: 460, canWallJumpRight: true },
      { x1: 7370, x2: 7610, topY: 365, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canWallJumpRight: true, canMountLeft: true, canMountRight: true },
      { x1: 7510, x2: 7610, topY: -120, bottomY: 40, canWallJumpRight: true },
      { x1: 7840, x2: 8120, topY: 545, bottomY: GROUND_Y + 6, canWallJumpLeft: true, canMountLeft: true, canMountRight: true }, // Key #3 Sanctum (Key at x=7980, y=465)
    ];
    const createDim3CollapsingPlatforms = (): CollapsingPlatform[] => [
      createCollapsingPlatform(1900, 2100, 635),
      createCollapsingPlatform(2250, 2450, 585),
    ];
    const createDim3MovingPlatforms = (): MovingPlatform[] => [
      createMovingPlatform(700, 1075, 735, 250, 235, 700, 1),
      createMovingPlatform(5500, 5840, 650, 250, 250, 5500, 1),
      createMovingPlatform(6440, 6780, 650, 250, 250, 6780, -1),
    ];
    const createDim3SwingingRopes = (): SwingingRope[] => [
      { pivotX: 2780, pivotY: 135, length: 410, baseAmp: 0.65, freq: 2.2, phase: 0.8, angle: 0, angularVel: 0 },
      { pivotX: 3640, pivotY: 105, length: 505, baseAmp: 0.68, freq: 2.15, phase: 0.5, angle: 0, angularVel: 0 },
      { pivotX: 4320, pivotY: 105, length: 505, baseAmp: 0.68, freq: 2.15, phase: 1.9, angle: 0, angularVel: 0 },
    ];

    // Active course arrays (switched seamlessly when Christian enters/exits any of the 3 Door Dimensions!)
    let sludgePits: { x1: number; x2: number }[] = [];
    let groundSegments: { x1: number; x2: number }[] = [];
    let levelBlocks: LevelBlock[] = [];
    let collapsingPlatforms: CollapsingPlatform[] = [];
    let movingPlatforms: MovingPlatform[] = [];
    let swingingRopes: SwingingRope[] = [];
    let ropeGallowsFrames: {
      beamX1: number;
      beamX2: number;
      beamY: number;
      leftPostX: number;
      leftPostBottomY: number;
      rightPostX: number;
      rightPostBottomY: number;
    }[] = [];
    let mountableLedges: { edgeX: number; topY: number; dir: 1 | -1 }[] = [];

    const resolveGallowsPostBottomY = (postX: number): number => {
      for (const b of levelBlocks) {
        if (b.bottomY >= GROUND_Y && postX >= b.x1 && postX <= b.x2) {
          return b.topY;
        }
      }
      // If the rope frame post is over a tar pit, extend it down into the tar pit so the bubbling tar covers its base!
      const overTarPit = sludgePits.some(
        (pit) => postX >= pit.x1 - 24 && postX <= pit.x2 + 24
      );
      if (overTarPit) {
        return GROUND_Y + 65;
      }
      return GROUND_Y;
    };

    const setActiveDimension = (dim: 0 | 1 | 2 | 3) => {
      if (!isChapterOne) {
        LEVEL_WIDTH = W;
        sludgePits = [];
        groundSegments = [{ x1: 0, x2: W }];
        levelBlocks = [];
        collapsingPlatforms = [];
        movingPlatforms = [];
        swingingRopes = [];
        ropeGallowsFrames = [];
        mountableLedges = [];
        return;
      }

      if (dim === 0) {
        LEVEL_WIDTH = 54000;
        sludgePits = mainSludgePits;
        levelBlocks = mainLevelBlocks;
        collapsingPlatforms = createMainCollapsingPlatforms();
        movingPlatforms = createMainMovingPlatforms();
        swingingRopes = createMainSwingingRopes();
        ropeGallowsFrames = [
          { beamX1: 4460, beamX2: 5910, beamY: 135, leftPostX: 4485, leftPostBottomY: resolveGallowsPostBottomY(4485), rightPostX: 5885, rightPostBottomY: resolveGallowsPostBottomY(5885) },
          { beamX1: 9290, beamX2: 10890, beamY: 135, leftPostX: 9315, leftPostBottomY: resolveGallowsPostBottomY(9315), rightPostX: 10865, rightPostBottomY: resolveGallowsPostBottomY(10865) },
          { beamX1: 12770, beamX2: 14280, beamY: 105, leftPostX: 12795, leftPostBottomY: resolveGallowsPostBottomY(12795), rightPostX: 14255, rightPostBottomY: resolveGallowsPostBottomY(14255) },
          { beamX1: 16380, beamX2: 18320, beamY: 125, leftPostX: 16405, leftPostBottomY: resolveGallowsPostBottomY(16405), rightPostX: 18295, rightPostBottomY: resolveGallowsPostBottomY(18295) },
          { beamX1: 18340, beamX2: 19960, beamY: 25, leftPostX: 18365, leftPostBottomY: resolveGallowsPostBottomY(18365), rightPostX: 19935, rightPostBottomY: resolveGallowsPostBottomY(19935) },
          { beamX1: 20580, beamX2: 21320, beamY: 105, leftPostX: 20605, leftPostBottomY: resolveGallowsPostBottomY(20605), rightPostX: 21295, rightPostBottomY: resolveGallowsPostBottomY(21295) },
          { beamX1: 23350, beamX2: 25980, beamY: 135, leftPostX: 23375, leftPostBottomY: resolveGallowsPostBottomY(23375), rightPostX: 25955, rightPostBottomY: resolveGallowsPostBottomY(25955) },
          { beamX1: 26020, beamX2: 26820, beamY: 105, leftPostX: 26045, leftPostBottomY: resolveGallowsPostBottomY(26045), rightPostX: 26795, rightPostBottomY: resolveGallowsPostBottomY(26795) },
          { beamX1: 29760, beamX2: 31240, beamY: 135, leftPostX: 29785, leftPostBottomY: resolveGallowsPostBottomY(29785), rightPostX: 31215, rightPostBottomY: resolveGallowsPostBottomY(31215) },
          { beamX1: 33240, beamX2: 34740, beamY: 105, leftPostX: 33265, leftPostBottomY: resolveGallowsPostBottomY(33265), rightPostX: 34715, rightPostBottomY: resolveGallowsPostBottomY(34715) },
          { beamX1: 37960, beamX2: 38650, beamY: 105, leftPostX: 37985, leftPostBottomY: resolveGallowsPostBottomY(37985), rightPostX: 38625, rightPostBottomY: resolveGallowsPostBottomY(38625) },
          { beamX1: 39060, beamX2: 41060, beamY: 135, leftPostX: 39085, leftPostBottomY: resolveGallowsPostBottomY(39085), rightPostX: 41035, rightPostBottomY: resolveGallowsPostBottomY(41035) },
          { beamX1: 43540, beamX2: 46000, beamY: 105, leftPostX: 43565, leftPostBottomY: resolveGallowsPostBottomY(43565), rightPostX: 45975, rightPostBottomY: resolveGallowsPostBottomY(45975) },
        ];
      } else if (dim === 1) {
        LEVEL_WIDTH = 7800;
        sludgePits = dim1SludgePits;
        levelBlocks = dim1LevelBlocks;
        collapsingPlatforms = createDim1CollapsingPlatforms();
        movingPlatforms = createDim1MovingPlatforms();
        swingingRopes = createDim1SwingingRopes();
        ropeGallowsFrames = [
          { beamX1: 1920, beamX2: 3380, beamY: 135, leftPostX: 1945, leftPostBottomY: resolveGallowsPostBottomY(1945), rightPostX: 3355, rightPostBottomY: resolveGallowsPostBottomY(3355) },
          { beamX1: 5940, beamX2: 7280, beamY: 135, leftPostX: 5965, leftPostBottomY: resolveGallowsPostBottomY(5965), rightPostX: 7255, rightPostBottomY: resolveGallowsPostBottomY(7255) },
        ];
      } else if (dim === 2) {
        LEVEL_WIDTH = 8500;
        sludgePits = dim2SludgePits;
        levelBlocks = dim2LevelBlocks;
        collapsingPlatforms = createDim2CollapsingPlatforms();
        movingPlatforms = createDim2MovingPlatforms();
        swingingRopes = createDim2SwingingRopes();
        ropeGallowsFrames = [
          { beamX1: 3160, beamX2: 4880, beamY: 105, leftPostX: 3185, leftPostBottomY: resolveGallowsPostBottomY(3185), rightPostX: 4855, rightPostBottomY: resolveGallowsPostBottomY(4855) },
          { beamX1: 6580, beamX2: 8020, beamY: 135, leftPostX: 6605, leftPostBottomY: resolveGallowsPostBottomY(6605), rightPostX: 7995, rightPostBottomY: resolveGallowsPostBottomY(7995) },
        ];
      } else {
        LEVEL_WIDTH = 8400;
        sludgePits = dim3SludgePits;
        levelBlocks = dim3LevelBlocks;
        collapsingPlatforms = createDim3CollapsingPlatforms();
        movingPlatforms = createDim3MovingPlatforms();
        swingingRopes = createDim3SwingingRopes();
        ropeGallowsFrames = [
          { beamX1: 1700, beamX2: 3180, beamY: 135, leftPostX: 1725, leftPostBottomY: resolveGallowsPostBottomY(1725), rightPostX: 3155, rightPostBottomY: resolveGallowsPostBottomY(3155) },
          { beamX1: 3240, beamX2: 4740, beamY: 105, leftPostX: 3265, leftPostBottomY: resolveGallowsPostBottomY(3265), rightPostX: 4715, rightPostBottomY: resolveGallowsPostBottomY(4715) },
        ];
      }

      // Recompute solid ground segments from [0, LEVEL_WIDTH] minus sludgePits
      groundSegments = [];
      let cursorX = 0;
      for (const pit of sludgePits) {
        if (pit.x1 > cursorX) {
          groundSegments.push({ x1: cursorX, x2: pit.x1 });
        }
        cursorX = pit.x2;
      }
      if (cursorX < LEVEL_WIDTH) {
        groundSegments.push({ x1: cursorX, x2: LEVEL_WIDTH });
      }

      // Recompute mountable ledges for the active course
      mountableLedges = [];
      for (const b of levelBlocks) {
        if (b.canMountLeft) {
          const buriedLeft = levelBlocks.some(
            (other) =>
              other !== b &&
              other.x1 <= b.x1 &&
              other.x2 >= b.x1 &&
              other.topY < b.topY &&
              other.bottomY > b.topY
          );
          if (!buriedLeft) {
            mountableLedges.push({ edgeX: b.x1, topY: b.topY, dir: 1 });
          }
        }
        if (b.canMountRight) {
          const buriedRight = levelBlocks.some(
            (other) =>
              other !== b &&
              other.x1 <= b.x2 &&
              other.x2 >= b.x2 &&
              other.topY < b.topY &&
              other.bottomY > b.topY
          );
          if (!buriedRight) {
            mountableLedges.push({ edgeX: b.x2, topY: b.topY, dir: -1 });
          }
        }
      }
    };

    // Initialize on Main Course (Dimension 0)
    setActiveDimension(0);

    // Core horizontal clearance for low overhead crawl tunnels so Christian stays crouched while his core body
    // is underneath the obstacle, while allowing his burden and back to slightly morph into the wall edge when getting up!
    const CRAWL_BODY_CLEARANCE = 24;
    const isInsideCrawlTunnel = (
      xPos: number,
      yPos: number,
      crouchBlendVal: number
    ): boolean => {
      if (crouchBlendVal < 0.4) {
        return false;
      }
      return levelBlocks.some(
        (b) =>
          xPos + CRAWL_BODY_CLEARANCE > b.x1 &&
          xPos - CRAWL_BODY_CLEARANCE < b.x2 &&
          yPos > b.bottomY &&
          yPos - STANDING_H < b.bottomY
      );
    };

    // Shared flexible, wavy rope curve evaluator so the rope bends and ripples like real braided hemp
    // while Christian's hands stay 100% locked onto the exact rope coordinate at his grab distance,
    // and clamping against levelBlocks so the rope NEVER passes through any obstacle block!
    const getRopePointAtDist = (
      rope: SwingingRope,
      dist: number,
      nowSec: number,
      grabbedDist: number | null
    ) => {
      const u = clamp(dist / Math.max(1, rope.length), 0, 1);
      const sinA = Math.sin(rope.angle);
      const cosA = Math.cos(rope.angle);

      const env = Math.pow(u, 0.85);
      const swingEnergy = Math.min(
        1.8,
        Math.abs(rope.angularVel) * 0.95 + Math.abs(rope.angle) * 0.85
      );

      const dragLag =
        clamp(-rope.angularVel * 26, -34, 34) *
        Math.sin(u * Math.PI * 0.86) *
        env;

      const wavePrimary =
        Math.sin(u * Math.PI * 2.25 - nowSec * 3.4 + rope.phase) *
        (4.5 + swingEnergy * 9.5) *
        env;
      const waveSecondary =
        Math.sin(u * Math.PI * 4.1 + nowSec * 2.3 + rope.phase * 1.6) *
        (1.8 + swingEnergy * 4.0) *
        (u * u);

      let tailWhip = 0;
      if (grabbedDist !== null && dist > grabbedDist) {
        const tailSpan = Math.max(25, rope.length - grabbedDist);
        const tailU = clamp((dist - grabbedDist) / tailSpan, 0, 1);
        tailWhip =
          clamp(-rope.angularVel * 18, -22, 22) * (tailU * tailU) +
          Math.sin(tailU * Math.PI * 1.65 - nowSec * 4.8 + rope.phase) *
            (3.5 + swingEnergy * 6.5) *
            tailU;
      }

      const perpOffset = dragLag + wavePrimary + waveSecondary + tailWhip;

      let rx = rope.pivotX + sinA * dist + cosA * perpOffset;
      let ry = rope.pivotY + 3 + cosA * dist - sinA * perpOffset;

      const margin = 6;
      for (const b of levelBlocks) {
        if (b.ignoreRopeCollision) continue;
        if (
          rope.pivotX + rope.length + 70 < b.x1 ||
          rope.pivotX - rope.length - 70 > b.x2
        ) {
          continue;
        }
        if (
          rx > b.x1 - margin &&
          rx < b.x2 + margin &&
          ry > b.topY - margin &&
          ry < b.bottomY + margin
        ) {
          if (rope.pivotX <= b.x1) {
            rx = Math.min(rx, b.x1 - margin);
          } else if (rope.pivotX >= b.x2) {
            rx = Math.max(rx, b.x2 + margin);
          } else if (rope.pivotY <= b.topY) {
            ry = Math.min(ry, b.topY - margin);
          } else {
            ry = Math.max(ry, b.bottomY + margin);
          }
        }
      }

      return { x: rx, y: ry };
    };

    const doesRopeOrPilgrimCollideWithBlock = (
      rope: SwingingRope,
      grabDist: number | null,
      facing: 1 | -1,
      _nowSec: number
    ): boolean => {
      const sinA = Math.sin(rope.angle);
      const cosA = Math.cos(rope.angle);

      for (const b of levelBlocks) {
        if (b.ignoreRopeCollision) continue;
        if (
          rope.pivotX + rope.length + 90 < b.x1 ||
          rope.pivotX - rope.length - 90 > b.x2
        ) {
          continue;
        }

        for (let s = 1; s <= 7; s++) {
          const d = (s / 7) * rope.length;
          const sx = rope.pivotX + sinA * d;
          const sy = rope.pivotY + 3 + cosA * d;
          if (
            sx > b.x1 - 5 &&
            sx < b.x2 + 5 &&
            sy > b.topY - 4 &&
            sy < b.bottomY + 4
          ) {
            return true;
          }
        }

        if (grabDist !== null) {
          // Use deterministic geometric pendulum coordinates so wave/velocity shifts never trap Christian in a block!
          const handX = rope.pivotX + sinA * grabDist;
          const handY = rope.pivotY + 3 + cosA * grabDist;
          const cx = handX - facing * 18.7;
          const cy = handY + 228.0;
          const cLeft = cx - CHAR_RADIUS_X - 2;
          const cRight = cx + CHAR_RADIUS_X + 2;
          const cTop = cy - STANDING_H + 8;
          const cBottom = cy - 4;
          if (
            cRight > b.x1 &&
            cLeft < b.x2 &&
            cBottom > b.topY &&
            cTop < b.bottomY
          ) {
            return true;
          }
        }
      }
      return false;
    };

    const keysHeld = {
      left: false,
      right: false,
      up: false,
      jump: false,
      crouch: false,
      ropeDown: false,
    };

    // Bluetooth Controller / Web Gamepad API state:
    // - Left Stick Left/Right: move left/right (and swing on rope)
    // - Left Stick Up/Down: climb up / lower down when on a rope
    // - A (buttons[0]): press to jump, hold to mantle
    // - B (buttons[1]): press to toggle crawling on, press again to toggle off and stand up
    // - X (buttons[2]): press to enter doors
    // - Y (buttons[3]): press to pause/unpause (handled in App.tsx)
    const gamepadState = {
      left: false,
      right: false,
      up: false,
      down: false,
      jumpHeld: false,
      crawlToggled: false,
      prevA: true,
      prevB: true,
      prevX: true,
    };

    const shouldRunOpeningDialogue =
      isChapterOne && !skipDialogueOnRestartRef.current;
    skipDialogueOnRestartRef.current = false;

    const state = {
      x: 340,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      cameraX: 0,
      cameraY: 0,
      cameraLeadDir: 1 as 1 | -1, // 1 = Christian on left of screen (580px) looking right; -1 = Christian on right of screen (1340px) looking left
      cameraTurnAnchorX: 340, // Reference X used to detect ~5 steps (350px) of movement in the opposite direction
      cameraScreenOffsetX: 580, // Smoothly interpolated screen X target for Christian (580 when going right, W - 580 = 1340 when going left)
      currentDimension: 0 as 0 | 1 | 2 | 3, // 0 = Main Course, 1..3 = Door Dimensions 1..3
      doorTransition: {
        phase: 'NONE' as 'NONE' | 'WALK_AND_FADE_OUT' | 'FADE_IN',
        activeDoorId: '',
        targetDoorId: '',
        doorX: 0,
        doorY: GROUND_Y,
        targetDimension: 0 as 0 | 1 | 2 | 3,
        spawnX: 340,
        spawnY: GROUND_Y,
        fadeAlpha: 0,
        openBlend: 0,
        exitCooldownDoorId: null as string | null,
      },
      facing: 1 as 1 | -1, // 1 = facing right (default), -1 = facing left
      onGround: true,
      touchingWallDir: 0 as -1 | 0 | 1, // -1 = wall on left, +1 = wall on right while airborne
      wallGripBlend: 0, // 0..1 animation blend for gripping onto a wall
      wallJumpLockTimer: 0, // Momentum lock after kicking off a wall or rope so player boosts cleanly across
      wallPushOffTimer: 0, // Timer for wall push-off extension animation
      wallPushOffDir: 1 as 1 | -1,
      vault: {
        active: false,
        timer: 0,
        duration: 0.36,
        startX: 0,
        startY: 0,
        edgeX: 0,
        targetX: 0,
        targetY: 0,
        dir: 1 as 1 | -1,
      },
      ropeGrab: {
        active: false,
        ropeIndex: -1,
        lastRopeIndex: -1,
        grabDist: 380,
        climbCycle: 0,
        climbAnimBlend: 0,
        cooldown: 0,
      },
      sinking: {
        active: false,
        timer: 0,
        duration: 1.65,
        surfaceY: GROUND_Y + 14,
      },
      scriptedWalk: false, // Preserves walking animation for future dialogues/cutscenes while player A/D always runs
      dead: false,
      completed: false,
      gaitCycle: 0.05, // Normalized 0..1 stride cycle locked to ground distance
      walkArmCycle: 0.05, // Slightly slower arm pendulum cycle used only when walking
      walkBlend: 0, // 0 = idle, 1 = moving
      runBlend: 0, // 0 = walking, 1 = running
      crouchBlend: 0, // 0 = standing, 1 = crouched (holding Shift)
      landingSquash: 0, // 0..1 landing impact compression
      landingSquashVel: 0,
      burdenBounceY: 0,
      burdenBounceVy: 0,
      burdenPitch: 0,
      burdenPitchVel: 0,
      coatSway: 0,
      coatSwayVel: 0,
      hairFlutter: 0,
      breathTimer: 0,
      prevStepIdx: 0,
      accelTilt: 0,
      dialogueBookBlend: shouldRunOpeningDialogue ? 1 : 0, // 1 = crying in opening scene
      endingTalkBlend: 0, // 1 = Christian upright speaking gesture in ending scene
    };

    const isChapterOneStart = shouldRunOpeningDialogue;
    onDialogueModeChangeRef.current?.(isChapterOneStart);

    const dialogueScene = {
      phase: (isChapterOneStart
        ? 'WAITING_FOR_FADE'
        : 'COMPLETE') as DialogueScenePhase,
      fadeWaitTimer: 0,
      zoomBlend: isChapterOneStart ? 1 : 0, // 1 = zoomed-in dialogue camera, 0 = full view
      lineIndex: 0,
      typedChars: 0,
      fadingOutText: false,
      fadeOutTimer: 0,
      talkAnimTimer: 0,
      lastSyncedChars: -1,
      lastSyncedLine: -1,
      lastSyncedVisible: false,
      lastSyncedFade: false,
      evangelist: {
        x: 1120,
        y: GROUND_Y,
        vx: 0,
        facing: -1 as 1 | -1,
        gaitCycle: 0.05,
        walkArmCycle: 0.05,
        walkBlend: 0,
        runBlend: 0,
        talkBlend: 0,
        accelTilt: 0,
        coatSway: 0,
        coatSwayVel: 0,
        hairFlutter: 0,
        prevStepIdx: 0,
        visible: isChapterOneStart,
      },
    };

    const endingScene = {
      phase: 'INACTIVE' as EndingScenePhase,
      zoomBlend: 0,
      cameraX: 48600,
      christianStopX: 49615,
      pliableStopX: 49075,
      obstinateStopX: 48930,
      pursuersSpawned: false,
      christianTurned: false,
      settleTimer: 0,
      lineIndex: 0,
      typedChars: 0,
      fadingOutText: false,
      fadeOutTimer: 0,
      talkAnimTimer: 0,
      pliable: {
        x: 48520,
        y: GROUND_Y,
        vx: 0,
        facing: 1 as 1 | -1,
        gaitCycle: 0.1,
        walkArmCycle: 0.1,
        walkBlend: 0,
        runBlend: 0,
        sitBlend: 0, // 0 = standing/running, 1 = seated on the ground tired after running
        talkBlend: 0,
        accelTilt: 0,
        coatSway: 0,
        coatSwayVel: 0,
        hairFlutter: 0,
        prevStepIdx: 0,
        visible: false,
      },
      obstinate: {
        x: 48280,
        y: GROUND_Y,
        vx: 0,
        facing: 1 as 1 | -1,
        gaitCycle: 0.35,
        walkArmCycle: 0.35,
        walkBlend: 0,
        runBlend: 0,
        tiredLeanBlend: 0, // 0 = standing/running, 1 = leaning down with hands resting on knees
        talkBlend: 0,
        accelTilt: 0,
        coatSway: 0,
        coatSwayVel: 0,
        hairFlutter: 0,
        prevStepIdx: 0,
        visible: false,
      },
    };

    const syncDialogueUIState = () => {
      const isOpeningActive = dialogueScene.phase === 'DIALOGUE_ACTIVE';
      const isEndingActive = endingScene.phase === 'DIALOGUE_ACTIVE';
      const boxVisible = isOpeningActive || isEndingActive;

      const activeDialogueList = isEndingActive
        ? CHAPTER_1_ENDING_DIALOGUE
        : CHAPTER_1_OPENING_DIALOGUE;
      const activeLineIdx = isEndingActive
        ? endingScene.lineIndex
        : dialogueScene.lineIndex;
      const activeTypedChars = isEndingActive
        ? endingScene.typedChars
        : dialogueScene.typedChars;
      const activeFadingOut = isEndingActive
        ? endingScene.fadingOutText
        : dialogueScene.fadingOutText;

      const line = activeDialogueList[activeLineIdx] ?? activeDialogueList[0];
      const charCount = Math.min(
        line.text.length,
        Math.floor(activeTypedChars)
      );
      if (
        boxVisible !== dialogueScene.lastSyncedVisible ||
        activeLineIdx !== dialogueScene.lastSyncedLine ||
        charCount !== dialogueScene.lastSyncedChars ||
        activeFadingOut !== dialogueScene.lastSyncedFade
      ) {
        dialogueScene.lastSyncedVisible = boxVisible;
        dialogueScene.lastSyncedLine = activeLineIdx;
        dialogueScene.lastSyncedChars = charCount;
        dialogueScene.lastSyncedFade = activeFadingOut;
        setDialogueUI({
          visible: boxVisible,
          speaker: line.speaker,
          visibleText: line.text.slice(0, charCount),
          fadingOut: activeFadingOut,
        });
      }
    };

    const handleSkipDialogue = () => {
      if (pausedRef.current) return;

      if (dialogueScene.phase === 'DIALOGUE_ACTIVE') {
        if (dialogueScene.fadingOutText) return;
        soundFX.playPageTurn('next');

        if (dialogueScene.lineIndex < CHAPTER_1_OPENING_DIALOGUE.length - 1) {
          // Disappear/fade current words leaving the speech box, then type the next line
          dialogueScene.fadingOutText = true;
          dialogueScene.fadeOutTimer = 0;
          syncDialogueUIState();
        } else {
          // Final line skipped: whole speech box disappears, Evangelist runs out of view, then screen zooms out
          dialogueScene.phase = 'EVANGELIST_WALK_OUT';
          dialogueScene.evangelist.facing = 1;
          syncDialogueUIState();
        }
        return;
      }

      if (endingScene.phase === 'DIALOGUE_ACTIVE') {
        if (endingScene.fadingOutText) return;
        soundFX.playPageTurn('next');

        if (endingScene.lineIndex < CHAPTER_1_ENDING_DIALOGUE.length - 1) {
          endingScene.fadingOutText = true;
          endingScene.fadeOutTimer = 0;
          syncDialogueUIState();
        } else {
          // Final ending dialogue line finished -> Christian and Pliable walk off right, Obstinate walks back left toward the city!
          endingScene.phase = 'WALK_OFF';
          state.facing = 1;
          endingScene.pliable.facing = 1;
          endingScene.obstinate.facing = -1;
          syncDialogueUIState();
        }
      }
    };

    skipDialogueRef.current = handleSkipDialogue;

    // --- 1. PRE-RENDERED PEN-AND-INK FLOOR & GRASS LAYER ---
    const GROUND_H = H + 95;
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = W;
    groundCanvas.height = GROUND_H;
    const fgGrassCanvas = document.createElement('canvas');
    fgGrassCanvas.width = W;
    fgGrassCanvas.height = H;

    const buildPenAndInkGround = () => {
      const gCtx = groundCanvas.getContext('2d');
      const fgCtx = fgGrassCanvas.getContext('2d');
      if (!gCtx || !fgCtx) return;

      let seed = 133742;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const groundTopOffset = (x: number) =>
        Math.sin(x * 0.012) * 1.8 +
        Math.cos(x * 0.037 + 0.8) * 1.1 +
        Math.sin(x * 0.095) * 0.6;

      const drawTaperedGrassBlade = (
        targetCtx: CanvasRenderingContext2D,
        baseX: number,
        baseY: number,
        height: number,
        leanX: number,
        baseWidth: number,
        color: string
      ) => {
        const tipX = baseX + leanX;
        const tipY = baseY - height;
        const ctrlX = baseX + leanX * 0.36;
        const ctrlY = baseY - height * 0.58;

        targetCtx.fillStyle = color;
        targetCtx.beginPath();
        targetCtx.moveTo(baseX - baseWidth * 0.5, baseY);
        targetCtx.quadraticCurveTo(
          ctrlX - baseWidth * 0.16,
          ctrlY,
          tipX,
          tipY
        );
        targetCtx.quadraticCurveTo(
          ctrlX + baseWidth * 0.2,
          ctrlY + 1.0,
          baseX + baseWidth * 0.5,
          baseY
        );
        targetCtx.closePath();
        targetCtx.fill();
      };

      // Light, uniform pen-and-ink wash across the entire lower grass area so parchment paper shows through naturally
      gCtx.fillStyle = 'rgba(20, 10, 5, 0.14)';
      gCtx.beginPath();
      gCtx.moveTo(0, GROUND_Y + 2);
      for (let x = 0; x <= W; x += 16) {
        gCtx.lineTo(x, GROUND_Y + 2 + groundTopOffset(x));
      }
      gCtx.lineTo(W, GROUND_H);
      gCtx.lineTo(0, GROUND_H);
      gCtx.closePath();
      gCtx.fill();

      // 1. UNIFORM LIGHTER & LESS-DENSE LOWER GRASS FIELD (from right below the top walking layer all the way past GROUND_H)
      // Uses identical spacing, blade thickness, and semi-transparent ink tone on every tier so the lower grass is 100% uniform without being dark or overly dense.
      const grassTiers: number[] = [];
      for (let d = 18; d <= 312; d += 14) {
        grassTiers.push(d);
      }

      for (let tIdx = 0; tIdx < grassTiers.length; tIdx++) {
        const tierDepth = grassTiers[tIdx];

        // Lighter, less-dense grass blades across each tier with uniform thickness and ink opacity
        for (let x = -10; x <= W + 10; x += 4.2 + rand() * 4.5) {
          const waveY =
            groundTopOffset(x * (1 + (tIdx % 5) * 0.08) + tIdx * 75) +
            Math.sin(x * 0.042 + tIdx * 1.7) * 2.2;
          const baseY = GROUND_Y + tierDepth + waveY;

          // Upward-curving grass blade
          const upH = 11 + rand() * 14;
          const upLean = (rand() - 0.48) * (5 + upH * 0.35);
          const bladeW = 1.85 + rand() * 1.15;
          drawTaperedGrassBlade(
            gCtx,
            x,
            baseY,
            upH,
            upLean,
            bladeW,
            'rgba(20, 10, 5, 0.44)'
          );

          // Downward-extending grass blade with matching thickness and color
          if (rand() > 0.32) {
            const downH = -(10 + rand() * 13);
            const downLean = (rand() - 0.5) * 9;
            drawTaperedGrassBlade(
              gCtx,
              x + (rand() - 0.5) * 2.5,
              baseY,
              downH,
              downLean,
              bladeW,
              'rgba(20, 10, 5, 0.40)'
            );
          }
        }

        // Uniform clustered woodcut grass tufts on each tier all the way to the bottom of the screen
        for (
          let clusterX = 10 + (tIdx % 4) * 11;
          clusterX < W;
          clusterX += 28 + rand() * 34
        ) {
          const bladeCount = 3 + Math.floor(rand() * 4);
          const baseY =
            GROUND_Y +
            tierDepth +
            groundTopOffset(clusterX + tIdx * 60) +
            Math.sin(clusterX * 0.05 + tIdx) * 2.2;
          for (let b = 0; b < bladeCount; b++) {
            const t = bladeCount > 1 ? b / (bladeCount - 1) - 0.5 : 0;
            const bx = clusterX + t * 10 + (rand() - 0.5) * 2.2;
            const bh = (13 + rand() * 14) * (1 - Math.abs(t) * 0.25);
            const lean = t * 15 + (rand() - 0.5) * 3.5;
            drawTaperedGrassBlade(
              gCtx,
              bx,
              baseY,
              bh,
              lean,
              2.0 + rand() * 1.1,
              'rgba(18, 9, 4, 0.48)'
            );
          }
        }

        // Subtle hand-inked grassy turf ridge line anchoring each tier uniformly
        if (tIdx % 2 === 0) {
          gCtx.strokeStyle = 'rgba(18, 9, 4, 0.32)';
          gCtx.lineWidth = 1.35;
          let ridgeX = rand() * 20;
          while (ridgeX < W) {
            const segLen = 35 + rand() * 75;
            gCtx.beginPath();
            for (let sx = 0; sx <= segLen && ridgeX + sx <= W; sx += 8) {
              const px = ridgeX + sx;
              const py =
                GROUND_Y +
                tierDepth +
                groundTopOffset(px * (1 + (tIdx % 5) * 0.08) + tIdx * 75) +
                Math.sin(px * 0.042 + tIdx * 1.7) * 2.2;
              if (sx === 0) gCtx.moveTo(px, py);
              else gCtx.lineTo(px, py);
            }
            gCtx.stroke();
            ridgeX += segLen + 14 + rand() * 28;
          }
        }
      }

      // Fine pen-and-ink grass blade hatching strokes uniformly across the lower grass field
      gCtx.strokeStyle = 'rgba(18, 9, 4, 0.30)';
      for (let x = 0; x < W; x += 5.0 + rand() * 5.0) {
        const topY = GROUND_Y + 12 + rand() * (GROUND_H - GROUND_Y - 12);
        const len = 10 + rand() * 14;
        const slant = (rand() - 0.5) * 8;
        gCtx.lineWidth = 1.0 + rand() * 0.5;
        gCtx.beginPath();
        gCtx.moveTo(x, topY);
        gCtx.lineTo(x + slant, topY + len);
        gCtx.stroke();
      }

      // 2. DARKER TOP GRASS LAYER THAT THE CHARACTER WALKS ON (drawn over the top edge so it clearly marks the walking surface)
      for (let x = -6; x <= W + 6; x += 2.4 + rand() * 2.4) {
        const y0 = GROUND_Y + 3.5 + groundTopOffset(x);
        const h = 10 + rand() * 17 + (rand() > 0.75 ? rand() * 11 : 0);
        const lean = (rand() - 0.48) * (5 + h * 0.38);
        const w = 2.2 + rand() * 1.7;
        drawTaperedGrassBlade(
          gCtx,
          x,
          y0,
          h,
          lean,
          w,
          '#060201'
        );

        // Dark overhanging grass blades right along the walking turf lip
        if (rand() > 0.18) {
          const downH = -(9 + rand() * 12);
          const downLean = (rand() - 0.5) * 9;
          drawTaperedGrassBlade(
            gCtx,
            x + (rand() - 0.5) * 2,
            y0 + 1,
            downH,
            downLean,
            2.1 + rand() * 1.3,
            '#060201'
          );
        }
      }

      // Prominent dark clustered woodcut grass tufts on the walking surface
      for (let clusterX = 14; clusterX < W; clusterX += 18 + rand() * 24) {
        const bladeCount = 5 + Math.floor(rand() * 5);
        const baseY = GROUND_Y + 3.8 + groundTopOffset(clusterX);
        for (let b = 0; b < bladeCount; b++) {
          const t = bladeCount > 1 ? b / (bladeCount - 1) - 0.5 : 0;
          const bx = clusterX + t * 10.5 + (rand() - 0.5) * 2.5;
          const bh = (16 + rand() * 16) * (1 - Math.abs(t) * 0.3);
          const lean = t * 18 + (rand() - 0.5) * 4;
          drawTaperedGrassBlade(
            gCtx,
            bx,
            baseY,
            bh,
            lean,
            2.6 + rand() * 1.4,
            '#060201'
          );
        }
      }

      // Primary bold hand-inked ground contour line (dark walking surface)
      gCtx.strokeStyle = '#060201';
      gCtx.lineCap = 'round';
      gCtx.lineJoin = 'round';
      gCtx.lineWidth = 5.0;
      gCtx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const py = GROUND_Y + 2.5 + groundTopOffset(x);
        if (x === 0) gCtx.moveTo(x, py);
        else gCtx.lineTo(x, py);
      }
      gCtx.stroke();

      // Secondary dark root/turf under-contour line for the top walking grass band
      gCtx.strokeStyle = '#060201';
      gCtx.lineWidth = 3.0;
      gCtx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const py =
          GROUND_Y +
          8.5 +
          groundTopOffset(x * 1.1 + 40) +
          Math.sin(x * 0.06) * 1.6;
        if (x === 0) gCtx.moveTo(x, py);
        else gCtx.lineTo(x, py);
      }
      gCtx.stroke();

      // Foreground grass tufts that slightly overlap the bottom of the character's boots
      for (let x = 12; x < W - 12; x += 18 + rand() * 26) {
        const y0 = GROUND_Y + 4.5 + groundTopOffset(x);
        const count = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < count; i++) {
          const bx = x + (i - (count - 1) * 0.5) * 4.5 + (rand() - 0.5) * 1.5;
          const bh = 8 + rand() * 10;
          const lean = (i - (count - 1) * 0.5) * 7 + (rand() - 0.5) * 4;
          drawTaperedGrassBlade(
            fgCtx,
            bx,
            y0,
            bh,
            lean,
            2.0 + rand() * 0.9,
            'rgba(14, 7, 4, 0.88)'
          );
        }
      }
    };

    buildPenAndInkGround();

    // --- 2. BACKGROUND PEN-AND-INK CITY LAYER (LOCKED TO WORLD COORDINATES) ---
    const createCityTileCanvas = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    const cityTiles = [
      createCityTileCanvas(),
      createCityTileCanvas(),
      createCityTileCanvas(),
    ];
    const cityEndCanvas = createCityTileCanvas();

    interface ProcessedHouseAsset {
      inkCanvas: HTMLCanvasElement;
      maskCanvas: HTMLCanvasElement;
      width: number;
      height: number;
      bottomInkY: number;
    }

    const extractHouseInkAndMask = (
      img: HTMLImageElement
    ): ProcessedHouseAsset | null => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return null;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) return null;
      tCtx.drawImage(img, 0, 0);

      const imgData = tCtx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Only strip the tiny 4x4 bottom-right screenshot border corner and 2px bottom-center speck
      // while preserving 100% of the left/right roof eaves, gable peaks, and grass tufts!
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const isCornerArtifact =
            (x >= w - 5 && y >= h - 5) ||
            (y >= h - 2 && x > w * 0.45 && x < w * 0.58);
          if (isCornerArtifact) {
            const p = (y * w + x) * 4;
            data[p] = 255;
            data[p + 1] = 255;
            data[p + 2] = 255;
            data[p + 3] = 0;
          }
        }
      }

      // 1. Identify exterior background pixels via border BFS flood-fill
      const exterior = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let qHead = 0;
      let qTail = 0;

      const isLightPixel = (idx: number) => {
        const p = idx * 4;
        if (data[p + 3] < 40) return true;
        const lum =
          0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        return lum > 175;
      };

      const pushIfExterior = (x: number, y: number) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const idx = y * w + x;
        if (exterior[idx] === 0 && isLightPixel(idx)) {
          exterior[idx] = 1;
          queue[qTail++] = idx;
        }
      };

      for (let x = 0; x < w; x++) {
        for (let b = 0; b < 3; b++) {
          pushIfExterior(x, b);
          pushIfExterior(x, h - 1 - b);
        }
      }
      for (let y = 0; y < h; y++) {
        for (let b = 0; b < 3; b++) {
          pushIfExterior(b, y);
          pushIfExterior(w - 1 - b, y);
        }
      }

      while (qHead < qTail) {
        const curr = queue[qHead++];
        const cx = curr % w;
        const cy = (curr / w) | 0;
        if (cx > 0) pushIfExterior(cx - 1, cy);
        if (cx + 1 < w) pushIfExterior(cx + 1, cy);
        if (cy > 0) pushIfExterior(cx, cy - 1);
        if (cy + 1 < h) pushIfExterior(cx, cy + 1);
      }

      // 2. Build clean pen-and-ink stroke canvas (strips all white background & faint watermarks)
      //    and solid interior mask canvas (so front houses cleanly occlude distant back-row houses)
      const inkCanvas = document.createElement('canvas');
      inkCanvas.width = w;
      inkCanvas.height = h;
      const inkCtx = inkCanvas.getContext('2d');

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskCtx = maskCanvas.getContext('2d');
      if (!inkCtx || !maskCtx) return null;

      const inkImgData = inkCtx.createImageData(w, h);
      const inkOut = inkImgData.data;
      const maskImgData = maskCtx.createImageData(w, h);
      const maskOut = maskImgData.data;

      let bottomInkY = h - 4;

      for (let y = 0; y < h; y++) {
        let rowInkCount = 0;
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const p = idx * 4;
          const lum =
            0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

          if (lum < 192 && data[p + 3] > 40) {
            const normAlpha = clamp((192 - lum) / 138, 0, 1);
            inkOut[p] = 18;
            inkOut[p + 1] = 9;
            inkOut[p + 2] = 4;
            inkOut[p + 3] = Math.round(normAlpha * 255);
            if (lum < 130) rowInkCount++;
          }

          if (exterior[idx] === 0) {
            maskOut[p] = 0;
            maskOut[p + 1] = 0;
            maskOut[p + 2] = 0;
            maskOut[p + 3] = 255;
          }
        }
        if (rowInkCount >= 12) {
          bottomInkY = y;
        }
      }

      inkCtx.putImageData(inkImgData, 0, 0);
      maskCtx.putImageData(maskImgData, 0, 0);

      return { inkCanvas, maskCanvas, width: w, height: h, bottomInkY };
    };

    const houseAssets: {
      h1: ProcessedHouseAsset | null;
      h2: ProcessedHouseAsset | null;
      h3: ProcessedHouseAsset | null;
      h4: ProcessedHouseAsset | null;
    } = {
      h1: null,
      h2: null,
      h3: null,
      h4: null,
    };

    const rebuildCityCanvas = () => {
      const endCtx = cityEndCanvas.getContext('2d');
      if (!endCtx) return;
      endCtx.clearRect(0, 0, W, H);
      for (const tile of cityTiles) {
        const tCtx = tile.getContext('2d');
        tCtx?.clearRect(0, 0, W, H);
      }

      const fallback =
        houseAssets.h1 || houseAssets.h2 || houseAssets.h3 || houseAssets.h4;
      if (!fallback) return;

      const a1 = houseAssets.h1 || fallback; // Steep gable cottage with right chimney (193x235)
      const a2 = houseAssets.h2 || fallback; // Tall 2-story timber-framed house (165x230)
      const a3 = houseAssets.h3 || fallback; // Cottage with side porch awning & bench (261x200)
      const a4 = houseAssets.h4 || fallback; // Wide multi-wing medieval house (298x181)

      const stampHouseMask = (
        targetCtx: CanvasRenderingContext2D,
        asset: ProcessedHouseAsset | null,
        centerX: number,
        groundBaseY: number,
        scale: number,
        flipX: boolean
      ) => {
        if (!asset) return;
        const drawW = asset.width * scale;
        const drawH = asset.height * scale;
        const anchorY = asset.bottomInkY * scale;

        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.rect(0, 0, W, GROUND_Y + 3);
        targetCtx.clip();

        targetCtx.translate(centerX, groundBaseY);
        if (flipX) targetCtx.scale(-1, 1);

        targetCtx.globalCompositeOperation = 'destination-out';
        targetCtx.globalAlpha = 1.0;
        targetCtx.drawImage(
          asset.maskCanvas,
          -drawW * 0.5,
          -anchorY,
          drawW,
          drawH
        );
        targetCtx.restore();
      };

      const stampHouseInk = (
        targetCtx: CanvasRenderingContext2D,
        asset: ProcessedHouseAsset | null,
        centerX: number,
        groundBaseY: number,
        scale: number,
        flipX: boolean,
        inkAlpha: number
      ) => {
        if (!asset) return;
        const drawW = asset.width * scale;
        const drawH = asset.height * scale;
        const anchorY = asset.bottomInkY * scale;

        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.rect(0, 0, W, GROUND_Y + 3);
        targetCtx.clip();

        targetCtx.translate(centerX, groundBaseY);
        if (flipX) targetCtx.scale(-1, 1);

        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.globalAlpha = inkAlpha;
        targetCtx.drawImage(asset.inkCanvas, -drawW * 0.5, -anchorY, drawW, drawH);
        targetCtx.restore();
      };

      // Dense, closely packed medieval city tiles (5 front-row houses + 6 back-row houses per 1920px tile).
      // All house horizontal bounds stay strictly within [6 .. 1914] so no tile boundary ever clips a roof tip,
      // and all front-row masks are stamped BEFORE front-row ink so adjacent houses NEVER cut chunks out of each other!
      const tileLayouts = [
        {
          backRow: [
            { asset: a2, x: 155, y: GROUND_Y - 82, scale: 1.62, flip: false, alpha: 0.44 },
            { asset: a1, x: 430, y: GROUND_Y - 84, scale: 1.62, flip: true, alpha: 0.44 },
            { asset: a3, x: 740, y: GROUND_Y - 78, scale: 1.58, flip: false, alpha: 0.44 },
            { asset: a2, x: 1055, y: GROUND_Y - 86, scale: 1.64, flip: true, alpha: 0.44 },
            { asset: a4, x: 1370, y: GROUND_Y - 76, scale: 1.58, flip: false, alpha: 0.45 },
            { asset: a1, x: 1730, y: GROUND_Y - 82, scale: 1.62, flip: false, alpha: 0.44 },
          ],
          frontRow: [
            { asset: a1, x: 185, y: GROUND_Y + 5, scale: 1.80, flip: false, alpha: 0.86 },
            { asset: a2, x: 520, y: GROUND_Y + 5, scale: 1.84, flip: false, alpha: 0.86 },
            { asset: a3, x: 905, y: GROUND_Y + 5, scale: 1.78, flip: false, alpha: 0.86 },
            { asset: a1, x: 1320, y: GROUND_Y + 5, scale: 1.80, flip: true, alpha: 0.86 },
            { asset: a2, x: 1735, y: GROUND_Y + 5, scale: 1.84, flip: true, alpha: 0.86 },
          ],
        },
        {
          backRow: [
            { asset: a1, x: 175, y: GROUND_Y - 85, scale: 1.62, flip: true, alpha: 0.44 },
            { asset: a4, x: 485, y: GROUND_Y - 76, scale: 1.58, flip: false, alpha: 0.45 },
            { asset: a2, x: 810, y: GROUND_Y - 88, scale: 1.64, flip: false, alpha: 0.44 },
            { asset: a1, x: 1105, y: GROUND_Y - 82, scale: 1.62, flip: false, alpha: 0.44 },
            { asset: a3, x: 1425, y: GROUND_Y - 78, scale: 1.58, flip: true, alpha: 0.44 },
            { asset: a2, x: 1750, y: GROUND_Y - 86, scale: 1.62, flip: true, alpha: 0.44 },
          ],
          frontRow: [
            { asset: a2, x: 170, y: GROUND_Y + 5, scale: 1.84, flip: true, alpha: 0.86 },
            { asset: a4, x: 585, y: GROUND_Y + 5, scale: 1.76, flip: true, alpha: 0.86 },
            { asset: a1, x: 1025, y: GROUND_Y + 5, scale: 1.80, flip: false, alpha: 0.86 },
            { asset: a2, x: 1365, y: GROUND_Y + 5, scale: 1.84, flip: false, alpha: 0.86 },
            { asset: a1, x: 1730, y: GROUND_Y + 5, scale: 1.80, flip: true, alpha: 0.86 },
          ],
        },
        {
          backRow: [
            { asset: a2, x: 160, y: GROUND_Y - 86, scale: 1.64, flip: false, alpha: 0.44 },
            { asset: a3, x: 470, y: GROUND_Y - 78, scale: 1.58, flip: true, alpha: 0.45 },
            { asset: a1, x: 785, y: GROUND_Y - 84, scale: 1.62, flip: false, alpha: 0.44 },
            { asset: a4, x: 1120, y: GROUND_Y - 76, scale: 1.58, flip: true, alpha: 0.44 },
            { asset: a2, x: 1450, y: GROUND_Y - 84, scale: 1.62, flip: false, alpha: 0.45 },
            { asset: a1, x: 1735, y: GROUND_Y - 80, scale: 1.62, flip: true, alpha: 0.44 },
          ],
          frontRow: [
            { asset: a1, x: 185, y: GROUND_Y + 5, scale: 1.80, flip: false, alpha: 0.86 },
            { asset: a3, x: 595, y: GROUND_Y + 5, scale: 1.78, flip: true, alpha: 0.86 },
            { asset: a2, x: 990, y: GROUND_Y + 5, scale: 1.84, flip: false, alpha: 0.86 },
            { asset: a4, x: 1405, y: GROUND_Y + 5, scale: 1.76, flip: false, alpha: 0.86 },
            { asset: a2, x: 1755, y: GROUND_Y + 5, scale: 1.80, flip: true, alpha: 0.86 },
          ],
        },
      ];

      for (let t = 0; t < cityTiles.length; t++) {
        const tCtx = cityTiles[t].getContext('2d');
        if (!tCtx) continue;
        const layout = tileLayouts[t];
        // 1. Draw all back-row ink (no destination-out between back-row houses so they never cut each other out)
        for (const item of layout.backRow) {
          stampHouseInk(
            tCtx,
            item.asset,
            item.x,
            item.y,
            item.scale,
            item.flip,
            item.alpha
          );
        }
        // 2. Stamp all front-row destination-out masks FIRST so front-row houses cleanly occlude the back row
        //    without ever erasing any part of an adjacent front-row house!
        for (const item of layout.frontRow) {
          stampHouseMask(
            tCtx,
            item.asset,
            item.x,
            item.y,
            item.scale,
            item.flip
          );
        }
        // 3. Stamp all front-row ink strokes over the cleared foreground silhouettes
        for (const item of layout.frontRow) {
          stampHouseInk(
            tCtx,
            item.asset,
            item.x,
            item.y,
            item.scale,
            item.flip,
            item.alpha
          );
        }
      }

      // Final tile at tx = 48000 (where the last obstacle ends at x = 48456):
      const endBackRow = [
        { asset: a2, x: 165, y: GROUND_Y - 84, scale: 1.62, flip: false, alpha: 0.44 },
        { asset: a1, x: 465, y: GROUND_Y - 82, scale: 1.62, flip: true, alpha: 0.44 },
        { asset: a2, x: 750, y: GROUND_Y - 84, scale: 1.62, flip: false, alpha: 0.44 },
      ];
      for (const item of endBackRow) {
        stampHouseInk(
          endCtx,
          item.asset,
          item.x,
          item.y,
          item.scale,
          item.flip,
          item.alpha
        );
      }

      const endFrontRow = [
        { asset: a1, x: 185, y: GROUND_Y + 5, scale: 1.80, flip: false, alpha: 0.86 },
        { asset: a2, x: 485, y: GROUND_Y + 5, scale: 1.82, flip: true, alpha: 0.86 },
        { asset: a1, x: 785, y: GROUND_Y + 5, scale: 1.80, flip: false, alpha: 0.86 },
      ];
      for (const item of endFrontRow) {
        stampHouseMask(
          endCtx,
          item.asset,
          item.x,
          item.y,
          item.scale,
          item.flip
        );
      }
      for (const item of endFrontRow) {
        stampHouseInk(
          endCtx,
          item.asset,
          item.x,
          item.y,
          item.scale,
          item.flip,
          item.alpha
        );
      }
    };

    const houseImg1 = new Image();
    houseImg1.src = '/assets/aistudio/Screenshot_2026-11-05_205421_5e368439.png';
    houseImg1.onload = () => {
      houseAssets.h1 = extractHouseInkAndMask(houseImg1);
      rebuildCityCanvas();
    };

    const houseImg2 = new Image();
    houseImg2.src = '/assets/aistudio/Screenshot_2026-11-05_205433_2ca92492.png';
    houseImg2.onload = () => {
      houseAssets.h2 = extractHouseInkAndMask(houseImg2);
      rebuildCityCanvas();
    };

    const houseImg3 = new Image();
    houseImg3.src = '/assets/aistudio/Screenshot_2026-11-05_205443_7e89d216.png';
    houseImg3.onload = () => {
      houseAssets.h3 = extractHouseInkAndMask(houseImg3);
      rebuildCityCanvas();
    };

    const houseImg4 = new Image();
    houseImg4.src = '/assets/aistudio/Screenshot_2026-11-05_205359_c81f1cdc.png';
    houseImg4.onload = () => {
      houseAssets.h4 = extractHouseInkAndMask(houseImg4);
      rebuildCityCanvas();
    };

    const dustPuffs: DustPuff[] = [];

    const spawnFootstepInkPuff = (
      footX: number,
      footY: number,
      count: number,
      speedScale: number
    ) => {
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI * (0.1 + Math.random() * 0.8);
        const speed = (36 + Math.random() * 85) * speedScale;
        dustPuffs.push({
          x: footX + (Math.random() - 0.5) * 16,
          y: footY - 2,
          vx: Math.cos(angle) * speed - state.facing * 40 * speedScale,
          vy: Math.sin(angle) * speed * 0.65,
          r: (2.0 + Math.random() * 3.8 * speedScale) * CHAR_SCALE,
          alpha: 0.6 + Math.random() * 0.28,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.2,
        });
      }
    };

    // Shared helper to enter a nearby door (triggered by Keyboard Shift or Controller X button)
    const tryEnterNearbyDoor = (): boolean => {
      if (
        !isChapterOne ||
        state.doorTransition.phase !== 'NONE' ||
        !state.onGround ||
        state.ropeGrab.active ||
        state.vault.active
      ) {
        return false;
      }
      for (const door of courseDoors) {
        if (door.dimension !== state.currentDimension) continue;
        if (
          Math.abs(state.x - door.x) <= 98 &&
          Math.abs(state.y - door.y) <= 28
        ) {
          keysHeld.crouch = false;
          gamepadState.crawlToggled = false;
          state.doorTransition.phase = 'WALK_AND_FADE_OUT';
          state.doorTransition.activeDoorId = door.id;
          state.doorTransition.targetDoorId = door.targetDoorId;
          state.doorTransition.doorX = door.x;
          state.doorTransition.doorY = door.y;
          state.doorTransition.targetDimension = door.targetDimension;
          state.doorTransition.spawnX = door.spawnX;
          state.doorTransition.spawnY = door.spawnY;
          state.doorTransition.fadeAlpha = 0;
          state.doorTransition.openBlend = 0;
          soundFX.playPageTurn('next');
          return true;
        }
      }
      return false;
    };

    // Shared helper to perform Jump / Rope Launch / Wall Jump (triggered by Keyboard Space or Controller A button)
    const triggerJumpAction = () => {
      if (state.vault.active) return;

      const moveLeft = keysHeld.left || gamepadState.left;
      const moveRight = keysHeld.right || gamepadState.right;

      // 1. If currently hanging on a Swinging Rope, pressing Space / A launches Christian off the rope!
      if (state.ropeGrab.active && isChapterOne) {
        const rope = swingingRopes[state.ropeGrab.ropeIndex];
        let launchDir: 1 | -1 = state.facing;
        if (moveLeft && !moveRight) launchDir = -1;
        else if (moveRight && !moveLeft) launchDir = 1;
        else if (rope && Math.abs(rope.angularVel) > 0.12) {
          launchDir = rope.angularVel >= 0 ? 1 : -1;
        }

        const minGrabDist = 12;
        const heightRatio = rope
          ? clamp(
              (state.ropeGrab.grabDist - minGrabDist) /
                Math.max(1, rope.length - minGrabDist),
              0,
              1
            )
          : 0.8;
        // Higher on the rope has slightly less swinging momentum than lower toward the bottom of the rope
        const heightMomentumScale = lerp(0.8, 1.08, heightRatio);

        state.ropeGrab.active = false;
        state.ropeGrab.cooldown = 0.34;
        state.onGround = false;
        state.vy = -1090 * lerp(0.96, 1.03, heightRatio);
        // Launch distance scales meaningfully with the swing momentum built up!
        const swingSpeedAbs = rope ? Math.abs(rope.angularVel) : 0;
        const momentumFactor = clamp(swingSpeedAbs / 1.35, 0, 1.35);
        const baseHopVx =
          lerp(430, 680, Math.min(1, momentumFactor)) * heightMomentumScale;
        const swingBoost = rope
          ? rope.angularVel * 320 * heightMomentumScale
          : 0;
        state.vx = launchDir * baseHopVx + swingBoost;
        state.facing = launchDir;
        state.wallJumpLockTimer = 0.24;
        state.wallPushOffTimer = 0.22;
        state.wallPushOffDir = launchDir;
        state.landingSquash = 0;
        state.burdenBounceVy += 155;
        state.burdenPitchVel -= 2.0;
        spawnFootstepInkPuff(state.x, state.y - 95, 13, 1.45);
        return;
      }

      // Check if any part of Christian's body (head, back, or burden) is still inside a low crawl-under tunnel
      const insideCrawlTunnel = isInsideCrawlTunnel(
        state.x,
        state.y,
        state.crouchBlend
      );
      const isCrouchActive = keysHeld.crouch || gamepadState.crawlToggled;

      if (
        state.onGround &&
        !isCrouchActive &&
        !insideCrawlTunnel &&
        state.crouchBlend < 0.25
      ) {
        // Normal ground/platform jump
        state.vy = -1120;
        state.onGround = false;
        state.landingSquash = 0;
        state.landingSquashVel = 0;
        state.burdenBounceVy += 150;
        state.burdenPitchVel -= 2.0;
        spawnFootstepInkPuff(state.x, state.y, 10, 1.45);
      } else if (!state.onGround && isChapterOne) {
        // Check for Wall Jump when pressing Space / A in the air near any wall-jumpable block face!
        let wallDir: -1 | 0 | 1 = state.touchingWallDir;
        if (wallDir === 0) {
          const WALL_DETECT_DIST = 58;
          for (const b of levelBlocks) {
            if (
              b.canWallJumpRight &&
              state.y - 20 > b.topY &&
              state.y - 160 < b.bottomY &&
              Math.abs(state.x - CHAR_RADIUS_X - b.x2) <= WALL_DETECT_DIST
            ) {
              wallDir = -1; // Wall is to Christian's left
              break;
            }
            if (
              b.canWallJumpLeft &&
              state.y - 16 > b.topY &&
              state.y - 160 < b.bottomY &&
              Math.abs(state.x + CHAR_RADIUS_X - b.x1) <= WALL_DETECT_DIST
            ) {
              wallDir = 1; // Wall is to Christian's right
              break;
            }
          }
        }

        if (wallDir !== 0) {
          const kickDir = (-wallDir) as 1 | -1;
          // Strong horizontal & vertical boost so Christian reliably reaches the opposite wall!
          state.vy = -1135;
          state.vx = kickDir * 810;
          state.facing = kickDir;
          state.wallJumpLockTimer = 0.34;
          state.wallPushOffTimer = 0.26;
          state.wallPushOffDir = kickDir;
          state.wallGripBlend = 0;
          state.touchingWallDir = 0;
          state.landingSquash = 0;
          state.burdenBounceVy += 155;
          state.burdenPitchVel -= 2.1;
          spawnFootstepInkPuff(
            state.x + wallDir * 20,
            state.y - 55,
            13,
            1.45
          );
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      // Always prevent default on Space/Arrows during active gameplay (even on key repeat!)
      // and blur any focused button so holding Space to jump/mantle NEVER clicks a hidden DOM button!
      if (
        !pausedRef.current &&
        !state.dead &&
        !state.completed &&
        (code === 'Space' ||
          key === ' ' ||
          code === 'Enter' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight' ||
          code === 'ArrowUp' ||
          code === 'ArrowDown')
      ) {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }

      if (pausedRef.current || state.dead || state.sinking.active || state.completed) return;
      // Player cannot control Christian during the opening or ending dialogue scenes
      if (dialogueScene.phase !== 'COMPLETE' || endingScene.phase !== 'INACTIVE') return;

      if (code === 'ShiftLeft' || code === 'ShiftRight' || e.key === 'Shift') {
        if (!e.repeat && tryEnterNearbyDoor()) {
          return;
        }
        keysHeld.ropeDown = true;
        if (state.doorTransition.phase === 'NONE') {
          keysHeld.crouch = true;
        }
        return;
      }

      if (
        code === 'KeyS' ||
        key === 's' ||
        code === 'ArrowDown' ||
        code === 'KeyB' ||
        key === 'b'
      ) {
        if (state.doorTransition.phase === 'NONE') {
          keysHeld.crouch = true;
        }
        return;
      }

      if (e.repeat) return;

      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') {
        keysHeld.left = true;
      } else if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') {
        keysHeld.right = true;
      } else if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') {
        keysHeld.up = true;
      } else if (code === 'Space' || key === ' ') {
        keysHeld.jump = true;
        triggerJumpAction();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (
        !pausedRef.current &&
        !state.dead &&
        !state.completed &&
        (code === 'Space' || key === ' ' || code === 'Enter')
      ) {
        e.preventDefault();
      }

      if (code === 'ShiftLeft' || code === 'ShiftRight' || e.key === 'Shift') {
        keysHeld.ropeDown = false;
        keysHeld.crouch = false;
        return;
      }

      if (
        code === 'KeyS' ||
        key === 's' ||
        code === 'ArrowDown' ||
        code === 'KeyB' ||
        key === 'b'
      ) {
        keysHeld.crouch = false;
        return;
      }

      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') {
        keysHeld.left = false;
      } else if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') {
        keysHeld.right = false;
      } else if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') {
        keysHeld.up = false;
      } else if (code === 'Space' || key === ' ') {
        keysHeld.jump = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let frameId: number;
    let lastTime = performance.now();

    /**
     * Draws a seamless, continuous anatomical leg & articulated boot mesh
     * using exact IK joint positions and tangent-smoothed skinning normals.
     */
    const drawAnatomicalLeg = (
      joints: LimbJoints,
      footPitch: number,
      toeBend: number,
      inkColor: string
    ) => {
      const { hipX, hipY, kneeX, kneeY, ankleX, ankleY, thighAngle, shinAngle } =
        joints;

      const tDirX = Math.sin(thighAngle);
      const tDirY = Math.cos(thighAngle);
      const tNormX = Math.cos(thighAngle);
      const tNormY = -Math.sin(thighAngle);

      const sDirX = Math.sin(shinAngle);
      const sDirY = Math.cos(shinAngle);
      const sNormX = Math.cos(shinAngle);
      const sNormY = -Math.sin(shinAngle);

      let kNormX = tNormX + sNormX;
      let kNormY = tNormY + sNormY;
      const kLen = Math.hypot(kNormX, kNormY) || 1;
      kNormX /= kLen;
      kNormY /= kLen;

      const kneeFlex = clamp(thighAngle - shinAngle, 0, 2.2);

      ctx.fillStyle = inkColor;
      ctx.strokeStyle = inkColor;

      const tLen = Math.hypot(kneeX - hipX, kneeY - hipY) || 54;
      const sLen = Math.hypot(ankleX - kneeX, ankleY - kneeY) || 53;
      const tS = tLen / 54;
      const sS = sLen / 53;

      // --- 1. CONTINUOUS ANATOMICAL THIGH, KNEE & CALF/SHIN SILHOUETTE ---
      ctx.beginPath();

      const hipBackX = hipX - tNormX * 15.0 - tDirX * 6;
      const hipBackY = hipY - tNormY * 15.0 - tDirY * 6;

      const hipFrontX = hipX + tNormX * 14.0 - tDirX * 6;
      const hipFrontY = hipY + tNormY * 14.0 - tDirY * 6;

      const midThighFrontX = hipX + tDirX * (20 * tS) + tNormX * 15.8;
      const midThighFrontY = hipY + tDirY * (20 * tS) + tNormY * 15.8;

      // 3 crisp trouser fabric gathers above the knee
      const fold1X = hipX + tDirX * (33 * tS) + tNormX * 14.8;
      const fold1Y = hipY + tDirY * (33 * tS) + tNormY * 14.8;
      const fold1InX = hipX + tDirX * (37 * tS) + tNormX * 12.6;
      const fold1InY = hipY + tDirY * (37 * tS) + tNormY * 12.6;
      const fold2X = hipX + tDirX * (42 * tS) + tNormX * 14.6;
      const fold2Y = hipY + tDirY * (42 * tS) + tNormY * 14.6;
      const fold2InX = hipX + tDirX * (46 * tS) + tNormX * 12.2;
      const fold2InY = hipY + tDirY * (46 * tS) + tNormY * 12.2;

      // Sculpted Knee Cap (Patella) curve using bisector normal
      const patellaTopX = kneeX - tDirX * 2 + tNormX * 13.0;
      const patellaTopY = kneeY - tDirY * 2 + tNormY * 13.0;
      const patellaApexX = kneeX + kNormX * 12.8 + sDirX * 2;
      const patellaApexY = kneeY + kNormY * 12.8 + sDirY * 2;
      const belowKneeCuffX = kneeX + sDirX * (9 * sS) + sNormX * 10.8;
      const belowKneeCuffY = kneeY + sDirY * (9 * sS) + sNormY * 10.8;

      // Front shin profile with wrapped gaiter / boot-top ridges
      const shinMidX = kneeX + sDirX * (25 * sS) + sNormX * 9.5;
      const shinMidY = kneeY + sDirY * (25 * sS) + sNormY * 9.5;
      const gaiterRidgeX = kneeX + sDirX * (33 * sS) + sNormX * 10.4;
      const gaiterRidgeY = kneeY + sDirY * (33 * sS) + sNormY * 10.4;
      const ankleFrontX = ankleX + sNormX * 8.0;
      const ankleFrontY = ankleY + sNormY * 8.0;

      // Back ankle (Achilles tendon)
      const ankleBackX = ankleX - sNormX * 8.0;
      const ankleBackY = ankleY - sNormY * 8.0;

      // Gastrocnemius calf muscle belly
      const calfLowX = kneeX + sDirX * (35 * sS) - sNormX * 9.2;
      const calfLowY = kneeY + sDirY * (35 * sS) - sNormY * 9.2;
      const calfBellyX = kneeX + sDirX * (18 * sS) - sNormX * 14.2;
      const calfBellyY = kneeY + sDirY * (18 * sS) - sNormY * 14.2;

      // Back of knee (Popliteal crease)
      const pinchOffset = 10.2 - kneeFlex * 2.1;
      const kneeBackX = kneeX - kNormX * pinchOffset;
      const kneeBackY = kneeY - kNormY * pinchOffset;

      // Hamstring & trouser back gather
      const hamstringLowX = hipX + tDirX * (38 * tS) - tNormX * 13.4;
      const hamstringLowY = hipY + tDirY * (38 * tS) - tNormY * 13.4;
      const hamstringMidX = hipX + tDirX * (20 * tS) - tNormX * 15.5;
      const hamstringMidY = hipY + tDirY * (20 * tS) - tNormY * 15.5;

      ctx.moveTo(hipFrontX, hipFrontY);
      ctx.quadraticCurveTo(midThighFrontX, midThighFrontY, fold1X, fold1Y);
      ctx.lineTo(fold1InX, fold1InY);
      ctx.lineTo(fold2X, fold2Y);
      ctx.lineTo(fold2InX, fold2InY);
      ctx.quadraticCurveTo(patellaTopX, patellaTopY, patellaApexX, patellaApexY);
      ctx.quadraticCurveTo(
        kneeX + sDirX * (5 * sS) + sNormX * 12.0,
        kneeY + sDirY * (5 * sS) + sNormY * 12.0,
        belowKneeCuffX,
        belowKneeCuffY
      );
      ctx.quadraticCurveTo(shinMidX, shinMidY, gaiterRidgeX, gaiterRidgeY);
      ctx.lineTo(ankleFrontX, ankleFrontY);
      ctx.lineTo(ankleBackX, ankleBackY);
      ctx.quadraticCurveTo(calfLowX, calfLowY, calfBellyX, calfBellyY);
      ctx.quadraticCurveTo(
        kneeX + sDirX * (5 * sS) - sNormX * 11.6,
        kneeY + sDirY * (5 * sS) - sNormY * 11.6,
        kneeBackX,
        kneeBackY
      );
      ctx.quadraticCurveTo(hamstringLowX, hamstringLowY, hamstringMidX, hamstringMidY);
      ctx.quadraticCurveTo(
        hipX + tDirX * (8 * tS) - tNormX * 15.8,
        hipY + tDirY * (8 * tS) - tNormY * 15.8,
        hipBackX,
        hipBackY
      );
      ctx.closePath();
      ctx.fill();

      // --- 2. ARTICULATED HEAVY TRAVELER BOOT (WITH METATARSAL TOE ROLL) ---
      ctx.save();
      ctx.translate(ankleX, ankleY);
      ctx.rotate(-footPitch);

      // Part A: Boot Cuff, Heel Counter, Heel Block & Midfoot Arch
      ctx.beginPath();
      ctx.moveTo(-9.8, -13.5);
      ctx.bezierCurveTo(-11.2, -5.5, -13.8, 2.0, -13.2, 11.2);
      ctx.lineTo(-2.0, 11.5);
      ctx.quadraticCurveTo(3.0, 8.2, 8.0, 11.4);
      ctx.lineTo(13.5, 11.4);
      ctx.lineTo(14.5, -3.5);
      ctx.bezierCurveTo(11.8, -5.8, 10.2, -8.8, 8.8, -11.8);
      ctx.lineTo(15.0, -16.0);
      ctx.quadraticCurveTo(10.5, -15.8, 7.2, -13.2);
      ctx.lineTo(-9.8, -13.5);
      ctx.closePath();
      ctx.fill();

      // Part B: Articulated Forefoot & Upturned Traveler Toe Box
      ctx.save();
      ctx.translate(12.0, 5.5);
      ctx.rotate(-toeBend);
      ctx.beginPath();
      ctx.moveTo(-5.0, -8.8);
      ctx.bezierCurveTo(4.0, -8.4, 12.5, -7.2, 18.5, -4.6);
      ctx.bezierCurveTo(23.0, -1.5, 22.0, 4.2, 16.5, 5.6);
      ctx.bezierCurveTo(10.5, 6.2, 2.5, 6.0, -5.0, 5.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.restore();
    };

    /**
     * Draws a fuller, properly proportioned sleeve, elbow (olecranon & cubital fold),
     * forearm, cuff rim, and articulated hand (dorsal metacarpals, curved fingers & natural thumb).
     */
    const drawAnatomicalArm = (
      shoulderX: number,
      shoulderY: number,
      upperAngle: number,
      elbowBend: number,
      wristPitch: number,
      fistBlend: number,
      inkColor: string,
      reachScale = 1.0
    ) => {
      const upperLen = 44 * reachScale;
      const foreLen = 40 * reachScale;

      const elbowX = shoulderX + Math.sin(upperAngle) * upperLen;
      const elbowY = shoulderY + Math.cos(upperAngle) * upperLen;

      const foreAngle = upperAngle + elbowBend;
      const wristX = elbowX + Math.sin(foreAngle) * foreLen;
      const wristY = elbowY + Math.cos(foreAngle) * foreLen;

      const uDirX = Math.sin(upperAngle);
      const uDirY = Math.cos(upperAngle);
      const uNormX = Math.cos(upperAngle);
      const uNormY = -Math.sin(upperAngle);

      const fDirX = Math.sin(foreAngle);
      const fDirY = Math.cos(foreAngle);
      const fNormX = Math.cos(foreAngle);
      const fNormY = -Math.sin(foreAngle);

      let eNormX = uNormX + fNormX;
      let eNormY = uNormY + fNormY;
      const eLen = Math.hypot(eNormX, eNormY) || 1;
      eNormX /= eLen;
      eNormY /= eLen;

      const flex = clamp(elbowBend, 0, 1.85);

      ctx.fillStyle = inkColor;

      // --- 1. CONTINUOUS DELTOID, THICKER SLEEVE, DEFINED ELBOW, FOREARM & WRIST ---
      ctx.beginPath();

      // Top-back of deltoid shoulder cap
      const shBackX = shoulderX - uNormX * 12.8 - uDirX * 5.0;
      const shBackY = shoulderY - uNormY * 12.8 - uDirY * 5.0;

      // Top-front of deltoid shoulder cap
      const shFrontX = shoulderX + uNormX * 12.8 - uDirX * 5.0;
      const shFrontY = shoulderY + uNormY * 12.8 - uDirY * 5.0;

      // Front bicep sleeve contour (thicker upper arm)
      const bicepMidX = shoulderX + uDirX * (19 * reachScale) + uNormX * 12.6;
      const bicepMidY = shoulderY + uDirY * (19 * reachScale) + uNormY * 12.6;

      // Sleeve gather just above the inner elbow crease
      const creaseUpX =
        shoulderX + uDirX * (35 * reachScale) + uNormX * (11.6 + flex * 0.6);
      const creaseUpY =
        shoulderY + uDirY * (35 * reachScale) + uNormY * (11.6 + flex * 0.6);

      // Inner elbow crease (cubital fossa) forms a crisp natural bend angle
      const innerRadius = 10.6 - flex * 1.2;
      const elbowInX = elbowX + eNormX * innerRadius;
      const elbowInY = elbowY + eNormY * innerRadius;

      // Upper forearm brachioradialis muscle & sleeve swell just below inner elbow
      const foreFrontSwellX = elbowX + fDirX * (13 * reachScale) + fNormX * 11.8;
      const foreFrontSwellY = elbowY + fDirY * (13 * reachScale) + fNormY * 11.8;

      // Mid-forearm taper toward wrist
      const foreFrontTapX = elbowX + fDirX * (28 * reachScale) + fNormX * 9.4;
      const foreFrontTapY = elbowY + fDirY * (28 * reachScale) + fNormY * 9.4;

      // Smooth forearm taper into thicker wrist
      const wristFrontX = wristX + fNormX * 7.5;
      const wristFrontY = wristY + fNormY * 7.5;
      const wristBackX = wristX - fNormX * 7.5;
      const wristBackY = wristY - fNormY * 7.5;

      // Posterior forearm ulna/extensor contour swelling up to the elbow
      const foreBackMidX = elbowX + fDirX * (18 * reachScale) - fNormX * 11.2;
      const foreBackMidY = elbowY + fDirY * (18 * reachScale) - fNormY * 11.2;
      const elbowBackLowX = elbowX + fDirX * (6 * reachScale) - fNormX * 11.8;
      const elbowBackLowY = elbowY + fDirY * (6 * reachScale) - fNormY * 11.8;

      // Sculpted Bony Elbow Tip (Olecranon)
      const olecranonRadius = 12.2 + flex * 2.4;
      const olecranonX =
        elbowX - eNormX * olecranonRadius + uDirX * (1.4 * flex);
      const olecranonY =
        elbowY - eNormY * olecranonRadius + uDirY * (1.4 * flex);

      const elbowBackHighX = elbowX - uDirX * (6 * reachScale) - uNormX * 12.2;
      const elbowBackHighY = elbowY - uDirY * (6 * reachScale) - uNormY * 12.2;

      // Tricep back sleeve contour up to rear deltoid
      const tricepMidX = shoulderX + uDirX * (20 * reachScale) - uNormX * 12.8;
      const tricepMidY = shoulderY + uDirY * (20 * reachScale) - uNormY * 12.8;

      ctx.moveTo(shBackX, shBackY);
      ctx.quadraticCurveTo(
        shoulderX - uDirX * 11.5,
        shoulderY - uDirY * 11.5,
        shFrontX,
        shFrontY
      );
      ctx.quadraticCurveTo(bicepMidX, bicepMidY, creaseUpX, creaseUpY);
      ctx.lineTo(elbowInX, elbowInY);
      ctx.quadraticCurveTo(
        foreFrontSwellX,
        foreFrontSwellY,
        foreFrontTapX,
        foreFrontTapY
      );
      ctx.lineTo(wristFrontX, wristFrontY);
      ctx.lineTo(wristBackX, wristBackY);
      ctx.quadraticCurveTo(
        foreBackMidX,
        foreBackMidY,
        elbowBackLowX,
        elbowBackLowY
      );
      ctx.quadraticCurveTo(
        olecranonX,
        olecranonY,
        elbowBackHighX,
        elbowBackHighY
      );
      ctx.quadraticCurveTo(tricepMidX, tricepMidY, shBackX, shBackY);
      ctx.closePath();
      ctx.fill();

      // --- 2. SMOOTH, ROUNDED HAND SILHOUETTE PROPORTIONED TO THICKER ARM ---
      ctx.save();
      ctx.translate(wristX, wristY);
      ctx.rotate(-(foreAngle + wristPitch));

      const fb = clamp(fistBlend, 0, 1);
      const handLen = lerp(17.2, 15.0, fb);

      ctx.beginPath();
      // Start inside dorsal wrist
      ctx.moveTo(-7.2, -2.2);
      // Smoothly rounded dorsal hand & outer curved fingers
      ctx.bezierCurveTo(
        -8.6,
        4.8,
        -8.4,
        handLen * 0.78,
        -2.5,
        handLen
      );
      // Softly rounded bottom of curled fingers & palm
      ctx.bezierCurveTo(
        2.8,
        handLen + 1.4,
        8.4,
        handLen * 0.75,
        8.0,
        handLen * 0.38
      );
      // Smoothly rounded thumb & inner wrist curve back to forearm
      ctx.bezierCurveTo(7.8, 2.6, 7.2, -0.5, 6.8, -2.2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawPilgrimCharacter = () => {
      const INK_COLOR = '#0D0603';
      const BACK_LIMB_INK = '#130905';

      const wBlend = state.walkBlend;
      const rBlend = state.runBlend;
      const cBlend = state.crouchBlend;
      const cycle = state.gaitCycle;

      // 1. Compute Walk & Run IK foot targets for Right (front) and Left (back, +0.5 phase offset)
      const walkRightFoot = computeWalkFootTarget(cycle);
      const walkLeftFoot = computeWalkFootTarget(cycle + 0.5);

      const runRightFoot = computeRunFootTarget(cycle);
      const runLeftFoot = computeRunFootTarget(cycle + 0.5);

      const movingRightFoot: LegIKTarget = {
        ankleX: lerp(walkRightFoot.ankleX, runRightFoot.ankleX, rBlend),
        ankleY: lerp(walkRightFoot.ankleY, runRightFoot.ankleY, rBlend),
        footPitch: lerp(walkRightFoot.footPitch, runRightFoot.footPitch, rBlend),
        toeBend: lerp(walkRightFoot.toeBend, runRightFoot.toeBend, rBlend),
      };

      const movingLeftFoot: LegIKTarget = {
        ankleX: lerp(walkLeftFoot.ankleX, runLeftFoot.ankleX, rBlend),
        ankleY: lerp(walkLeftFoot.ankleY, runLeftFoot.ankleY, rBlend),
        footPitch: lerp(walkLeftFoot.footPitch, runLeftFoot.footPitch, rBlend),
        toeBend: lerp(walkLeftFoot.toeBend, runLeftFoot.toeBend, rBlend),
      };

      // Grounded natural split stance in standing idle
      const idleRightFoot: LegIKTarget = {
        ankleX: 10,
        ankleY: -11.5,
        footPitch: 0.0,
        toeBend: 0.0,
      };
      const idleLeftFoot: LegIKTarget = {
        ankleX: -24,
        ankleY: -11.5,
        footPitch: -0.05,
        toeBend: 0.05,
      };

      let rightFoot: LegIKTarget = {
        ankleX: lerp(idleRightFoot.ankleX, movingRightFoot.ankleX, wBlend),
        ankleY: lerp(idleRightFoot.ankleY, movingRightFoot.ankleY, wBlend),
        footPitch: lerp(idleRightFoot.footPitch, movingRightFoot.footPitch, wBlend),
        toeBend: lerp(idleRightFoot.toeBend, movingRightFoot.toeBend, wBlend),
      };

      let leftFoot: LegIKTarget = {
        ankleX: lerp(idleLeftFoot.ankleX, movingLeftFoot.ankleX, wBlend),
        ankleY: lerp(idleLeftFoot.ankleY, movingLeftFoot.ankleY, wBlend),
        footPitch: lerp(idleLeftFoot.footPitch, movingLeftFoot.footPitch, wBlend),
        toeBend: lerp(idleLeftFoot.toeBend, movingLeftFoot.toeBend, wBlend),
      };

      // 2. Posture: Tall & Upright when standing/walking; Prone Belly Army-Crawl when holding Shift (cBlend)
      const stepPhase = (cycle * 2) % 1;
      const walkPelvisBob = Math.cos((stepPhase - 0.02) * Math.PI * 2) * 1.8 - 0.6;
      const runPelvisBob = Math.sin((stepPhase - 0.04) * Math.PI * 2) * 4.5;
      const crawlPelvisBob = Math.sin(stepPhase * Math.PI * 2) * 1.4 * wBlend;

      const idleBreathBob = Math.sin(state.breathTimer * 2.2) * 0.8;
      const standingPelvisY =
        lerp(idleBreathBob, lerp(walkPelvisBob, runPelvisBob, rBlend), wBlend) +
        state.landingSquash * 18;
      // In Belly Crawl (cBlend = 1), lower pelvis by +94px so Christian's belly and hips lie right along the ground!
      let pelvisOffsetY = lerp(standingPelvisY, 94 + crawlPelvisBob, cBlend);

      // Upright spine during standing/walking; tilts forward ~81 deg (1.42 rad) in Belly Crawl so torso is horizontal on the ground
      const baseTorsoLean = lerp(
        -0.01,
        lerp(0.058, 0.13, rBlend),
        wBlend
      );
      const standingTorsoLean =
        baseTorsoLean +
        state.accelTilt * 0.04 +
        state.landingSquash * 0.15;
      let torsoLean = lerp(
        standingTorsoLean,
        1.42 + Math.sin(cycle * Math.PI * 2) * 0.025 * wBlend,
        cBlend
      );

      let chestArch = lerp(
        lerp(-0.01, lerp(0.014, 0.035, rBlend), wBlend) +
          state.landingSquash * 0.08,
        0.08,
        cBlend
      );

      // Natural Double-Pendulum Contralateral Arm, Forearm & Wrist Swing
      const walkArmWave = Math.cos(state.walkArmCycle * Math.PI * 2);
      const walkElbowLagWave = Math.cos(
        (state.walkArmCycle - 0.09) * Math.PI * 2
      );
      const walkWristLagWave = Math.sin(
        (state.walkArmCycle - 0.14) * Math.PI * 2
      );

      const runArmWave = Math.cos(cycle * Math.PI * 2);
      const runElbowLagWave = Math.cos((cycle - 0.09) * Math.PI * 2);
      const runWristLagWave = Math.sin((cycle - 0.14) * Math.PI * 2);

      // Walking arm swing: slower, gentler pendulum arc kept close to the torso
      const walkRightArmUpper = -0.29 * walkArmWave + 0.08;
      const walkRightArmElbow =
        0.26 + smoothstep(-0.7, 0.9, -walkElbowLagWave) * 0.28;
      const walkLeftArmUpper = 0.29 * walkArmWave + 0.08;
      const walkLeftArmElbow =
        0.26 + smoothstep(-0.7, 0.9, walkElbowLagWave) * 0.28;

      // Running arm pump: vigorous drive with phase-lagged elbow flexion (kept 100% unchanged)
      const runRightArmUpper = -0.82 * runArmWave - 0.08;
      const runRightArmElbow = 1.02 + Math.max(0, -runElbowLagWave) * 0.36;
      const runLeftArmUpper = 0.82 * runArmWave - 0.08;
      const runLeftArmElbow = 1.02 + Math.max(0, runElbowLagWave) * 0.36;

      const idleBreathArm = Math.sin(state.breathTimer * 2.2) * 0.018;

      // Standing / Walking / Running arm angles
      let rightArmUpper = lerp(
        0.14 + idleBreathArm,
        lerp(walkRightArmUpper, runRightArmUpper, rBlend),
        wBlend
      );
      let rightArmElbow = lerp(
        0.48,
        lerp(walkRightArmElbow, runRightArmElbow, rBlend),
        wBlend
      );
      let leftArmUpper = lerp(
        0.22 - idleBreathArm,
        lerp(walkLeftArmUpper, runLeftArmUpper, rBlend),
        wBlend
      );
      let leftArmElbow = lerp(
        0.54,
        lerp(walkLeftArmElbow, runLeftArmElbow, rBlend),
        wBlend
      );

      const activeWristWave = lerp(walkWristLagWave, runWristLagWave, rBlend);
      let rightWristPitch =
        lerp(0.03, activeWristWave * (0.07 + rBlend * 0.07), wBlend);
      let leftWristPitch =
        lerp(0.03, -activeWristWave * (0.07 + rBlend * 0.07), wBlend);
      let handFistBlend = rBlend * wBlend;

      // Belly Army Crawl Arm Motion: alternating elbows & forearms reaching forward and pulling along the ground!
      if (cBlend > 0.001) {
        const crawlWave = Math.cos(cycle * Math.PI * 2);
        const crawlPull = Math.sin(cycle * Math.PI * 2);
        // Upper arm reaches forward/down to plant the elbow on the turf while forearm extends flat along the ground
        const crawlRightUpper = 1.15 - 0.25 * crawlWave * wBlend;
        const crawlRightElbow = 0.42 + 0.27 * crawlWave * wBlend;
        const crawlRightWrist = -0.06 + 0.1 * crawlPull * wBlend;

        const crawlLeftUpper = 1.15 + 0.25 * crawlWave * wBlend;
        const crawlLeftElbow = 0.42 - 0.27 * crawlWave * wBlend;
        const crawlLeftWrist = -0.06 - 0.1 * crawlPull * wBlend;

        rightArmUpper = lerp(rightArmUpper, crawlRightUpper, cBlend);
        rightArmElbow = lerp(rightArmElbow, crawlRightElbow, cBlend);
        rightWristPitch = lerp(rightWristPitch, crawlRightWrist, cBlend);

        leftArmUpper = lerp(leftArmUpper, crawlLeftUpper, cBlend);
        leftArmElbow = lerp(leftArmElbow, crawlLeftElbow, cBlend);
        leftWristPitch = lerp(leftWristPitch, crawlLeftWrist, cBlend);
        handFistBlend = lerp(handFistBlend, 0.18, cBlend);
      }

      if (state.onGround && state.landingSquash > 0.01) {
        rightArmUpper -= state.landingSquash * 0.3;
        leftArmUpper -= state.landingSquash * 0.22;
        rightWristPitch -= state.landingSquash * 0.15;
      }

      // World-space target head angle: kept steady on the horizon when standing, and tilted slightly up to look forward when army-crawling!
      let targetWorldHeadAngle = lerp(
        0.01 + lerp(0.015, 0.03, rBlend) * wBlend + state.landingSquash * 0.08,
        0.06 + Math.sin(cycle * Math.PI * 2) * 0.025 * wBlend,
        cBlend
      );

      // Opening Dialogue Pose for Christian: crying with his head pointing down toward the ground (no book),
      // and moving his hands/arms and head slightly whenever Christian is speaking!
      const cryBlend = state.dialogueBookBlend;
      const isChristianSpeaking =
        dialogueScene.phase === 'DIALOGUE_ACTIVE' &&
        !dialogueScene.fadingOutText &&
        CHAPTER_1_OPENING_DIALOGUE[dialogueScene.lineIndex]?.speaker === 'Christian';

      if (cryBlend > 0.001) {
        const tTalk = dialogueScene.talkAnimTimer;
        const sobWave = Math.sin(state.breathTimer * 5.2);
        pelvisOffsetY += Math.max(0, sobWave) * 1.2 * cryBlend;
        torsoLean += cryBlend * 0.1;
        chestArch += cryBlend * 0.06 + sobWave * 0.015 * cryBlend;

        // Head points down toward the ground; nods/moves naturally when Christian speaks
        const speakingHeadMotion = isChristianSpeaking
          ? Math.sin(tTalk * 9.2) * 0.065 + Math.cos(tTalk * 5.8) * 0.038
          : sobWave * 0.022;
        const downwardHeadPitch = isChristianSpeaking ? 0.22 : 0.42;
        targetWorldHeadAngle = lerp(
          targetWorldHeadAngle,
          downwardHeadPitch + speakingHeadMotion,
          cryBlend
        );

        // Arms rest naturally when listening/crying, and move with subtle, minimal gestures when Christian is talking
        const talkRightUpper = isChristianSpeaking
          ? 0.25 + Math.sin(tTalk * 6.2) * 0.065
          : 0.16 + sobWave * 0.015;
        const talkRightElbow = isChristianSpeaking
          ? 0.68 + Math.cos(tTalk * 7.4) * 0.095
          : 0.52;
        const talkRightWrist = isChristianSpeaking
          ? 0.05 + Math.sin(tTalk * 8.2) * 0.055
          : 0.03;

        const talkLeftUpper = isChristianSpeaking
          ? 0.24 - Math.sin(tTalk * 5.6 + 0.5) * 0.055
          : 0.22 - sobWave * 0.015;
        const talkLeftElbow = isChristianSpeaking
          ? 0.64 + Math.sin(tTalk * 6.8) * 0.08
          : 0.56;
        const talkLeftWrist = isChristianSpeaking
          ? 0.04 + Math.cos(tTalk * 7.6) * 0.045
          : 0.03;

        rightArmUpper = lerp(rightArmUpper, talkRightUpper, cryBlend);
        rightArmElbow = lerp(rightArmElbow, talkRightElbow, cryBlend);
        rightWristPitch = lerp(rightWristPitch, talkRightWrist, cryBlend);
        leftArmUpper = lerp(leftArmUpper, talkLeftUpper, cryBlend);
        leftArmElbow = lerp(leftArmElbow, talkLeftElbow, cryBlend);
        leftWristPitch = lerp(leftWristPitch, talkLeftWrist, cryBlend);
      }

      // Ending Dialogue Pose for Christian: upright facing Pliable & Obstinate, moving both his hands and his head slightly when speaking
      if (state.endingTalkBlend > 0.001) {
        const tTalk = endingScene.talkAnimTimer;
        const activeTalkWeight = state.endingTalkBlend * (1 - wBlend);
        const talkRightUpper = 0.28 + Math.sin(tTalk * 6.2) * 0.075;
        const talkRightElbow = 0.72 + Math.cos(tTalk * 7.4) * 0.105;
        const talkRightWrist = 0.06 + Math.sin(tTalk * 8.2) * 0.06;
        const talkLeftUpper = 0.25 - Math.sin(tTalk * 5.6 + 0.5) * 0.065;
        const talkLeftElbow = 0.66 + Math.sin(tTalk * 6.8) * 0.09;
        const talkLeftWrist = 0.05 + Math.cos(tTalk * 7.6) * 0.05;
        const talkHeadAngle =
          0.05 + Math.sin(tTalk * 8.4) * 0.065 + Math.cos(tTalk * 5.4) * 0.035;

        rightArmUpper = lerp(rightArmUpper, talkRightUpper, activeTalkWeight);
        rightArmElbow = lerp(rightArmElbow, talkRightElbow, activeTalkWeight);
        rightWristPitch = lerp(rightWristPitch, talkRightWrist, activeTalkWeight);
        leftArmUpper = lerp(leftArmUpper, talkLeftUpper, activeTalkWeight);
        leftArmElbow = lerp(leftArmElbow, talkLeftElbow, activeTalkWeight);
        leftWristPitch = lerp(leftWristPitch, talkLeftWrist, activeTalkWeight);
        targetWorldHeadAngle = lerp(
          targetWorldHeadAngle,
          talkHeadAngle,
          activeTalkWeight
        );
      }

      // 3. Multi-Stage Realistic Airborne Jump, Swinging-Rope Hang, Tar-Sinking, Wall-Grip, Wall-Push-Off & Ledge-Vault Kinematics
      if (state.sinking.active && isChapterOne) {
        const st = state.sinking.timer;
        const struggleWave = Math.sin(st * 9.0);
        // Christian struggles with arms raised above the black tar as he slowly sinks
        rightArmUpper = 2.48 + struggleWave * 0.2;
        rightArmElbow = 0.36 - struggleWave * 0.08;
        rightWristPitch = 0.12;
        leftArmUpper = 2.32 - struggleWave * 0.2;
        leftArmElbow = 0.42 + struggleWave * 0.08;
        leftWristPitch = 0.1;
        handFistBlend = 0.25;

        pelvisOffsetY = 0;
        torsoLean = 0.06 + struggleWave * 0.04;
        chestArch = 0.05;
        targetWorldHeadAngle = -0.24 + struggleWave * 0.05;

        rightFoot = {
          ankleX: 8,
          ankleY: -18,
          footPitch: -0.2,
          toeBend: 0.15,
        };
        leftFoot = {
          ankleX: -18,
          ankleY: -14,
          footPitch: -0.25,
          toeBend: 0.15,
        };
      } else if (state.ropeGrab.active && isChapterOne) {
        const rope = swingingRopes[state.ropeGrab.ropeIndex];
        const rAngle = rope ? rope.angle : 0;
        const rVel = rope ? rope.angularVel : 0;
        const dirSign = state.facing;
        const swingDrag = clamp(rVel * dirSign * 0.38, -0.68, 0.68);
        const cAnim = state.ropeGrab.climbAnimBlend;
        const rPhase = state.ropeGrab.climbCycle * Math.PI * 2;
        const lPhase = (state.ropeGrab.climbCycle + 0.5) * Math.PI * 2;
        const climbWave = Math.sin(rPhase);

        // Keep pelvis & torso centered under the rope with a subtle climbing heave when ascending/descending
        pelvisOffsetY = -8 + Math.sin(rPhase * 2) * 2.0 * cAnim;
        torsoLean = 0.08 + climbWave * 0.025 * cAnim;
        chestArch = 0.05;
        targetWorldHeadAngle =
          clamp(rAngle * dirSign * 0.2, -0.16, 0.2) - 0.04 * cAnim;

        // Solve alternating hand-over-hand climbing arm kinematics along the vertical rope line (x = 22.8)
        const solveRopeClimbArm = (
          shX: number,
          shY: number,
          wristTargetX: number,
          wristTargetY: number
        ) => {
          const dx = wristTargetX - shX;
          const dy = wristTargetY - shY;
          const dist = clamp(Math.hypot(dx, dy), 24, 83.2);
          const cosElbow = clamp(
            (dist * dist - 44 * 44 - 40 * 40) / (2 * 44 * 40),
            -1,
            1
          );
          const elbowBend = Math.acos(cosElbow);
          const targetAngle = Math.atan2(dx, dy);
          const upperAngle =
            targetAngle -
            Math.atan2(
              40 * Math.sin(elbowBend),
              44 + 40 * Math.cos(elbowBend)
            );
          return { upperAngle, elbowBend };
        };

        // Each hand alternates reaching high up the rope (y = -277) and pulling down along the rope (y = -238)
        const rTargetX = 22.8 - Math.max(0, Math.cos(rPhase)) * 2.2;
        const rTargetY = -257.5 + Math.sin(rPhase) * 19.5;
        const lTargetX = 22.8 - Math.max(0, Math.cos(lPhase)) * 2.2;
        const lTargetY = -257.5 + Math.sin(lPhase) * 19.5;

        const rClimbArm = solveRopeClimbArm(7.9, -189.1, rTargetX, rTargetY);
        const lClimbArm = solveRopeClimbArm(10.9, -189.1, lTargetX, lTargetY);

        rightArmUpper = lerp(2.76, rClimbArm.upperAngle, cAnim);
        rightArmElbow = lerp(0.42, rClimbArm.elbowBend, cAnim);
        rightWristPitch = 0.04 + Math.sin(rPhase) * 0.06 * cAnim;
        leftArmUpper = lerp(2.83, lClimbArm.upperAngle, cAnim);
        leftArmElbow = lerp(0.33, lClimbArm.elbowBend, cAnim);
        leftWristPitch = 0.04 + Math.sin(lPhase) * 0.06 * cAnim;
        handFistBlend = 1.0;

        // Legs & boots tuck and trail the pendulum swing dynamically
        const legSwing = clamp(
          -rAngle * dirSign * 26 - swingDrag * 24,
          -36,
          36
        );
        rightFoot = {
          ankleX: 10 + legSwing,
          ankleY: -46 + Math.abs(swingDrag) * 8 + climbWave * (5 + 6 * cAnim),
          footPitch: -0.25 - swingDrag * 0.32,
          toeBend: 0.22,
        };
        leftFoot = {
          ankleX: -14 + legSwing * 1.08,
          ankleY: -36 + Math.abs(swingDrag) * 6 - climbWave * (5 + 6 * cAnim),
          footPitch: -0.42 - swingDrag * 0.32,
          toeBend: 0.28,
        };
      } else if (state.vault.active) {
        // Dedicated Ledge Vault / Mount Animation (when holding SPACE near a ledge edge)
        const u = clamp(state.vault.timer / state.vault.duration, 0, 1);
        if (u < 0.52) {
          // Phase 1: Hands plant firmly on the ledge top, torso leans over, both knees tuck high to clear the ledge lip
          const p1 = smoothstep(0, 0.52, u);
          rightFoot = {
            ankleX: lerp(18, 30, p1),
            ankleY: lerp(-40, -78, p1),
            footPitch: lerp(0.15, 0.38, p1),
            toeBend: 0.18,
          };
          leftFoot = {
            ankleX: lerp(-18, -4, p1),
            ankleY: lerp(-32, -74, p1),
            footPitch: lerp(-0.35, -0.22, p1),
            toeBend: 0.28,
          };
          pelvisOffsetY = lerp(-6, -24, p1);
          torsoLean = lerp(0.24, 0.48, p1);
          chestArch = 0.08;
          rightArmUpper = lerp(1.18, 0.12, p1);
          rightArmElbow = lerp(0.88, 0.42, p1);
          rightWristPitch = 0.35;
          leftArmUpper = lerp(0.96, -0.08, p1);
          leftArmElbow = lerp(0.82, 0.38, p1);
          leftWristPitch = 0.3;
          handFistBlend = 0.15;
          targetWorldHeadAngle = lerp(-0.04, 0.12, p1);
        } else {
          // Phase 2: Arms push off the ledge top, legs swing forward & extend down to plant boots on the platform
          const p2 = smoothstep(0.52, 1.0, u);
          rightFoot = {
            ankleX: lerp(30, 20, p2),
            ankleY: lerp(-78, -11.5, p2),
            footPitch: lerp(0.38, 0.0, p2),
            toeBend: lerp(0.18, 0.0, p2),
          };
          leftFoot = {
            ankleX: lerp(-4, -22, p2),
            ankleY: lerp(-74, -11.5, p2),
            footPitch: lerp(-0.22, -0.05, p2),
            toeBend: lerp(0.28, 0.05, p2),
          };
          pelvisOffsetY = lerp(-24, 8, p2);
          torsoLean = lerp(0.48, 0.16, p2);
          chestArch = lerp(0.08, 0.04, p2);
          rightArmUpper = lerp(0.12, -0.22, p2);
          rightArmElbow = lerp(0.42, 0.65, p2);
          rightWristPitch = lerp(0.35, 0.04, p2);
          leftArmUpper = lerp(-0.08, 0.32, p2);
          leftArmElbow = lerp(0.38, 0.58, p2);
          leftWristPitch = lerp(0.3, 0.02, p2);
          handFistBlend = lerp(0.15, 0.4, p2);
          targetWorldHeadAngle = lerp(0.12, 0.03, p2);
        }
      } else if (!state.onGround) {
        const vyNorm = clamp(state.vy / 1050, -1, 1);
        handFistBlend = 0.75;

        if (vyNorm < -0.18) {
          const liftT = smoothstep(-1.0, -0.18, vyNorm);
          rightFoot = {
            ankleX: lerp(14, 24, liftT),
            ankleY: lerp(-36, -54, liftT),
            footPitch: lerp(-0.15, 0.12, liftT),
            toeBend: 0.05,
          };
          leftFoot = {
            ankleX: lerp(-28, -34, liftT),
            ankleY: lerp(-18, -38, liftT),
            footPitch: lerp(-0.85, -0.55, liftT),
            toeBend: 0.35,
          };
          pelvisOffsetY = -6;
          torsoLean = 0.16 + rBlend * 0.08;
          chestArch = 0.04;
          rightArmUpper = lerp(0.68, 0.42, liftT);
          rightArmElbow = 0.98;
          leftArmUpper = lerp(-0.52, -0.28, liftT);
          leftArmElbow = 0.82;
          rightWristPitch = 0.1;
          leftWristPitch = -0.08;
          targetWorldHeadAngle = -0.05 * (1 - liftT);
        } else if (vyNorm <= 0.22) {
          const apexT = smoothstep(-0.18, 0.22, vyNorm);
          rightFoot = {
            ankleX: lerp(24, 28, apexT),
            ankleY: lerp(-54, -44, apexT),
            footPitch: lerp(0.12, 0.22, apexT),
            toeBend: 0.0,
          };
          leftFoot = {
            ankleX: lerp(-34, -22, apexT),
            ankleY: lerp(-38, -46, apexT),
            footPitch: lerp(-0.55, -0.35, apexT),
            toeBend: 0.2,
          };
          pelvisOffsetY = -8;
          torsoLean = 0.18 + rBlend * 0.06;
          chestArch = 0.05;
          rightArmUpper = lerp(0.42, 0.12, apexT);
          rightArmElbow = 0.92;
          leftArmUpper = lerp(-0.28, -0.38, apexT);
          leftArmElbow = 0.85;
          rightWristPitch = 0.04;
          leftWristPitch = -0.05;
          targetWorldHeadAngle = lerp(0.0, 0.05, apexT);
        } else {
          const fallT = smoothstep(0.22, 0.95, vyNorm);
          rightFoot = {
            ankleX: lerp(28, 22, fallT),
            ankleY: lerp(-44, -14, fallT),
            footPitch: lerp(0.22, 0.28, fallT),
            toeBend: 0.0,
          };
          leftFoot = {
            ankleX: lerp(-22, -26, fallT),
            ankleY: lerp(-46, -28, fallT),
            footPitch: lerp(-0.35, -0.25, fallT),
            toeBend: 0.15,
          };
          pelvisOffsetY = lerp(-8, -2, fallT);
          torsoLean = lerp(0.18, 0.14, fallT);
          chestArch = 0.04;
          rightArmUpper = lerp(0.12, -0.38, fallT);
          rightArmElbow = lerp(0.92, 0.65, fallT);
          leftArmUpper = lerp(-0.38, -0.45, fallT);
          leftArmElbow = 0.7;
          rightWristPitch = -0.12 * fallT;
          leftWristPitch = -0.1 * fallT;
          targetWorldHeadAngle = 0.07 * fallT;
        }

        // Wall-Grip Animation: Hands & boots braced directly against the wall face
        if (state.wallGripBlend > 0.001) {
          const wg = state.wallGripBlend;
          rightFoot = {
            ankleX: lerp(rightFoot.ankleX, 27, wg),
            ankleY: lerp(rightFoot.ankleY, -64, wg),
            footPitch: lerp(rightFoot.footPitch, 0.72, wg),
            toeBend: lerp(rightFoot.toeBend, 0.25, wg),
          };
          leftFoot = {
            ankleX: lerp(leftFoot.ankleX, 19, wg),
            ankleY: lerp(leftFoot.ankleY, -25, wg),
            footPitch: lerp(leftFoot.footPitch, 0.5, wg),
            toeBend: lerp(leftFoot.toeBend, 0.18, wg),
          };
          pelvisOffsetY = lerp(pelvisOffsetY, -10, wg);
          torsoLean = lerp(torsoLean, 0.14, wg);
          chestArch = lerp(chestArch, 0.06, wg);
          rightArmUpper = lerp(rightArmUpper, 1.38, wg);
          rightArmElbow = lerp(rightArmElbow, 0.72, wg);
          rightWristPitch = lerp(rightWristPitch, -0.45, wg);
          leftArmUpper = lerp(leftArmUpper, 1.18, wg);
          leftArmElbow = lerp(leftArmElbow, 0.78, wg);
          leftWristPitch = lerp(leftWristPitch, -0.4, wg);
          handFistBlend = lerp(handFistBlend, 0.0, wg);
          targetWorldHeadAngle = lerp(targetWorldHeadAngle, -0.14, wg);
        }

        // Wall-Push-Off Animation: Dynamic kick-off extension right after pressing Space on a wall
        if (state.wallPushOffTimer > 0) {
          const pushT = smoothstep(0, 1, clamp(state.wallPushOffTimer / 0.26, 0, 1));
          // Lead knee drives high & forward across the shaft while back leg extends powerfully off the wall
          rightFoot = {
            ankleX: lerp(rightFoot.ankleX, 34, pushT),
            ankleY: lerp(rightFoot.ankleY, -68, pushT),
            footPitch: lerp(rightFoot.footPitch, 0.24, pushT),
            toeBend: lerp(rightFoot.toeBend, 0.05, pushT),
          };
          leftFoot = {
            ankleX: lerp(leftFoot.ankleX, -48, pushT),
            ankleY: lerp(leftFoot.ankleY, -12, pushT),
            footPitch: lerp(leftFoot.footPitch, -1.02, pushT),
            toeBend: lerp(leftFoot.toeBend, 0.42, pushT),
          };
          pelvisOffsetY = lerp(pelvisOffsetY, -10, pushT);
          torsoLean = lerp(torsoLean, 0.32, pushT);
          chestArch = lerp(chestArch, 0.07, pushT);
          rightArmUpper = lerp(rightArmUpper, 0.92, pushT);
          rightArmElbow = lerp(rightArmElbow, 0.86, pushT);
          leftArmUpper = lerp(leftArmUpper, -1.02, pushT);
          leftArmElbow = lerp(leftArmElbow, 0.18, pushT);
          targetWorldHeadAngle = lerp(targetWorldHeadAngle, -0.08, pushT);
        }
      }

      // 4. Solve Exact Analytical 2-Bone IK for Both Legs (with Prone Belly-Crawl Leg Kinematics when holding Shift)
      const THIGH_LEN = 54;
      const SHIN_LEN = 53;
      const baseHipX = lerp(-3.0, -24.0, cBlend);
      const baseHipY = -113.5 + pelvisOffsetY;

      // Natural pelvic rotation (hips rotate forward/back with each stride)
      const hipSwingX =
        Math.cos(cycle * Math.PI * 2) * lerp(6.8, 3.5, cBlend) * wBlend;

      const rightHipX = baseHipX + 1.5 + hipSwingX;
      const leftHipX = baseHipX - 2.5 - hipSwingX;

      const baseLegLen = THIGH_LEN + SHIN_LEN;
      const walkStretchWeight = (1 - rBlend) * wBlend * (1 - cBlend);

      const rightRawDist = Math.hypot(
        rightFoot.ankleX - rightHipX,
        rightFoot.ankleY - baseHipY
      );
      const rightReqScale = Math.max(1, rightRawDist / (baseLegLen * 0.99));
      const rightLegScale = lerp(1, rightReqScale, walkStretchWeight);

      const leftRawDist = Math.hypot(
        leftFoot.ankleX - leftHipX,
        leftFoot.ankleY - baseHipY
      );
      const leftReqScale = Math.max(1, leftRawDist / (baseLegLen * 0.99));
      const leftLegScale = lerp(1, leftReqScale, walkStretchWeight);

      const standingRightLegJoints = solveLegIK(
        rightHipX,
        baseHipY,
        rightFoot.ankleX,
        rightFoot.ankleY,
        THIGH_LEN * rightLegScale,
        SHIN_LEN * rightLegScale
      );

      const standingLeftLegJoints = solveLegIK(
        leftHipX,
        baseHipY,
        leftFoot.ankleX,
        leftFoot.ankleY,
        THIGH_LEN * leftLegScale,
        SHIN_LEN * leftLegScale
      );

      // Prone Belly Army-Crawl Leg Kinematics: legs stretch back along the ground behind the hips,
      // alternating knee-forward pull and boot-toe push against the turf!
      const crawlLegWave = Math.cos(cycle * Math.PI * 2);
      const crawlLegLift = Math.sin(cycle * Math.PI * 2);

      const crawlRightKneeX = rightHipX - 38 + crawlLegWave * 11 * wBlend;
      const crawlRightKneeY = -6.0 - Math.max(0, crawlLegLift) * 3.5 * wBlend;
      const crawlRightAnkleX = crawlRightKneeX - 46 + crawlLegWave * 5 * wBlend;
      const crawlRightAnkleY = -12.5 - Math.max(0, -crawlLegLift) * 3.0 * wBlend;

      const crawlLeftKneeX = leftHipX - 38 - crawlLegWave * 11 * wBlend;
      const crawlLeftKneeY = -6.0 - Math.max(0, -crawlLegLift) * 3.5 * wBlend;
      const crawlLeftAnkleX = crawlLeftKneeX - 46 - crawlLegWave * 5 * wBlend;
      const crawlLeftAnkleY = -12.5 - Math.max(0, crawlLegLift) * 3.0 * wBlend;

      const rKneeX = lerp(standingRightLegJoints.kneeX, crawlRightKneeX, cBlend);
      const rKneeY = lerp(standingRightLegJoints.kneeY, crawlRightKneeY, cBlend);
      const rAnkleX = lerp(standingRightLegJoints.ankleX, crawlRightAnkleX, cBlend);
      const rAnkleY = lerp(standingRightLegJoints.ankleY, crawlRightAnkleY, cBlend);
      const rightLegJoints: LimbJoints = {
        hipX: rightHipX,
        hipY: baseHipY,
        kneeX: rKneeX,
        kneeY: rKneeY,
        ankleX: rAnkleX,
        ankleY: rAnkleY,
        thighAngle: Math.atan2(rKneeX - rightHipX, rKneeY - baseHipY),
        shinAngle: Math.atan2(rAnkleX - rKneeX, rAnkleY - rKneeY),
      };

      const lKneeX = lerp(standingLeftLegJoints.kneeX, crawlLeftKneeX, cBlend);
      const lKneeY = lerp(standingLeftLegJoints.kneeY, crawlLeftKneeY, cBlend);
      const lAnkleX = lerp(standingLeftLegJoints.ankleX, crawlLeftAnkleX, cBlend);
      const lAnkleY = lerp(standingLeftLegJoints.ankleY, crawlLeftAnkleY, cBlend);
      const leftLegJoints: LimbJoints = {
        hipX: leftHipX,
        hipY: baseHipY,
        kneeX: lKneeX,
        kneeY: lKneeY,
        ankleX: lAnkleX,
        ankleY: lAnkleY,
        thighAngle: Math.atan2(lKneeX - leftHipX, lKneeY - baseHipY),
        shinAngle: Math.atan2(lAnkleX - lKneeX, lAnkleY - lKneeY),
      };

      if (cBlend > 0.001) {
        rightFoot.footPitch = lerp(
          rightFoot.footPitch,
          -1.16 + 0.14 * crawlLegWave * wBlend,
          cBlend
        );
        rightFoot.toeBend = lerp(rightFoot.toeBend, 0.46, cBlend);
        leftFoot.footPitch = lerp(
          leftFoot.footPitch,
          -1.16 - 0.14 * crawlLegWave * wBlend,
          cBlend
        );
        leftFoot.toeBend = lerp(leftFoot.toeBend, 0.46, cBlend);
      }

      // Compute shoulder coordinates from spine (extended forward along the ground when army-crawling)
      const shoulderForwardOffset = lerp(lerp(4.8, 5.0, rBlend), 2.5, cBlend);
      const shoulderHeightOffset = lerp(lerp(68, 69, rBlend), 64, cBlend);
      const shoulderWorldX =
        baseHipX +
        shoulderForwardOffset +
        Math.sin(torsoLean + chestArch * 0.5) * shoulderHeightOffset;
      const shoulderWorldY =
        baseHipY - Math.cos(torsoLean + chestArch * 0.5) * shoulderHeightOffset;

      const walkShoulderSwing = -walkArmWave * 2.0 * wBlend;
      const runShoulderSwing = -hipSwingX * 0.9;
      const leftShoulderX =
        shoulderWorldX +
        2 +
        lerp(walkShoulderSwing, runShoulderSwing, rBlend);
      const rightShoulderX =
        shoulderWorldX -
        1 -
        lerp(walkShoulderSwing, runShoulderSwing, rBlend);

      ctx.save();
      // If Christian is slowly sinking in a tar pit, clip his submerged lower body at the tar surface line!
      if (state.sinking.active) {
        ctx.beginPath();
        ctx.rect(
          state.x - 240,
          -300,
          480,
          state.sinking.surfaceY + 300
        );
        ctx.clip();
      }
      ctx.translate(state.x, state.y);
      // Scale uniformly by CHAR_SCALE (0.82) around the ground contact origin
      ctx.scale(state.facing * CHAR_SCALE, CHAR_SCALE);

      // Ground ink shadow directly under the body (wider when army-crawling on belly)
      let surfaceBelowY = GROUND_Y;
      for (const b of levelBlocks) {
        if (
          state.x >= b.x1 &&
          state.x <= b.x2 &&
          state.y <= b.topY + 4 &&
          b.topY < surfaceBelowY
        ) {
          surfaceBelowY = b.topY;
        }
      }
      const heightOffGround = state.onGround ? 0 : Math.max(0, surfaceBelowY - state.y);
      const shadowScale = Math.max(0.28, 1 - heightOffGround / 360);
      const crawlShadowWidth = lerp(48, 86, cBlend);
      ctx.fillStyle = `rgba(16, 8, 4, ${0.25 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(
        lerp(-2, -14, cBlend),
        3.5,
        crawlShadowWidth * shadowScale,
        6.5 * shadowScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // --- LAYER 1: BACK ARM & BACK LEG ---
      drawAnatomicalArm(
        leftShoulderX,
        shoulderWorldY,
        leftArmUpper,
        leftArmElbow,
        leftWristPitch,
        handFistBlend,
        BACK_LIMB_INK
      );
      drawAnatomicalLeg(
        leftLegJoints,
        leftFoot.footPitch,
        leftFoot.toeBend,
        BACK_LIMB_INK
      );

      // --- LAYER 2: DIRECTLY CONNECTED ROUNDED BURDEN, TORSO, PELVIS & HEAD ---
      ctx.save();
      ctx.translate(baseHipX + 2.0, baseHipY);
      ctx.rotate(torsoLean);

      // Solid Pelvis Core (bridges both hips & lower spine so there is never any hip/thigh seam)
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.ellipse(-1, -1, 14.5, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- DIRECTLY FUSED ROUNDED BURDEN (Zero gap between back & burden, zero dangling straps!) ---
      const bY = state.burdenBounceY;
      const bPitch = state.burdenPitch;
      ctx.save();
      ctx.translate(0, bY);
      ctx.rotate(bPitch);
      ctx.fillStyle = INK_COLOR;

      ctx.beginPath();
      // Anchors deep inside the upper chest/spine (x = +4) so zero gap can ever appear
      ctx.moveTo(4, -77);
      ctx.lineTo(-12, -79);
      // Full, heavy, rounded upper dome of the burden rising behind the shoulders
      ctx.bezierCurveTo(-24, -100, -52, -99, -66, -79);
      // Smooth, organic rounded back contour of the heavy burden sack
      ctx.bezierCurveTo(-80, -58, -81, -20, -65, 2);
      // Rounded lower base curving directly into the lower back/pelvis with ZERO gap
      ctx.bezierCurveTo(-53, 17, -26, 15, -9, 5);
      // Closes deep inside the torso core
      ctx.lineTo(4, 3);
      ctx.lineTo(4, -77);
      ctx.closePath();
      ctx.fill();
      ctx.restore(); // End Burden

      // --- CLEAN, TALL ARTICULATED TORSO & COLLAR (No stray chest tabs or particles!) ---
      ctx.save();
      ctx.rotate(chestArch * 0.35);
      ctx.fillStyle = INK_COLOR;

      const coatSwing = state.coatSway * (1 - cBlend * 0.75);

      ctx.beginPath();
      ctx.moveTo(-13.8, -86);
      ctx.lineTo(-15.0, -45);
      ctx.lineTo(-14.0, 10);
      ctx.lineTo(9.0, 10);
      // Clean lower front coat hem
      ctx.lineTo(16.5 - coatSwing * 2.5, 3.0 + coatSwing * 1.5);
      // Smooth, uninterrupted front chest & torso silhouette (no stray tabs or specks)
      ctx.bezierCurveTo(15.5, -18, 16.2, -42, 16.0, -64);
      // Clean collar contour under the chin
      ctx.bezierCurveTo(16.0, -73, 15.2, -79, 11.5, -84);
      ctx.lineTo(-13.8, -86);
      ctx.closePath();
      ctx.fill();

      // --- HORIZON-STABILIZED HEAD, FACIAL PROFILE & SPIKY HAIR TUFTS (No Bobble!) ---
      ctx.save();
      // Shift neck pivot slightly when torso is horizontal in belly crawl so neck stays 100% fused to collar
      ctx.translate(-5.5 * cBlend, -85 + 7.5 * cBlend);
      // Counter-rotate against parent torsoLean & chestArch so the head stays steady and level on the horizon!
      const localHeadRot =
        targetWorldHeadAngle - (torsoLean + chestArch * 0.35);
      ctx.rotate(localHeadRot);

      const hFlutter = state.hairFlutter;

      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      // Nape of neck & subtle hairline wisp
      ctx.moveTo(-9.5, 4);
      ctx.lineTo(-11.5, -4);
      ctx.lineTo(-14.5, -6);
      ctx.lineTo(-13.0, -9);
      ctx.bezierCurveTo(-15.5, -13, -18.5, -19, -19.0, -26);
      // Back of cranium & crown locks
      ctx.bezierCurveTo(-20.5, -35, -16.5, -45, -8.0, -50);
      ctx.lineTo(-10.0 - hFlutter * 1.4, -52.5);
      ctx.lineTo(-3.5, -51.5);
      ctx.bezierCurveTo(3.5, -54.5, 11.5, -54.0, 17.5, -49.5);

      // 5 tousled spiky front hair tufts over the brow
      ctx.lineTo(22.5 - hFlutter * 2.0, -53.0 + hFlutter * 1.0);
      ctx.lineTo(20.0, -47.0);
      ctx.lineTo(26.8 - hFlutter * 2.4, -48.0 + hFlutter * 1.2);
      ctx.lineTo(21.2, -42.0);
      ctx.lineTo(27.2 - hFlutter * 2.4, -41.0 + hFlutter * 1.2);
      ctx.lineTo(20.8, -35.5);
      ctx.lineTo(24.8 - hFlutter * 1.8, -34.0 + hFlutter * 1.0);
      ctx.lineTo(19.2, -30.5);
      ctx.lineTo(21.8 - hFlutter * 1.0, -29.2);
      ctx.lineTo(18.2, -26.8);

      // Forehead, brow ridge & deep-set eye bridge
      ctx.lineTo(18.6, -24.2);
      ctx.quadraticCurveTo(17.4, -22.5, 19.2, -20.8);
      // Pointed nose bridge & tip
      ctx.lineTo(24.0, -17.5);
      ctx.quadraticCurveTo(24.2, -15.6, 20.8, -15.2);
      // Nostril, philtrum, upper & lower lips
      ctx.lineTo(19.6, -14.8);
      ctx.lineTo(20.8, -12.8);
      ctx.lineTo(18.8, -11.5);
      ctx.lineTo(20.0, -9.6);
      // Chin & jawline
      ctx.quadraticCurveTo(18.6, -7.8, 19.5, -5.8);
      ctx.bezierCurveTo(19.8, -3.2, 16.5, -1.8, 11.5, -2.5);
      ctx.quadraticCurveTo(7.2, -3.0, 6.2, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // End Head
      ctx.restore(); // End Chest Arch
      ctx.restore(); // End Torso

      // --- LAYER 3: FRONT LEG & FRONT ARM ---
      drawAnatomicalLeg(
        rightLegJoints,
        rightFoot.footPitch,
        rightFoot.toeBend,
        INK_COLOR
      );

      drawAnatomicalArm(
        rightShoulderX,
        shoulderWorldY + 1,
        rightArmUpper,
        rightArmElbow,
        rightWristPitch,
        handFistBlend,
        INK_COLOR
      );

      // Draw fewer solid black ink tears falling from Christian's downward-pointed eyes during the opening dialogue
      if (state.dialogueBookBlend > 0.02) {
        const bAlpha = clamp(state.dialogueBookBlend, 0, 1);
        ctx.save();
        ctx.globalAlpha = bAlpha;
        ctx.fillStyle = INK_COLOR;
        const eyeOriginX = baseHipX + 34.0;
        const eyeOriginY = baseHipY - 94.0;
        const tearStreamCount = 2;
        for (let i = 0; i < tearStreamCount; i++) {
          const rawCycle = (state.breathTimer * 0.75 + i / tearStreamCount) % 1;
          // Leave a pause between drops so only 1-2 tears are falling at any moment
          if (rawCycle > 0.72) continue;
          const tearPhase = rawCycle / 0.72;
          const horizontalSpread = i === 0 ? -1.4 : 1.6;
          const dropX = eyeOriginX + horizontalSpread + tearPhase * 6.5;
          const dropY = eyeOriginY + tearPhase * tearPhase * 88;
          const dropScale =
            (0.8 + Math.sin(tearPhase * Math.PI) * 0.3) *
            (1 - tearPhase * 0.2);

          ctx.save();
          ctx.translate(dropX, dropY);
          ctx.rotate(-0.08);
          ctx.scale(dropScale, dropScale);

          // Solid black ink teardrop silhouette
          ctx.beginPath();
          ctx.moveTo(0, -5.4);
          ctx.bezierCurveTo(3.5, -1.0, 3.8, 3.4, 0, 4.6);
          ctx.bezierCurveTo(-3.8, 3.4, -3.5, -1.0, 0, -5.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      ctx.restore();
    };

    /**
     * Draws Evangelist using the exact same walking & running animation & kinematics as Christian,
     * with a filled-in, smooth anatomical back & coat contour (no burden) and smoother, less spiky hair.
     * Moves his arms and head slightly whenever he is speaking in dialogue.
     */
    const drawEvangelistCharacter = () => {
      if (!dialogueScene.evangelist.visible) return;

      const ev = dialogueScene.evangelist;
      const INK_COLOR = '#0D0603';
      const BACK_LIMB_INK = '#130905';

      const wBlend = ev.walkBlend;
      const rBlend = ev.runBlend;
      const tBlend = ev.talkBlend;
      const cycle = ev.gaitCycle;
      const tTalk = dialogueScene.talkAnimTimer;

      // 1. Exact same walk & run IK foot targets & grounded split stance as Christian
      const walkRightFoot = computeWalkFootTarget(cycle);
      const walkLeftFoot = computeWalkFootTarget(cycle + 0.5);

      const runRightFoot = computeRunFootTarget(cycle);
      const runLeftFoot = computeRunFootTarget(cycle + 0.5);

      const movingRightFoot: LegIKTarget = {
        ankleX: lerp(walkRightFoot.ankleX, runRightFoot.ankleX, rBlend),
        ankleY: lerp(walkRightFoot.ankleY, runRightFoot.ankleY, rBlend),
        footPitch: lerp(walkRightFoot.footPitch, runRightFoot.footPitch, rBlend),
        toeBend: lerp(walkRightFoot.toeBend, runRightFoot.toeBend, rBlend),
      };
      const movingLeftFoot: LegIKTarget = {
        ankleX: lerp(walkLeftFoot.ankleX, runLeftFoot.ankleX, rBlend),
        ankleY: lerp(walkLeftFoot.ankleY, runLeftFoot.ankleY, rBlend),
        footPitch: lerp(walkLeftFoot.footPitch, runLeftFoot.footPitch, rBlend),
        toeBend: lerp(walkLeftFoot.toeBend, runLeftFoot.toeBend, rBlend),
      };

      const idleRightFoot: LegIKTarget = {
        ankleX: 10,
        ankleY: -11.5,
        footPitch: 0.0,
        toeBend: 0.0,
      };
      const idleLeftFoot: LegIKTarget = {
        ankleX: -24,
        ankleY: -11.5,
        footPitch: -0.05,
        toeBend: 0.05,
      };

      const rightFoot: LegIKTarget = {
        ankleX: lerp(idleRightFoot.ankleX, movingRightFoot.ankleX, wBlend),
        ankleY: lerp(idleRightFoot.ankleY, movingRightFoot.ankleY, wBlend),
        footPitch: lerp(idleRightFoot.footPitch, movingRightFoot.footPitch, wBlend),
        toeBend: lerp(idleRightFoot.toeBend, movingRightFoot.toeBend, wBlend),
      };
      const leftFoot: LegIKTarget = {
        ankleX: lerp(idleLeftFoot.ankleX, movingLeftFoot.ankleX, wBlend),
        ankleY: lerp(idleLeftFoot.ankleY, movingLeftFoot.ankleY, wBlend),
        footPitch: lerp(idleLeftFoot.footPitch, movingLeftFoot.footPitch, wBlend),
        toeBend: lerp(idleLeftFoot.toeBend, movingLeftFoot.toeBend, wBlend),
      };

      // 2. Exact same pelvis bob, spine lean & chest arch as Christian (both walking & running)
      const stepPhase = (cycle * 2) % 1;
      const walkPelvisBob = Math.cos((stepPhase - 0.02) * Math.PI * 2) * 1.8 - 0.6;
      const runPelvisBob = Math.sin((stepPhase - 0.04) * Math.PI * 2) * 4.5;
      const idleBreathBob = Math.sin(state.breathTimer * 2.2) * 0.8;
      const pelvisOffsetY = lerp(
        idleBreathBob,
        lerp(walkPelvisBob, runPelvisBob, rBlend),
        wBlend
      );

      const torsoLean =
        lerp(-0.01, lerp(0.058, 0.13, rBlend), wBlend) + ev.accelTilt * 0.04;
      const chestArch = lerp(-0.01, lerp(0.014, 0.035, rBlend), wBlend);

      // 3. Exact same double-pendulum contralateral walk & run arm swing as Christian
      const walkArmWave = Math.cos(ev.walkArmCycle * Math.PI * 2);
      const walkElbowLagWave = Math.cos((ev.walkArmCycle - 0.09) * Math.PI * 2);
      const walkWristLagWave = Math.sin((ev.walkArmCycle - 0.14) * Math.PI * 2);

      const runArmWave = Math.cos(cycle * Math.PI * 2);
      const runElbowLagWave = Math.cos((cycle - 0.09) * Math.PI * 2);
      const runWristLagWave = Math.sin((cycle - 0.14) * Math.PI * 2);

      const walkRightArmUpper = -0.29 * walkArmWave + 0.08;
      const walkRightArmElbow =
        0.26 + smoothstep(-0.7, 0.9, -walkElbowLagWave) * 0.28;
      const walkLeftArmUpper = 0.29 * walkArmWave + 0.08;
      const walkLeftArmElbow =
        0.26 + smoothstep(-0.7, 0.9, walkElbowLagWave) * 0.28;

      const runRightArmUpper = -0.82 * runArmWave - 0.08;
      const runRightArmElbow = 1.02 + Math.max(0, -runElbowLagWave) * 0.36;
      const runLeftArmUpper = 0.82 * runArmWave - 0.08;
      const runLeftArmElbow = 1.02 + Math.max(0, runElbowLagWave) * 0.36;

      const idleBreathArm = Math.sin(state.breathTimer * 2.2) * 0.018;

      let rightArmUpper = lerp(
        0.14 + idleBreathArm,
        lerp(walkRightArmUpper, runRightArmUpper, rBlend),
        wBlend
      );
      let rightArmElbow = lerp(
        0.48,
        lerp(walkRightArmElbow, runRightArmElbow, rBlend),
        wBlend
      );
      let leftArmUpper = lerp(
        0.22 - idleBreathArm,
        lerp(walkLeftArmUpper, runLeftArmUpper, rBlend),
        wBlend
      );
      let leftArmElbow = lerp(
        0.54,
        lerp(walkLeftArmElbow, runLeftArmElbow, rBlend),
        wBlend
      );

      const activeWristWave = lerp(walkWristLagWave, runWristLagWave, rBlend);
      let rightWristPitch = lerp(
        0.03,
        activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      let leftWristPitch = lerp(
        0.03,
        -activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      const handFistBlend = rBlend * wBlend;

      let targetWorldHeadAngle = 0.01 + lerp(0.015, 0.03, rBlend) * wBlend;

      // Smoothly blend in subtle, minimal speaking arm & head gestures only when Evangelist is standing and speaking
      if (tBlend > 0.001) {
        const talkRightUpper = 0.26 + Math.sin(tTalk * 6.2) * 0.065;
        const talkRightElbow = 0.68 + Math.cos(tTalk * 7.4) * 0.095;
        const talkLeftUpper = 0.24 - Math.sin(tTalk * 5.6 + 0.5) * 0.055;
        const talkLeftElbow = 0.64 + Math.sin(tTalk * 6.8) * 0.08;
        const talkRightWrist = 0.05 + Math.sin(tTalk * 8.2) * 0.055;
        const talkLeftWrist = 0.04 + Math.cos(tTalk * 7.6) * 0.045;
        const talkHeadAngle =
          0.04 + Math.sin(tTalk * 8.2) * 0.055 + Math.cos(tTalk * 5.2) * 0.03;

        const activeTalkWeight = tBlend * (1 - wBlend);
        rightArmUpper = lerp(rightArmUpper, talkRightUpper, activeTalkWeight);
        rightArmElbow = lerp(rightArmElbow, talkRightElbow, activeTalkWeight);
        leftArmUpper = lerp(leftArmUpper, talkLeftUpper, activeTalkWeight);
        leftArmElbow = lerp(leftArmElbow, talkLeftElbow, activeTalkWeight);
        rightWristPitch = lerp(rightWristPitch, talkRightWrist, activeTalkWeight);
        leftWristPitch = lerp(leftWristPitch, talkLeftWrist, activeTalkWeight);
        targetWorldHeadAngle = lerp(
          targetWorldHeadAngle,
          talkHeadAngle,
          activeTalkWeight
        );
      }

      // 4. Exact same analytical 2-bone leg IK as Christian
      const THIGH_LEN = 54;
      const SHIN_LEN = 53;
      const baseHipX = -3.0;
      const baseHipY = -113.5 + pelvisOffsetY;
      const hipSwingX = Math.cos(cycle * Math.PI * 2) * 6.8 * wBlend;
      const rightHipX = baseHipX + 1.5 + hipSwingX;
      const leftHipX = baseHipX - 2.5 - hipSwingX;

      const baseLegLen = THIGH_LEN + SHIN_LEN;
      const walkStretchWeight = (1 - rBlend) * wBlend;
      const rightRawDist = Math.hypot(
        rightFoot.ankleX - rightHipX,
        rightFoot.ankleY - baseHipY
      );
      const rightLegScale = lerp(
        1,
        Math.max(1, rightRawDist / (baseLegLen * 0.99)),
        walkStretchWeight
      );
      const leftRawDist = Math.hypot(
        leftFoot.ankleX - leftHipX,
        leftFoot.ankleY - baseHipY
      );
      const leftLegScale = lerp(
        1,
        Math.max(1, leftRawDist / (baseLegLen * 0.99)),
        walkStretchWeight
      );

      const rightLegJoints = solveLegIK(
        rightHipX,
        baseHipY,
        rightFoot.ankleX,
        rightFoot.ankleY,
        THIGH_LEN * rightLegScale,
        SHIN_LEN * rightLegScale
      );
      const leftLegJoints = solveLegIK(
        leftHipX,
        baseHipY,
        leftFoot.ankleX,
        leftFoot.ankleY,
        THIGH_LEN * leftLegScale,
        SHIN_LEN * leftLegScale
      );

      const shoulderForwardOffset = lerp(4.8, 5.0, rBlend);
      const shoulderHeightOffset = lerp(68, 69, rBlend);
      const shoulderWorldX =
        baseHipX +
        shoulderForwardOffset +
        Math.sin(torsoLean + chestArch * 0.5) * shoulderHeightOffset;
      const shoulderWorldY =
        baseHipY - Math.cos(torsoLean + chestArch * 0.5) * shoulderHeightOffset;

      const walkShoulderSwing = -walkArmWave * 2.0 * wBlend;
      const runShoulderSwing = -hipSwingX * 0.9;
      const activeShoulderSwing = lerp(walkShoulderSwing, runShoulderSwing, rBlend);
      const leftShoulderX = shoulderWorldX + 2 + activeShoulderSwing;
      const rightShoulderX = shoulderWorldX - 1 - activeShoulderSwing;

      ctx.save();
      ctx.translate(ev.x, ev.y);
      ctx.scale(ev.facing * CHAR_SCALE, CHAR_SCALE);

      // Ground ink shadow under Evangelist's boots
      ctx.fillStyle = 'rgba(16, 8, 4, 0.25)';
      ctx.beginPath();
      ctx.ellipse(-2, 3.5, 48, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- LAYER 1: BACK ARM & BACK LEG ---
      drawAnatomicalArm(
        leftShoulderX,
        shoulderWorldY,
        leftArmUpper,
        leftArmElbow,
        leftWristPitch,
        handFistBlend,
        BACK_LIMB_INK
      );
      drawAnatomicalLeg(
        leftLegJoints,
        leftFoot.footPitch,
        leftFoot.toeBend,
        BACK_LIMB_INK
      );

      // --- LAYER 2: TORSO, PELVIS & HEAD (Filled-in, smooth rounded anatomical back & coat contour!) ---
      ctx.save();
      ctx.translate(baseHipX + 2.0, baseHipY);
      ctx.rotate(torsoLean);

      // Solid Pelvis Core
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.ellipse(-1, -1, 14.5, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Clean Tall Articulated Torso & Collar with a filled-in, smooth anatomical upper back & coat back contour
      ctx.save();
      ctx.rotate(chestArch * 0.35);
      ctx.fillStyle = INK_COLOR;

      const coatSwing = ev.coatSway;
      ctx.beginPath();
      // Start at nape/back of collar
      ctx.moveTo(-11.5, -85.5);
      // Smoothly rounded upper back & shoulder-blade (scapula) curve
      ctx.bezierCurveTo(-19.5, -81.0, -25.2, -67.0, -24.0, -48.0);
      // Smoothly tapered mid-back into gently flared lower coat back hem
      ctx.bezierCurveTo(
        -22.8,
        -29.0,
        -19.8,
        -10.0,
        -18.8 - coatSwing * 2.0,
        7.5 + coatSwing * 1.0
      );
      // Rounded lower-back coat corner into pelvis base
      ctx.quadraticCurveTo(-16.0, 10.8, -10.5, 10.2);
      ctx.lineTo(9.0, 10);
      // Clean lower front coat hem
      ctx.lineTo(16.5 - coatSwing * 2.5, 3.0 + coatSwing * 1.5);
      // Smooth front chest & collar silhouette
      ctx.bezierCurveTo(15.5, -18, 16.2, -42, 16.0, -64);
      ctx.bezierCurveTo(16.0, -73, 15.2, -79, 11.5, -84);
      ctx.lineTo(-11.5, -85.5);
      ctx.closePath();
      ctx.fill();

      // --- HEAD & SMOOTHER, LESS SPIKY HAIR ---
      ctx.save();
      ctx.translate(0, -85);
      const localHeadRot =
        targetWorldHeadAngle - (torsoLean + chestArch * 0.35);
      ctx.rotate(localHeadRot);

      const hFlutter = ev.hairFlutter;
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      // Nape of neck & smooth back hairline
      ctx.moveTo(-9.5, 4);
      ctx.lineTo(-12.0, -5);
      ctx.bezierCurveTo(-16.0, -12, -18.8, -19, -19.2, -27);
      // Smooth, rounded cranium & combed crown hair (not spiky like Christian's)
      ctx.bezierCurveTo(-20.2, -37, -15.2, -48, -5.0, -51.5);
      ctx.bezierCurveTo(3.5, -54.0, 12.8, -52.8, 18.2, -47.5);
      // Two gentle, soft front hair waves over the brow (much less spiky)
      ctx.quadraticCurveTo(21.2 - hFlutter * 1.0, -45.0, 19.6, -40.5);
      ctx.quadraticCurveTo(21.8 - hFlutter * 1.0, -37.2, 19.0, -33.0);
      ctx.quadraticCurveTo(20.4 - hFlutter * 0.6, -30.0, 18.2, -26.8);

      // Forehead, brow ridge & deep-set eye bridge
      ctx.lineTo(18.6, -24.2);
      ctx.quadraticCurveTo(17.4, -22.5, 19.2, -20.8);
      // Pointed nose bridge & tip
      ctx.lineTo(24.0, -17.5);
      ctx.quadraticCurveTo(24.2, -15.6, 20.8, -15.2);
      // Nostril, philtrum, upper & lower lips
      ctx.lineTo(19.6, -14.8);
      ctx.lineTo(20.8, -12.8);
      ctx.lineTo(18.8, -11.5);
      ctx.lineTo(20.0, -9.6);
      // Chin & jawline
      ctx.quadraticCurveTo(18.6, -7.8, 19.5, -5.8);
      ctx.bezierCurveTo(19.8, -3.2, 16.5, -1.8, 11.5, -2.5);
      ctx.quadraticCurveTo(7.2, -3.0, 6.2, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // End Head
      ctx.restore(); // End Chest Arch
      ctx.restore(); // End Torso

      // --- LAYER 3: FRONT LEG & FRONT ARM ---
      drawAnatomicalLeg(
        rightLegJoints,
        rightFoot.footPitch,
        rightFoot.toeBend,
        INK_COLOR
      );
      drawAnatomicalArm(
        rightShoulderX,
        shoulderWorldY + 1,
        rightArmUpper,
        rightArmElbow,
        rightWristPitch,
        handFistBlend,
        INK_COLOR
      );

      ctx.restore();
    };

    /**
     * Draws Pliable: looks like Christian without a burden, with smooth hair like Evangelist,
     * and slightly shorter than Christian (a shorter version of Evangelist).
     * Runs onto the screen, stands upright, and moves both his hands and head whenever he is speaking.
     */
    const drawPliableCharacter = () => {
      const pl = endingScene.pliable;
      if (!pl.visible) return;

      const INK_COLOR = '#0D0603';
      const BACK_LIMB_INK = '#130905';
      const PLIABLE_SCALE = CHAR_SCALE; // Exact same height as Christian, Obstinate & Evangelist

      const wBlend = pl.walkBlend;
      const rBlend = pl.runBlend;
      const tBlend = pl.talkBlend;
      const cycle = pl.gaitCycle;
      const tTalk = endingScene.talkAnimTimer;

      // 1. Walk & Run IK foot targets & standing stance
      const walkRightFoot = computeWalkFootTarget(cycle);
      const walkLeftFoot = computeWalkFootTarget(cycle + 0.5);
      const runRightFoot = computeRunFootTarget(cycle);
      const runLeftFoot = computeRunFootTarget(cycle + 0.5);

      const movingRightFoot: LegIKTarget = {
        ankleX: lerp(walkRightFoot.ankleX, runRightFoot.ankleX, rBlend),
        ankleY: lerp(walkRightFoot.ankleY, runRightFoot.ankleY, rBlend),
        footPitch: lerp(walkRightFoot.footPitch, runRightFoot.footPitch, rBlend),
        toeBend: lerp(walkRightFoot.toeBend, runRightFoot.toeBend, rBlend),
      };
      const movingLeftFoot: LegIKTarget = {
        ankleX: lerp(walkLeftFoot.ankleX, runLeftFoot.ankleX, rBlend),
        ankleY: lerp(walkLeftFoot.ankleY, runLeftFoot.ankleY, rBlend),
        footPitch: lerp(walkLeftFoot.footPitch, runLeftFoot.footPitch, rBlend),
        toeBend: lerp(walkLeftFoot.toeBend, runLeftFoot.toeBend, rBlend),
      };

      const idleRightFoot: LegIKTarget = {
        ankleX: 10,
        ankleY: -11.5,
        footPitch: 0.0,
        toeBend: 0.0,
      };
      const idleLeftFoot: LegIKTarget = {
        ankleX: -24,
        ankleY: -11.5,
        footPitch: -0.05,
        toeBend: 0.05,
      };

      const rightFoot: LegIKTarget = {
        ankleX: lerp(idleRightFoot.ankleX, movingRightFoot.ankleX, wBlend),
        ankleY: lerp(idleRightFoot.ankleY, movingRightFoot.ankleY, wBlend),
        footPitch: lerp(idleRightFoot.footPitch, movingRightFoot.footPitch, wBlend),
        toeBend: lerp(idleRightFoot.toeBend, movingRightFoot.toeBend, wBlend),
      };
      const leftFoot: LegIKTarget = {
        ankleX: lerp(idleLeftFoot.ankleX, movingLeftFoot.ankleX, wBlend),
        ankleY: lerp(idleLeftFoot.ankleY, movingLeftFoot.ankleY, wBlend),
        footPitch: lerp(idleLeftFoot.footPitch, movingLeftFoot.footPitch, wBlend),
        toeBend: lerp(idleLeftFoot.toeBend, movingLeftFoot.toeBend, wBlend),
      };

      // 2. Upright pelvis bob, spine lean & chest arch
      const stepPhase = (cycle * 2) % 1;
      const walkPelvisBob = Math.cos((stepPhase - 0.02) * Math.PI * 2) * 1.8 - 0.6;
      const runPelvisBob = Math.sin((stepPhase - 0.04) * Math.PI * 2) * 4.5;
      const idleBreathBob = Math.sin(state.breathTimer * 2.2) * 0.8;
      const pelvisOffsetY = lerp(
        idleBreathBob,
        lerp(walkPelvisBob, runPelvisBob, rBlend),
        wBlend
      );

      const torsoLean =
        lerp(-0.01, lerp(0.058, 0.13, rBlend), wBlend) + pl.accelTilt * 0.04;
      const chestArch = lerp(-0.01, lerp(0.014, 0.035, rBlend), wBlend);

      // 3. Running arms blended into upright standing arms & speaking hand/head gestures
      const walkArmWave = Math.cos(pl.walkArmCycle * Math.PI * 2);
      const walkElbowLagWave = Math.cos((pl.walkArmCycle - 0.09) * Math.PI * 2);
      const walkWristLagWave = Math.sin((pl.walkArmCycle - 0.14) * Math.PI * 2);

      const runArmWave = Math.cos(cycle * Math.PI * 2);
      const runElbowLagWave = Math.cos((cycle - 0.09) * Math.PI * 2);
      const runWristLagWave = Math.sin((cycle - 0.14) * Math.PI * 2);

      const walkRightArmUpper = -0.29 * walkArmWave + 0.08;
      const walkRightArmElbow =
        0.26 + smoothstep(-0.7, 0.9, -walkElbowLagWave) * 0.28;
      const walkLeftArmUpper = 0.29 * walkArmWave + 0.08;
      const walkLeftArmElbow =
        0.26 + smoothstep(-0.7, 0.9, walkElbowLagWave) * 0.28;

      const runRightArmUpper = -0.82 * runArmWave - 0.08;
      const runRightArmElbow = 1.02 + Math.max(0, -runElbowLagWave) * 0.36;
      const runLeftArmUpper = 0.82 * runArmWave - 0.08;
      const runLeftArmElbow = 1.02 + Math.max(0, runElbowLagWave) * 0.36;

      const idleBreathArm = Math.sin(state.breathTimer * 2.2) * 0.018;

      let rightArmUpper = lerp(
        0.14 + idleBreathArm,
        lerp(walkRightArmUpper, runRightArmUpper, rBlend),
        wBlend
      );
      let rightArmElbow = lerp(
        0.48,
        lerp(walkRightArmElbow, runRightArmElbow, rBlend),
        wBlend
      );
      let leftArmUpper = lerp(
        0.22 - idleBreathArm,
        lerp(walkLeftArmUpper, runLeftArmUpper, rBlend),
        wBlend
      );
      let leftArmElbow = lerp(
        0.54,
        lerp(walkLeftArmElbow, runLeftArmElbow, rBlend),
        wBlend
      );

      const activeWristWave = lerp(walkWristLagWave, runWristLagWave, rBlend);
      let rightWristPitch = lerp(
        0.03,
        activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      let leftWristPitch = lerp(
        0.03,
        -activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      const handFistBlend = rBlend * wBlend;

      let targetWorldHeadAngle = 0.01 + lerp(0.015, 0.03, rBlend) * wBlend;

      // Smoothly blend in upright speaking hand/arm & head gestures when Pliable speaks
      if (tBlend > 0.001) {
        const talkRightUpper = 0.28 + Math.sin(tTalk * 6.4) * 0.075;
        const talkRightElbow = 0.72 + Math.cos(tTalk * 7.6) * 0.105;
        const talkLeftUpper = 0.25 - Math.sin(tTalk * 5.8 + 0.5) * 0.065;
        const talkLeftElbow = 0.66 + Math.sin(tTalk * 7.0) * 0.09;
        const talkRightWrist = 0.06 + Math.sin(tTalk * 8.4) * 0.06;
        const talkLeftWrist = 0.05 + Math.cos(tTalk * 7.8) * 0.05;
        const talkHeadAngle =
          0.04 + Math.sin(tTalk * 8.4) * 0.06 + Math.cos(tTalk * 5.4) * 0.032;

        const activeTalkWeight = tBlend * (1 - wBlend);
        rightArmUpper = lerp(rightArmUpper, talkRightUpper, activeTalkWeight);
        rightArmElbow = lerp(rightArmElbow, talkRightElbow, activeTalkWeight);
        leftArmUpper = lerp(leftArmUpper, talkLeftUpper, activeTalkWeight);
        leftArmElbow = lerp(leftArmElbow, talkLeftElbow, activeTalkWeight);
        rightWristPitch = lerp(rightWristPitch, talkRightWrist, activeTalkWeight);
        leftWristPitch = lerp(leftWristPitch, talkLeftWrist, activeTalkWeight);
        targetWorldHeadAngle = lerp(
          targetWorldHeadAngle,
          talkHeadAngle,
          activeTalkWeight
        );
      }

      // 4. Analytical 2-bone leg IK
      const THIGH_LEN = 54;
      const SHIN_LEN = 53;
      const baseHipX = -3.0;
      const baseHipY = -113.5 + pelvisOffsetY;
      const hipSwingX = Math.cos(cycle * Math.PI * 2) * 6.8 * wBlend;
      const rightHipX = baseHipX + 1.5 + hipSwingX;
      const leftHipX = baseHipX - 2.5 - hipSwingX;

      const rightLegJoints = solveLegIK(
        rightHipX,
        baseHipY,
        rightFoot.ankleX,
        rightFoot.ankleY,
        THIGH_LEN,
        SHIN_LEN
      );
      const leftLegJoints = solveLegIK(
        leftHipX,
        baseHipY,
        leftFoot.ankleX,
        leftFoot.ankleY,
        THIGH_LEN,
        SHIN_LEN
      );

      const shoulderForwardOffset = lerp(4.8, 5.0, rBlend);
      const shoulderHeightOffset = lerp(68, 69, rBlend);
      const shoulderWorldX =
        baseHipX +
        shoulderForwardOffset +
        Math.sin(torsoLean + chestArch * 0.5) * shoulderHeightOffset;
      const shoulderWorldY =
        baseHipY - Math.cos(torsoLean + chestArch * 0.5) * shoulderHeightOffset;

      const walkShoulderSwing = -walkArmWave * 2.0 * wBlend;
      const runShoulderSwing = -hipSwingX * 0.9;
      const activeShoulderSwing = lerp(
        walkShoulderSwing,
        runShoulderSwing,
        rBlend
      );
      const leftShoulderX = shoulderWorldX + 2 + activeShoulderSwing;
      const rightShoulderX = shoulderWorldX - 1 - activeShoulderSwing;

      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.scale(pl.facing * PLIABLE_SCALE, PLIABLE_SCALE);

      // Ground ink shadow under Pliable's boots
      ctx.fillStyle = 'rgba(16, 8, 4, 0.25)';
      ctx.beginPath();
      ctx.ellipse(-2, 3.5, 48, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- LAYER 1: BACK ARM & BACK LEG ---
      drawAnatomicalArm(
        leftShoulderX,
        shoulderWorldY,
        leftArmUpper,
        leftArmElbow,
        leftWristPitch,
        handFistBlend,
        BACK_LIMB_INK
      );
      drawAnatomicalLeg(
        leftLegJoints,
        leftFoot.footPitch,
        leftFoot.toeBend,
        BACK_LIMB_INK
      );

      // --- LAYER 2: TORSO, PELVIS & HEAD (No burden, smooth hair like Evangelist) ---
      ctx.save();
      ctx.translate(baseHipX + 2.0, baseHipY);
      ctx.rotate(torsoLean);

      // Solid Pelvis Core
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.ellipse(-1, -1, 14.5, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Clean Tall Articulated Torso & Collar (no burden)
      ctx.save();
      ctx.rotate(chestArch * 0.35);
      ctx.fillStyle = INK_COLOR;

      const coatSwing = pl.coatSway;
      ctx.beginPath();
      ctx.moveTo(-11.5, -85.5);
      ctx.bezierCurveTo(-19.5, -81.0, -25.2, -67.0, -24.0, -48.0);
      ctx.bezierCurveTo(
        -22.8,
        -29.0,
        -19.8,
        -10.0,
        -18.8 - coatSwing * 2.0,
        7.5 + coatSwing * 1.0
      );
      ctx.quadraticCurveTo(-16.0, 10.8, -10.5, 10.2);
      ctx.lineTo(9.0, 10);
      ctx.lineTo(16.5 - coatSwing * 2.5, 3.0 + coatSwing * 1.5);
      ctx.bezierCurveTo(15.5, -18, 16.2, -42, 16.0, -64);
      ctx.bezierCurveTo(16.0, -73, 15.2, -79, 11.5, -84);
      ctx.lineTo(-11.5, -85.5);
      ctx.closePath();
      ctx.fill();

      // --- HEAD & SMOOTH HAIR (like Evangelist) ---
      ctx.save();
      ctx.translate(0, -85);
      const localHeadRot =
        targetWorldHeadAngle - (torsoLean + chestArch * 0.35);
      ctx.rotate(localHeadRot);

      const hFlutter = pl.hairFlutter;
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.moveTo(-9.5, 4);
      ctx.lineTo(-12.0, -5);
      ctx.bezierCurveTo(-16.0, -12, -18.8, -19, -19.2, -27);
      ctx.bezierCurveTo(-20.2, -37, -15.2, -48, -5.0, -51.5);
      ctx.bezierCurveTo(3.5, -54.0, 12.8, -52.8, 18.2, -47.5);
      ctx.quadraticCurveTo(21.2 - hFlutter * 1.0, -45.0, 19.6, -40.5);
      ctx.quadraticCurveTo(21.8 - hFlutter * 1.0, -37.2, 19.0, -33.0);
      ctx.quadraticCurveTo(20.4 - hFlutter * 0.6, -30.0, 18.2, -26.8);
      ctx.lineTo(18.6, -24.2);
      ctx.quadraticCurveTo(17.4, -22.5, 19.2, -20.8);
      ctx.lineTo(24.0, -17.5);
      ctx.quadraticCurveTo(24.2, -15.6, 20.8, -15.2);
      ctx.lineTo(19.6, -14.8);
      ctx.lineTo(20.8, -12.8);
      ctx.lineTo(18.8, -11.5);
      ctx.lineTo(20.0, -9.6);
      ctx.quadraticCurveTo(18.6, -7.8, 19.5, -5.8);
      ctx.bezierCurveTo(19.8, -3.2, 16.5, -1.8, 11.5, -2.5);
      ctx.quadraticCurveTo(7.2, -3.0, 6.2, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // End Head
      ctx.restore(); // End Chest Arch
      ctx.restore(); // End Torso

      // --- LAYER 3: FRONT LEG & FRONT ARM ---
      drawAnatomicalLeg(
        rightLegJoints,
        rightFoot.footPitch,
        rightFoot.toeBend,
        INK_COLOR
      );
      drawAnatomicalArm(
        rightShoulderX,
        shoulderWorldY + 1,
        rightArmUpper,
        rightArmElbow,
        rightWristPitch,
        handFistBlend,
        INK_COLOR
      );

      ctx.restore();
    };

    /**
     * Draws Obstinate: just as tall as Christian, without a burden, with spiky hair like Christian's
     * but a tiny bit spikier. Runs onto the screen behind Pliable, stands upright, and moves both his
     * hands and head whenever he is speaking.
     */
    const drawObstinateCharacter = () => {
      const ob = endingScene.obstinate;
      if (!ob.visible) return;

      const INK_COLOR = '#0D0603';
      const BACK_LIMB_INK = '#130905';

      const wBlend = ob.walkBlend;
      const rBlend = ob.runBlend;
      const tBlend = ob.talkBlend;
      const cycle = ob.gaitCycle;
      const tTalk = endingScene.talkAnimTimer;

      // 1. Walk & Run IK foot targets & standing stance
      const walkRightFoot = computeWalkFootTarget(cycle);
      const walkLeftFoot = computeWalkFootTarget(cycle + 0.5);
      const runRightFoot = computeRunFootTarget(cycle);
      const runLeftFoot = computeRunFootTarget(cycle + 0.5);

      const movingRightFoot: LegIKTarget = {
        ankleX: lerp(walkRightFoot.ankleX, runRightFoot.ankleX, rBlend),
        ankleY: lerp(walkRightFoot.ankleY, runRightFoot.ankleY, rBlend),
        footPitch: lerp(walkRightFoot.footPitch, runRightFoot.footPitch, rBlend),
        toeBend: lerp(walkRightFoot.toeBend, runRightFoot.toeBend, rBlend),
      };
      const movingLeftFoot: LegIKTarget = {
        ankleX: lerp(walkLeftFoot.ankleX, runLeftFoot.ankleX, rBlend),
        ankleY: lerp(walkLeftFoot.ankleY, runLeftFoot.ankleY, rBlend),
        footPitch: lerp(walkLeftFoot.footPitch, runLeftFoot.footPitch, rBlend),
        toeBend: lerp(walkLeftFoot.toeBend, runLeftFoot.toeBend, rBlend),
      };

      const idleRightFoot: LegIKTarget = {
        ankleX: 10,
        ankleY: -11.5,
        footPitch: 0.0,
        toeBend: 0.0,
      };
      const idleLeftFoot: LegIKTarget = {
        ankleX: -24,
        ankleY: -11.5,
        footPitch: -0.05,
        toeBend: 0.05,
      };

      const rightFoot: LegIKTarget = {
        ankleX: lerp(idleRightFoot.ankleX, movingRightFoot.ankleX, wBlend),
        ankleY: lerp(idleRightFoot.ankleY, movingRightFoot.ankleY, wBlend),
        footPitch: lerp(idleRightFoot.footPitch, movingRightFoot.footPitch, wBlend),
        toeBend: lerp(idleRightFoot.toeBend, movingRightFoot.toeBend, wBlend),
      };
      const leftFoot: LegIKTarget = {
        ankleX: lerp(idleLeftFoot.ankleX, movingLeftFoot.ankleX, wBlend),
        ankleY: lerp(idleLeftFoot.ankleY, movingLeftFoot.ankleY, wBlend),
        footPitch: lerp(idleLeftFoot.footPitch, movingLeftFoot.footPitch, wBlend),
        toeBend: lerp(idleLeftFoot.toeBend, movingLeftFoot.toeBend, wBlend),
      };

      // 2. Upright pelvis bob, spine lean & chest arch
      const stepPhase = (cycle * 2) % 1;
      const walkPelvisBob = Math.cos((stepPhase - 0.02) * Math.PI * 2) * 1.8 - 0.6;
      const runPelvisBob = Math.sin((stepPhase - 0.04) * Math.PI * 2) * 4.5;
      const idleBreathBob = Math.sin(state.breathTimer * 2.2) * 0.8;
      const pelvisOffsetY = lerp(
        idleBreathBob,
        lerp(walkPelvisBob, runPelvisBob, rBlend),
        wBlend
      );

      const torsoLean =
        lerp(-0.01, lerp(0.058, 0.13, rBlend), wBlend) + ob.accelTilt * 0.04;
      const chestArch = lerp(-0.01, lerp(0.014, 0.035, rBlend), wBlend);

      // 3. Analytical 2-bone leg IK
      const THIGH_LEN = 54;
      const SHIN_LEN = 53;
      const baseHipX = -3.0;
      const baseHipY = -113.5 + pelvisOffsetY;
      const hipSwingX = Math.cos(cycle * Math.PI * 2) * 6.8 * wBlend;
      const rightHipX = baseHipX + 1.5 + hipSwingX;
      const leftHipX = baseHipX - 2.5 - hipSwingX;

      const rightLegJoints = solveLegIK(
        rightHipX,
        baseHipY,
        rightFoot.ankleX,
        rightFoot.ankleY,
        THIGH_LEN,
        SHIN_LEN
      );
      const leftLegJoints = solveLegIK(
        leftHipX,
        baseHipY,
        leftFoot.ankleX,
        leftFoot.ankleY,
        THIGH_LEN,
        SHIN_LEN
      );

      const shoulderForwardOffset = lerp(4.8, 5.0, rBlend);
      const shoulderHeightOffset = lerp(68, 69, rBlend);
      const shoulderWorldX =
        baseHipX +
        shoulderForwardOffset +
        Math.sin(torsoLean + chestArch * 0.5) * shoulderHeightOffset;
      const shoulderWorldY =
        baseHipY - Math.cos(torsoLean + chestArch * 0.5) * shoulderHeightOffset;

      const walkArmWave = Math.cos(ob.walkArmCycle * Math.PI * 2);
      const walkElbowLagWave = Math.cos((ob.walkArmCycle - 0.09) * Math.PI * 2);
      const walkWristLagWave = Math.sin((ob.walkArmCycle - 0.14) * Math.PI * 2);

      const runArmWave = Math.cos(cycle * Math.PI * 2);
      const runElbowLagWave = Math.cos((cycle - 0.09) * Math.PI * 2);
      const runWristLagWave = Math.sin((cycle - 0.14) * Math.PI * 2);

      const walkShoulderSwing = -walkArmWave * 2.0 * wBlend;
      const runShoulderSwing = -hipSwingX * 0.9;
      const activeShoulderSwing = lerp(
        walkShoulderSwing,
        runShoulderSwing,
        rBlend
      );
      const leftShoulderX = shoulderWorldX + 2 + activeShoulderSwing;
      const rightShoulderX = shoulderWorldX - 1 - activeShoulderSwing;

      // 4. Arm kinematics: running arm swing blended into upright standing arms & speaking hand/head gestures
      const walkRightArmUpper = -0.29 * walkArmWave + 0.08;
      const walkRightArmElbow =
        0.26 + smoothstep(-0.7, 0.9, -walkElbowLagWave) * 0.28;
      const walkLeftArmUpper = 0.29 * walkArmWave + 0.08;
      const walkLeftArmElbow =
        0.26 + smoothstep(-0.7, 0.9, walkElbowLagWave) * 0.28;

      const runRightArmUpper = -0.82 * runArmWave - 0.08;
      const runRightArmElbow = 1.02 + Math.max(0, -runElbowLagWave) * 0.36;
      const runLeftArmUpper = 0.82 * runArmWave - 0.08;
      const runLeftArmElbow = 1.02 + Math.max(0, runElbowLagWave) * 0.36;

      const idleBreathArm = Math.sin(state.breathTimer * 2.2) * 0.018;

      let rightArmUpper = lerp(
        0.14 + idleBreathArm,
        lerp(walkRightArmUpper, runRightArmUpper, rBlend),
        wBlend
      );
      let rightArmElbow = lerp(
        0.48,
        lerp(walkRightArmElbow, runRightArmElbow, rBlend),
        wBlend
      );
      let leftArmUpper = lerp(
        0.22 - idleBreathArm,
        lerp(walkLeftArmUpper, runLeftArmUpper, rBlend),
        wBlend
      );
      let leftArmElbow = lerp(
        0.54,
        lerp(walkLeftArmElbow, runLeftArmElbow, rBlend),
        wBlend
      );

      const activeWristWave = lerp(walkWristLagWave, runWristLagWave, rBlend);
      let rightWristPitch = lerp(
        0.03,
        activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      let leftWristPitch = lerp(
        0.03,
        -activeWristWave * (0.07 + rBlend * 0.07),
        wBlend
      );
      const handFistBlend = rBlend * wBlend;

      let targetWorldHeadAngle = 0.01 + lerp(0.015, 0.03, rBlend) * wBlend;

      // Smoothly blend in upright speaking hand/arm & head gestures when Obstinate speaks
      if (tBlend > 0.001) {
        const talkRightUpper = 0.3 + Math.sin(tTalk * 6.8) * 0.08;
        const talkRightElbow = 0.74 + Math.cos(tTalk * 8.0) * 0.11;
        const talkLeftUpper = 0.26 - Math.sin(tTalk * 6.0 + 0.6) * 0.07;
        const talkLeftElbow = 0.68 + Math.sin(tTalk * 7.2) * 0.095;
        const talkRightWrist = 0.06 + Math.sin(tTalk * 8.6) * 0.065;
        const talkLeftWrist = 0.05 + Math.cos(tTalk * 8.0) * 0.055;
        const talkHeadAngle =
          0.04 + Math.sin(tTalk * 8.6) * 0.065 + Math.cos(tTalk * 5.6) * 0.035;

        const activeTalkWeight = tBlend * (1 - wBlend);
        rightArmUpper = lerp(rightArmUpper, talkRightUpper, activeTalkWeight);
        rightArmElbow = lerp(rightArmElbow, talkRightElbow, activeTalkWeight);
        leftArmUpper = lerp(leftArmUpper, talkLeftUpper, activeTalkWeight);
        leftArmElbow = lerp(leftArmElbow, talkLeftElbow, activeTalkWeight);
        rightWristPitch = lerp(rightWristPitch, talkRightWrist, activeTalkWeight);
        leftWristPitch = lerp(leftWristPitch, talkLeftWrist, activeTalkWeight);
        targetWorldHeadAngle = lerp(
          targetWorldHeadAngle,
          talkHeadAngle,
          activeTalkWeight
        );
      }

      ctx.save();
      ctx.translate(ob.x, ob.y);
      ctx.scale(ob.facing * CHAR_SCALE, CHAR_SCALE);

      // Ground ink shadow under Obstinate's boots
      ctx.fillStyle = 'rgba(16, 8, 4, 0.25)';
      ctx.beginPath();
      ctx.ellipse(-2, 3.5, 48, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- LAYER 1: BACK ARM & BACK LEG ---
      drawAnatomicalArm(
        leftShoulderX,
        shoulderWorldY,
        leftArmUpper,
        leftArmElbow,
        leftWristPitch,
        handFistBlend,
        BACK_LIMB_INK
      );
      drawAnatomicalLeg(
        leftLegJoints,
        leftFoot.footPitch,
        leftFoot.toeBend,
        BACK_LIMB_INK
      );

      // --- LAYER 2: TORSO, PELVIS & HEAD (No burden, spiky hair like Christian's but a tiny bit spikier!) ---
      ctx.save();
      ctx.translate(baseHipX + 2.0, baseHipY);
      ctx.rotate(torsoLean);

      // Solid Pelvis Core
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.ellipse(-1, -1, 14.5, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Clean Tall Articulated Torso & Collar (no burden)
      ctx.save();
      ctx.rotate(chestArch * 0.35);
      ctx.fillStyle = INK_COLOR;

      const coatSwing = ob.coatSway;
      ctx.beginPath();
      ctx.moveTo(-11.5, -85.5);
      ctx.bezierCurveTo(-19.5, -81.0, -25.2, -67.0, -24.0, -48.0);
      ctx.bezierCurveTo(
        -22.8,
        -29.0,
        -19.8,
        -10.0,
        -18.8 - coatSwing * 2.0,
        7.5 + coatSwing * 1.0
      );
      ctx.quadraticCurveTo(-16.0, 10.8, -10.5, 10.2);
      ctx.lineTo(9.0, 10);
      ctx.lineTo(16.5 - coatSwing * 2.5, 3.0 + coatSwing * 1.5);
      ctx.bezierCurveTo(15.5, -18, 16.2, -42, 16.0, -64);
      ctx.bezierCurveTo(16.0, -73, 15.2, -79, 11.5, -84);
      ctx.lineTo(-11.5, -85.5);
      ctx.closePath();
      ctx.fill();

      // --- HEAD & EXTRA-SPIKY HAIR (like Christian's spiky hair, but a tiny bit spikier!) ---
      ctx.save();
      ctx.translate(0, -85);
      const localHeadRot =
        targetWorldHeadAngle - (torsoLean + chestArch * 0.35);
      ctx.rotate(localHeadRot);

      const hFlutter = ob.hairFlutter;
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      // Nape of neck & sharper back hairline spike
      ctx.moveTo(-9.5, 4);
      ctx.lineTo(-11.8, -4);
      ctx.lineTo(-16.8, -6.5);
      ctx.lineTo(-13.2, -10);
      ctx.bezierCurveTo(-16.0, -14, -19.0, -19.5, -19.5, -26.5);
      // Back of cranium & extra-spiky crown locks
      ctx.bezierCurveTo(-21.0, -35, -17.2, -45, -9.0, -50);
      ctx.lineTo(-13.2 - hFlutter * 1.6, -55.0);
      ctx.lineTo(-5.5, -51.8);
      ctx.lineTo(-2.5 - hFlutter * 1.2, -57.2);
      ctx.lineTo(2.5, -53.0);
      ctx.bezierCurveTo(7.5, -55.5, 13.0, -54.8, 18.0, -50.2);

      // 6 sharp, extra-spiky front hair tufts over the brow (a tiny bit spikier than Christian's)
      ctx.lineTo(25.2 - hFlutter * 2.2, -55.5 + hFlutter * 1.0);
      ctx.lineTo(20.2, -47.8);
      ctx.lineTo(29.8 - hFlutter * 2.5, -49.6 + hFlutter * 1.2);
      ctx.lineTo(21.4, -42.5);
      ctx.lineTo(30.2 - hFlutter * 2.5, -41.5 + hFlutter * 1.2);
      ctx.lineTo(20.8, -36.0);
      ctx.lineTo(27.6 - hFlutter * 1.9, -34.2 + hFlutter * 1.0);
      ctx.lineTo(19.4, -30.8);
      ctx.lineTo(24.0 - hFlutter * 1.2, -29.0);
      ctx.lineTo(18.2, -26.8);

      // Forehead, brow ridge & deep-set eye bridge
      ctx.lineTo(18.6, -24.2);
      ctx.quadraticCurveTo(17.4, -22.5, 19.2, -20.8);
      // Pointed nose bridge & tip
      ctx.lineTo(24.0, -17.5);
      ctx.quadraticCurveTo(24.2, -15.6, 20.8, -15.2);
      // Nostril, philtrum, upper & lower lips
      ctx.lineTo(19.6, -14.8);
      ctx.lineTo(20.8, -12.8);
      ctx.lineTo(18.8, -11.5);
      ctx.lineTo(20.0, -9.6);
      // Chin & jawline
      ctx.quadraticCurveTo(18.6, -7.8, 19.5, -5.8);
      ctx.bezierCurveTo(19.8, -3.2, 16.5, -1.8, 11.5, -2.5);
      ctx.quadraticCurveTo(7.2, -3.0, 6.2, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // End Head
      ctx.restore(); // End Chest Arch
      ctx.restore(); // End Torso

      // --- LAYER 3: FRONT LEG & FRONT ARM ---
      drawAnatomicalLeg(
        rightLegJoints,
        rightFoot.footPitch,
        rightFoot.toeBend,
        INK_COLOR
      );
      drawAnatomicalArm(
        rightShoulderX,
        shoulderWorldY + 1,
        rightArmUpper,
        rightArmElbow,
        rightWristPitch,
        handFistBlend,
        INK_COLOR
      );

      ctx.restore();
    };

    /**
     * Draws Chapter 1 level obstacles: ink-black bubbling sludge / tar pits,
     * solid ink-black blocks, low belly-crawl barriers, stepping blocks, and wall-jump towers.
     */
    const drawChapterOneLevelElements = (now: number) => {
      if (!isChapterOne) return;

      const SOLID_INK = '#050201';

      // 1. Draw 17th-century solid ink-black heavy-timber gallows frames & braided swinging hemp ropes
      for (const frame of ropeGallowsFrames) {
        ctx.fillStyle = SOLID_INK;
        // Heavy left & right vertical timber support posts
        const postW = 24;
        ctx.fillRect(
          frame.leftPostX - postW * 0.5,
          frame.beamY - 24,
          postW,
          frame.leftPostBottomY - (frame.beamY - 24) + 4
        );
        ctx.fillRect(
          frame.rightPostX - postW * 0.5,
          frame.beamY - 24,
          postW,
          frame.rightPostBottomY - (frame.beamY - 24) + 4
        );

        // Sturdy timber post base plinths
        ctx.fillRect(frame.leftPostX - 22, frame.leftPostBottomY - 12, 44, 14);
        ctx.fillRect(frame.rightPostX - 22, frame.rightPostBottomY - 12, 44, 14);

        // Heavy overhead horizontal crossbeam with decorative chamfered cornice cap
        const beamH = 24;
        ctx.fillRect(
          frame.beamX1,
          frame.beamY - beamH,
          frame.beamX2 - frame.beamX1,
          beamH
        );
        ctx.fillRect(
          frame.beamX1 - 8,
          frame.beamY - beamH - 6,
          frame.beamX2 - frame.beamX1 + 16,
          7
        );

        // Thick diagonal mortise-and-tenon knee braces at both upper corners
        ctx.lineWidth = 15;
        ctx.strokeStyle = SOLID_INK;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(frame.leftPostX + 6, frame.beamY + 56);
        ctx.lineTo(frame.leftPostX + 62, frame.beamY - 4);
        ctx.moveTo(frame.rightPostX - 6, frame.beamY + 56);
        ctx.lineTo(frame.rightPostX - 62, frame.beamY - 4);
        ctx.stroke();
      }

      // Draw each Swinging Hemp Rope (flexible, wavy braided hemp curve with no bottom knot ball)
      const nowSec = now * 0.001;
      for (let rIdx = 0; rIdx < swingingRopes.length; rIdx++) {
        const rope = swingingRopes[rIdx];
        const grabbedDist =
          state.ropeGrab.active && state.ropeGrab.ropeIndex === rIdx
            ? state.ropeGrab.grabDist
            : null;

        // Forged iron mounting bracket & ring on the underside of the crossbeam
        ctx.fillStyle = SOLID_INK;
        ctx.fillRect(rope.pivotX - 9, rope.pivotY - 18, 18, 12);
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = SOLID_INK;
        ctx.beginPath();
        ctx.arc(rope.pivotX, rope.pivotY - 2, 7.5, 0, Math.PI * 2);
        ctx.stroke();

        // Sample the flexible, wavy rope curve from top ring (0) to bottom tip (rope.length)
        const numSegments = 28;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= numSegments; i++) {
          const d = (i / numSegments) * rope.length;
          pts.push(getRopePointAtDist(rope, d, nowSec, grabbedDist));
        }

        // Main flexible braided hemp rope body
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 7.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const midX = (prev.x + curr.x) * 0.5;
          const midY = (prev.y + curr.y) * 0.5;
          if (i === 1) {
            ctx.lineTo(midX, midY);
          } else {
            ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
          }
        }
        const lastPt = pts[pts.length - 1];
        ctx.lineTo(lastPt.x, lastPt.y);
        ctx.stroke();

        // Subtle parchment-ink twisted strand ticks oriented along the local tangent of the wavy rope
        ctx.strokeStyle = 'rgba(235, 214, 168, 0.28)';
        ctx.lineWidth = 1.5;
        const strandSteps = 20;
        for (let s = 1; s < strandSteps; s++) {
          const d = (s / strandSteps) * rope.length;
          const p0 = getRopePointAtDist(rope, Math.max(0, d - 6), nowSec, grabbedDist);
          const p1 = getRopePointAtDist(
            rope,
            Math.min(rope.length, d + 6),
            nowSec,
            grabbedDist
          );
          const pc = getRopePointAtDist(rope, d, nowSec, grabbedDist);
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const tx = dx / len;
          const ty = dy / len;
          const nx = ty;
          const ny = -tx;
          ctx.beginPath();
          ctx.moveTo(pc.x - nx * 3.1 - tx * 1.6, pc.y - ny * 3.1 - ty * 1.6);
          ctx.lineTo(pc.x + nx * 3.1 + tx * 1.6, pc.y + ny * 3.1 + ty * 1.6);
          ctx.stroke();
        }
      }

      // 2. Draw all level obstacles:
      //    - Keep all grass-standing blocks even with the grass (bottomY = GROUND_Y) so they never go below the grass
      //    - Extend obstacle barriers/blocks inside tar pits below the tar surface (GROUND_Y + 55) so the tar pit covers their bottom
      //    - Render connected/touching blocks as a single unified piece without internal outline seams!
      const renderBlocks = levelBlocks.map((b) => {
        const insideTarPit =
          b.bottomY >= GROUND_Y - 100 &&
          sludgePits.some(
            (pit) => b.x1 >= pit.x1 - 4 && b.x2 <= pit.x2 + 4
          );
        const onGrassGround = !insideTarPit && b.bottomY >= GROUND_Y - 4;
        return {
          x1: b.x1,
          x2: b.x2,
          topY: b.topY,
          bottomY: insideTarPit
            ? Math.max(b.bottomY, GROUND_Y + 55)
            : onGrassGround
            ? GROUND_Y
            : b.bottomY,
        };
      });

      const subtractIntervals = (
        baseStart: number,
        baseEnd: number,
        cuts: { s: number; e: number }[]
      ): { s: number; e: number }[] => {
        let segs = [{ s: baseStart, e: baseEnd }];
        for (const cut of cuts) {
          const next: { s: number; e: number }[] = [];
          for (const seg of segs) {
            if (cut.e <= seg.s || cut.s >= seg.e) {
              next.push(seg);
            } else {
              if (cut.s > seg.s) next.push({ s: seg.s, e: cut.s });
              if (cut.e < seg.e) next.push({ s: cut.e, e: seg.e });
            }
          }
          segs = next;
          if (segs.length === 0) break;
        }
        return segs;
      };

      // 2A. Unified non-overlapping interior fill via vertical strip decomposition
      ctx.fillStyle = 'rgba(22, 16, 13, 0.56)';
      const xCoordsSet = new Set<number>();
      for (const b of renderBlocks) {
        xCoordsSet.add(b.x1);
        xCoordsSet.add(b.x2);
      }
      const xCoords = Array.from(xCoordsSet).sort((a, b) => a - b);
      for (let xi = 0; xi < xCoords.length - 1; xi++) {
        const sx1 = xCoords[xi];
        const sx2 = xCoords[xi + 1];
        if (sx2 <= sx1) continue;
        const midX = (sx1 + sx2) * 0.5;
        const yIntervals: { y1: number; y2: number }[] = [];
        for (const b of renderBlocks) {
          if (b.x1 <= midX && b.x2 >= midX) {
            yIntervals.push({ y1: b.topY, y2: b.bottomY });
          }
        }
        if (yIntervals.length === 0) continue;
        yIntervals.sort((a, b) => a.y1 - b.y1);
        let curY1 = yIntervals[0].y1;
        let curY2 = yIntervals[0].y2;
        for (let yi = 1; yi < yIntervals.length; yi++) {
          const iv = yIntervals[yi];
          if (iv.y1 <= curY2 + 0.5) {
            curY2 = Math.max(curY2, iv.y2);
          } else {
            ctx.fillRect(sx1, curY1, sx2 - sx1, curY2 - curY1);
            curY1 = iv.y1;
            curY2 = iv.y2;
          }
        }
        ctx.fillRect(sx1, curY1, sx2 - sx1, curY2 - curY1);
      }

      // 2B. Unified outer-perimeter outline (shared/touching edges between connected blocks are omitted!)
      ctx.strokeStyle = SOLID_INK;
      ctx.lineWidth = 8;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      const edgeEps = 1.5;
      for (let i = 0; i < renderBlocks.length; i++) {
        const b = renderBlocks[i];
        const topCuts: { s: number; e: number }[] = [];
        const bottomCuts: { s: number; e: number }[] = [];
        const leftCuts: { s: number; e: number }[] = [];
        const rightCuts: { s: number; e: number }[] = [];

        for (let j = 0; j < renderBlocks.length; j++) {
          if (i === j) continue;
          const o = renderBlocks[j];

          // Top edge of b (y = b.topY, x in [b.x1, b.x2]) covered or touched by o
          if (o.topY <= b.topY + edgeEps && o.bottomY >= b.topY - edgeEps) {
            const ox1 = Math.max(b.x1, o.x1);
            const ox2 = Math.min(b.x2, o.x2);
            if (ox2 > ox1) topCuts.push({ s: ox1, e: ox2 });
          }
          // Bottom edge of b (y = b.bottomY, x in [b.x1, b.x2]) covered or touched by o
          if (o.topY <= b.bottomY + edgeEps && o.bottomY >= b.bottomY - edgeEps) {
            const ox1 = Math.max(b.x1, o.x1);
            const ox2 = Math.min(b.x2, o.x2);
            if (ox2 > ox1) bottomCuts.push({ s: ox1, e: ox2 });
          }
          // Left edge of b (x = b.x1, y in [b.topY, b.bottomY]) covered or touched by o
          if (o.x1 <= b.x1 + edgeEps && o.x2 >= b.x1 - edgeEps) {
            const oy1 = Math.max(b.topY, o.topY);
            const oy2 = Math.min(b.bottomY, o.bottomY);
            if (oy2 > oy1) leftCuts.push({ s: oy1, e: oy2 });
          }
          // Right edge of b (x = b.x2, y in [b.topY, b.bottomY]) covered or touched by o
          if (o.x1 <= b.x2 + edgeEps && o.x2 >= b.x2 - edgeEps) {
            const oy1 = Math.max(b.topY, o.topY);
            const oy2 = Math.min(b.bottomY, o.bottomY);
            if (oy2 > oy1) rightCuts.push({ s: oy1, e: oy2 });
          }
        }

        for (const seg of subtractIntervals(b.x1, b.x2, topCuts)) {
          ctx.moveTo(seg.s, b.topY);
          ctx.lineTo(seg.e, b.topY);
        }
        for (const seg of subtractIntervals(b.x1, b.x2, bottomCuts)) {
          ctx.moveTo(seg.s, b.bottomY);
          ctx.lineTo(seg.e, b.bottomY);
        }
        for (const seg of subtractIntervals(b.topY, b.bottomY, leftCuts)) {
          ctx.moveTo(b.x1, seg.s);
          ctx.lineTo(b.x1, seg.e);
        }
        for (const seg of subtractIntervals(b.topY, b.bottomY, rightCuts)) {
          ctx.moveTo(b.x2, seg.s);
          ctx.lineTo(b.x2, seg.e);
        }
      }
      ctx.stroke();

      // 3. Draw recessed Ink-Black Sludge / Tar Pits over the submerged bases of obstacle blocks
      for (let pIdx = 0; pIdx < sludgePits.length; pIdx++) {
        const pit = sludgePits[pIdx];
        const pw = pit.x2 - pit.x1;
        const sloughSurfaceY = GROUND_Y + 14;

        // Recessed earthen pit banks on left and right edges with dripping black tar lips
        ctx.fillStyle = SOLID_INK;
        ctx.fillRect(pit.x1 - 7, GROUND_Y - 2, 11, H + 95 - GROUND_Y);
        ctx.fillRect(pit.x2 - 4, GROUND_Y - 2, 11, H + 95 - GROUND_Y);

        // Viscous undulating ink-black tar pit body
        ctx.beginPath();
        ctx.moveTo(pit.x1 - 4, H + 95);
        ctx.lineTo(pit.x1 - 4, sloughSurfaceY);
        for (let x = pit.x1; x <= pit.x2; x += 14) {
          const wave =
            Math.sin(x * 0.032 + now * 0.0024 + pIdx * 1.7) * 3.8 +
            Math.cos(x * 0.068 - now * 0.0018 + pIdx) * 2.2;
          ctx.lineTo(x, sloughSurfaceY + wave);
        }
        ctx.lineTo(pit.x2 + 4, sloughSurfaceY);
        ctx.lineTo(pit.x2 + 4, H + 95);
        ctx.closePath();
        ctx.fill();

        // Thick tar tendrils clinging to the left & right pit rims
        for (let side = 0; side < 2; side++) {
          const edgeX = side === 0 ? pit.x1 + 4 : pit.x2 - 4;
          const dir = side === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(edgeX, GROUND_Y);
          ctx.quadraticCurveTo(
            edgeX + dir * 16,
            GROUND_Y + 6,
            edgeX + dir * 6,
            sloughSurfaceY + 10
          );
          ctx.lineTo(edgeX, sloughSurfaceY + 10);
          ctx.closePath();
          ctx.fill();
        }

        // Animated rising & swelling ink-black tar bubbles across the sludge surface
        const bubbleCount = Math.max(4, Math.floor(pw / 55));
        for (let b = 0; b < bubbleCount; b++) {
          const seed = (pIdx + 1) * 97 + b * 53;
          const cycleSpeed = 0.00055 + (seed % 7) * 0.00009;
          const phase = (now * cycleSpeed + seed * 0.17) % 1;
          const bx =
            pit.x1 +
            26 +
            (((seed * 193) % Math.max(40, pw - 52)) +
              Math.sin(now * 0.0012 + seed) * 8);
          const surfaceWaveAtX =
            Math.sin(bx * 0.032 + now * 0.0024 + pIdx * 1.7) * 3.8 +
            Math.cos(bx * 0.068 - now * 0.0018 + pIdx) * 2.2;
          const baseBubbleY = sloughSurfaceY + surfaceWaveAtX;

          if (phase < 0.82) {
            // Swelling viscous tar dome rising out of the black sludge
            const grow = smoothstep(0, 0.82, phase);
            const r = (5.5 + (seed % 6) * 1.8) * Math.sin(grow * Math.PI * 0.65);
            const by = baseBubbleY + 3 - grow * 5.5;

            ctx.fillStyle = SOLID_INK;
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fill();

            // Subtle parchment-ink specular arc on the upper dome so the tar bubble reads clearly
            if (r > 3.5) {
              ctx.strokeStyle = 'rgba(235, 214, 168, 0.22)';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.arc(bx, by, r * 0.72, Math.PI * 1.12, Math.PI * 1.78);
              ctx.stroke();
            }
          } else {
            // Popping tar ring & ink droplets
            const popT = (phase - 0.82) / 0.18;
            const ringR = (7 + (seed % 6) * 1.8) * (0.8 + popT * 0.75);
            ctx.strokeStyle = `rgba(5, 2, 1, ${1 - popT})`;
            ctx.lineWidth = 2.0 * (1 - popT);
            ctx.beginPath();
            ctx.ellipse(
              bx,
              baseBubbleY - 1,
              ringR,
              ringR * 0.35,
              0,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
        }
      }

      // 3B. Draw High-Altitude Collapsing Platforms ("1 Mississippi" -> Shake -> Fall) styled like normal obstacles with a downward arrow inside
      for (const plat of collapsingPlatforms) {
        if (plat.currentY > GROUND_Y + 90) continue;
        const pw = plat.x2 - plat.x1;
        const ph = 38;
        const cx = (plat.x1 + plat.x2) * 0.5 + plat.shakeOffsetX;
        const cy = plat.currentY + ph * 0.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(plat.shakeAngle);

        // Transparent blackish-gray interior matching normal obstacle blocks
        ctx.fillStyle = 'rgba(22, 16, 13, 0.56)';
        ctx.fillRect(-pw * 0.5, -ph * 0.5, pw, ph);

        // Solid ink-black thick outline matching normal obstacle blocks
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 8;
        ctx.lineJoin = 'miter';
        ctx.strokeRect(-pw * 0.5, -ph * 0.5, pw, ph);

        // Downward-pointing arrow inside the obstacle so players know it will fall
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        // Vertical arrow shaft
        ctx.moveTo(0, -10.5);
        ctx.lineTo(0, 10.5);
        // Downward arrowhead chevron
        ctx.moveTo(-8.5, 2.5);
        ctx.lineTo(0, 11);
        ctx.lineTo(8.5, 2.5);
        ctx.stroke();

        ctx.restore();
      }

      // 3C. Draw Back-and-Forth Horizontal Moving Platforms styled like normal obstacles with a <--> arrow inside (no guide bar underneath)
      for (const plat of movingPlatforms) {
        const pw = plat.width;
        const ph = 38;
        const halfW = pw * 0.5;
        const cy = plat.y + ph * 0.5;

        ctx.save();

        // Transparent blackish-gray interior matching normal obstacle blocks
        ctx.fillStyle = 'rgba(22, 16, 13, 0.56)';
        ctx.fillRect(plat.x - halfW, plat.y, pw, ph);

        // Solid ink-black thick outline matching normal obstacle blocks
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 8;
        ctx.lineJoin = 'miter';
        ctx.strokeRect(plat.x - halfW, plat.y, pw, ph);

        // Double-headed horizontal arrow (<-->) inside the moving platform
        const arrowHalfSpan = Math.min(48, pw * 0.26);
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        // Horizontal shaft
        ctx.moveTo(plat.x - arrowHalfSpan, cy);
        ctx.lineTo(plat.x + arrowHalfSpan, cy);
        // Left arrowhead (<)
        ctx.moveTo(plat.x - arrowHalfSpan + 8.5, cy - 7.5);
        ctx.lineTo(plat.x - arrowHalfSpan, cy);
        ctx.lineTo(plat.x - arrowHalfSpan + 8.5, cy + 7.5);
        // Right arrowhead (>)
        ctx.moveTo(plat.x + arrowHalfSpan - 8.5, cy - 7.5);
        ctx.lineTo(plat.x + arrowHalfSpan, cy);
        ctx.lineTo(plat.x + arrowHalfSpan - 8.5, cy + 7.5);
        ctx.stroke();

        ctx.restore();
      }

      // 6. Draw Simple Character-Height Doors (height = STANDING_H = 210px), 3 Keys (1 per Door Dimension), & Final City Exit Gate
      const viewLeft = state.cameraX - 200;
      const viewRight = state.cameraX + W + 200;

      // 6A. Simple Character-Height Doors (only as tall as Christian: 210px tall, 88px wide)
      for (const door of courseDoors) {
        if (door.dimension !== state.currentDimension) continue;
        if (door.x < viewLeft - 140 || door.x > viewRight + 140) continue;

        const doorW = 88;
        const doorH = STANDING_H; // 210px — exact height of Christian!
        const doorLeft = door.x - doorW * 0.5;
        const doorTop = door.y - doorH;
        const isOpening =
          state.doorTransition.phase === 'WALK_AND_FADE_OUT' &&
          state.doorTransition.activeDoorId === door.id
            ? state.doorTransition.openBlend
            : 0;
        const keyCollected =
          chapterKeys.find((k) => k.id === door.keyId)?.collected ?? false;

        ctx.save();

        // Dark threshold interior behind the wooden door leaf
        ctx.fillStyle = '#040100';
        ctx.fillRect(doorLeft, doorTop, doorW, doorH);

        // Simple wooden door leaf (swings inward as Christian walks into it)
        const leafW = Math.max(14, doorW * (1 - isOpening * 0.72));
        ctx.fillStyle = keyCollected
          ? 'rgba(54, 38, 24, 0.86)'
          : 'rgba(34, 22, 14, 0.92)';
        ctx.fillRect(doorLeft, doorTop, leafW, doorH);

        // Simple vertical timber plank lines on the door leaf
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 2.5;
        for (let p = 1; p <= 2; p++) {
          const px = doorLeft + (leafW * p) / 3;
          ctx.beginPath();
          ctx.moveTo(px, doorTop + 4);
          ctx.lineTo(px, door.y - 4);
          ctx.stroke();
        }

        // Two simple horizontal iron hinge straps on the left edge
        ctx.fillStyle = SOLID_INK;
        ctx.fillRect(doorLeft + 2, doorTop + 34, Math.min(22, leafW * 0.35), 6);
        ctx.fillRect(doorLeft + 2, door.y - 46, Math.min(22, leafW * 0.35), 6);

        // Simple round doorknob on the right side of the door leaf
        if (leafW > 28) {
          const knobX = doorLeft + leafW - 15;
          const knobY = door.y - 98;
          ctx.fillStyle = '#e6cf9e';
          ctx.beginPath();
          ctx.arc(knobX, knobY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = SOLID_INK;
          ctx.stroke();
        }

        // Outer solid ink door frame (same height as Christian)
        ctx.strokeStyle = SOLID_INK;
        ctx.lineWidth = 7;
        ctx.lineJoin = 'miter';
        ctx.strokeRect(doorLeft, doorTop, doorW, doorH);

        ctx.restore();
      }

      // 6B. Draw Black Silhouette Key (each Door Dimension 1, 2, 3 has 1 Key)
      for (const k of chapterKeys) {
        if (k.dimension !== state.currentDimension) continue;
        if (k.x < viewLeft - 160 || k.x > viewRight + 160) continue;

        if (k.collected) {
          if (k.collectAnim > 0.01) {
            ctx.save();
            ctx.translate(k.x, k.y);
            const burstProgress = 1 - k.collectAnim;
            const ringR = 18 + burstProgress * 58;
            ctx.strokeStyle = `rgba(10, 4, 2, ${k.collectAnim * 0.85})`;
            ctx.lineWidth = 3 * k.collectAnim;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();

            for (let r = 0; r < 8; r++) {
              const ang = (r / 8) * Math.PI * 2 + burstProgress * 0.6;
              const rIn = 12 + burstProgress * 30;
              const rOut = 26 + burstProgress * 68;
              ctx.beginPath();
              ctx.moveTo(Math.cos(ang) * rIn, Math.sin(ang) * rIn);
              ctx.lineTo(Math.cos(ang) * rOut, Math.sin(ang) * rOut);
              ctx.stroke();
            }
            ctx.restore();
          }
          continue;
        }

        const timeSec = now * 0.001;
        const bobY = Math.sin(timeSec * 3.1 + k.id * 1.9) * 7.5;
        const swayAngle = Math.sin(timeSec * 2.2 + k.id * 1.3) * 0.14;
        const pulseScale = 1 + Math.sin(timeSec * 4.2 + k.id) * 0.05;

        ctx.save();
        ctx.translate(k.x, k.y + bobY);

        // Subtle parchment contrast aura so the pure black silhouette key pops cleanly against woodcut backgrounds
        const haloGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 48 * pulseScale);
        haloGrad.addColorStop(0, 'rgba(252, 243, 220, 0.88)');
        haloGrad.addColorStop(0.55, 'rgba(242, 224, 186, 0.45)');
        haloGrad.addColorStop(1, 'rgba(242, 224, 186, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 48 * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Delicate orbiting ink motes
        ctx.fillStyle = '#040100';
        for (let m = 0; m < 4; m++) {
          const mAng = timeSec * 1.8 + (m * Math.PI) / 2 + k.id;
          const mx = Math.cos(mAng) * 32;
          const my = Math.sin(mAng) * 20;
          ctx.beginPath();
          ctx.arc(mx, my, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.rotate(swayAngle);
        ctx.scale(pulseScale, pulseScale);

        // Pure Black Silhouette 17th-Century Ornate Key
        ctx.fillStyle = '#040100';
        ctx.strokeStyle = '#040100';

        // Ornate Bow (Handle Ring) with trefoil finials
        ctx.beginPath();
        ctx.arc(0, -18, 12.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-11, -18, 4.5, 0, Math.PI * 2);
        ctx.arc(11, -18, 4.5, 0, Math.PI * 2);
        ctx.arc(0, -29, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Cutout inside the bow so it reads unmistakably as an antique key silhouette
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath();
        ctx.arc(0, -18, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#040100';
        ctx.beginPath();
        ctx.arc(0, -18, 2.1, 0, Math.PI * 2);
        ctx.fill();

        // Collar & Forged Stem (Shaft)
        ctx.fillRect(-5.5, -6, 11, 3.5);
        ctx.fillRect(-3.2, -3, 6.4, 33);
        ctx.fillRect(-5, 8, 10, 2.8);

        // Intricate Key Bit (Teeth / Wards) on right side
        ctx.fillRect(3, 15, 11, 4.2);
        ctx.fillRect(3, 21.5, 7.5, 3.2);
        ctx.fillRect(3, 26.5, 11.5, 4.2);
        ctx.fillRect(10.5, 15, 3.5, 15.7);

        // Pointed tip of key shaft
        ctx.beginPath();
        ctx.moveTo(-3.2, 30);
        ctx.lineTo(3.2, 30);
        ctx.lineTo(0, 34.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // 6C. Solid Black Rectangle Exit Barrier at x = 48456..48504 on the Main Course (dimension 0)
      // Flush against the right edge (x2 = 48456) of the final obstacle (Block 65) and extending from the top of the grass (GROUND_Y = 855) to the sky (-2000).
      // Disappears completely once all 3 keys are found.
      const gateLeftX = 48456;
      const gateW = 48;
      const gateRightX = gateLeftX + gateW; // 48504
      if (
        state.currentDimension === 0 &&
        gateRightX >= viewLeft - 240 &&
        gateLeftX <= viewRight + 240
      ) {
        const keysFound = chapterKeys.filter((k) => k.collected).length;
        if (keysFound < 3) {
          ctx.save();
          ctx.fillStyle = '#040100';
          ctx.fillRect(gateLeftX, -2000, gateW, GROUND_Y + 2000);
          ctx.restore();
        }
      }
    };

    const renderLoop = (now: number) => {
      if (pausedRef.current || state.completed || state.dead) {
        lastTime = now;
        keysHeld.left = false;
        keysHeld.right = false;
        keysHeld.up = false;
        keysHeld.jump = false;
        keysHeld.crouch = false;
        keysHeld.ropeDown = false;
        gamepadState.prevA = true;
        gamepadState.prevB = true;
        gamepadState.prevX = true;
        frameId = requestAnimationFrame(renderLoop);
        return;
      }

      const dt = Math.min(0.04, (now - lastTime) * 0.001);
      lastTime = now;
      const nowSec = now * 0.001;

      state.breathTimer += dt;
      if (state.wallJumpLockTimer > 0) {
        state.wallJumpLockTimer = Math.max(0, state.wallJumpLockTimer - dt);
      }
      if (state.wallPushOffTimer > 0) {
        state.wallPushOffTimer = Math.max(0, state.wallPushOffTimer - dt);
      }
      if (state.ropeGrab.cooldown > 0) {
        state.ropeGrab.cooldown = Math.max(0, state.ropeGrab.cooldown - dt);
      }

      // Update ungrabbed Swinging Hemp Ropes, High-Altitude Collapsing Platforms, Back-and-Forth Moving Platforms, Doors, and Keys
      if (isChapterOne) {
        warpToMissingKeyRef.current = () => {
          const nextMissing = chapterKeys.find((k) => !k.collected);
          if (nextMissing) {
            const entranceDoor = courseDoors.find(
              (d) => d.dimension === 0 && d.keyId === nextMissing.id
            );
            setActiveDimension(0);
            state.currentDimension = 0;
            state.x = entranceDoor
              ? entranceDoor.id === 'main-door-3'
                ? entranceDoor.x - 105
                : entranceDoor.x + 105
              : 6525;
            state.y = entranceDoor ? entranceDoor.y : GROUND_Y;
            state.vx = 0;
            state.vy = 0;
            state.onGround = true;
            state.ropeGrab.active = false;
            state.vault.active = false;
            state.cameraLeadDir = 1;
            state.cameraTurnAnchorX = state.x;
            state.cameraScreenOffsetX = 580;
            state.cameraX = clamp(state.x - 580, 0, Math.max(0, LEVEL_WIDTH - W));
            state.cameraY = state.y < 520 ? clamp(state.y - 520, -900, 0) : 0;
            setLockedGateWarning(false);
          }
        };

        // Update Door Transition (triggered by pressing Shift when near a door: walk to door -> fade to black -> switch course -> fade in)
        if (state.doorTransition.phase === 'WALK_AND_FADE_OUT') {
          state.doorTransition.openBlend = Math.min(
            1,
            state.doorTransition.openBlend + dt * 3.2
          );
          state.doorTransition.fadeAlpha = Math.min(
            1,
            state.doorTransition.fadeAlpha + dt * 1.95
          );
          if (
            state.doorTransition.fadeAlpha >= 1 &&
            Math.abs(state.x - state.doorTransition.doorX) <= 16
          ) {
            setActiveDimension(state.doorTransition.targetDimension);
            state.currentDimension = state.doorTransition.targetDimension;
            state.x = state.doorTransition.spawnX;
            state.y = state.doorTransition.spawnY;
            state.vx = 0;
            state.vy = 0;
            state.onGround = true;
            state.facing = 1;
            state.ropeGrab.active = false;
            state.vault.active = false;
            state.cameraLeadDir = 1;
            state.cameraTurnAnchorX = state.x;
            state.cameraScreenOffsetX = 580;
            state.cameraX = clamp(
              state.x - 580,
              0,
              Math.max(0, LEVEL_WIDTH - W)
            );
            state.cameraY = state.y < 520 ? clamp(state.y - 520, -900, 0) : 0;
            state.doorTransition.exitCooldownDoorId =
              state.doorTransition.targetDoorId;
            state.doorTransition.phase = 'FADE_IN';
            state.doorTransition.openBlend = 0;
          }
        } else if (state.doorTransition.phase === 'FADE_IN') {
          state.doorTransition.fadeAlpha = Math.max(
            0,
            state.doorTransition.fadeAlpha - dt * 2.2
          );
          if (state.doorTransition.fadeAlpha <= 0) {
            state.doorTransition.phase = 'NONE';
          }
        }

        // Check Black Silhouette Key collection inside the active Door Dimension
        for (const k of chapterKeys) {
          if (k.dimension !== state.currentDimension) continue;
          if (k.collected) {
            if (k.collectAnim > 0) {
              k.collectAnim = Math.max(0, k.collectAnim - dt * 1.8);
            }
            continue;
          }
          const pilgrimCenterY = state.y - 95;
          const distToKey = Math.hypot(state.x - k.x, pilgrimCenterY - k.y);
          if (distToKey <= 88) {
            k.collected = true;
            k.collectAnim = 1.0;
            soundFX.playPageTurn('next');
            const newCount = chapterKeys.filter((item) => item.collected).length;
            setCollectedKeysCount(newCount);
            if (newCount >= 3) {
              setLockedGateWarning(false);
            }
            spawnFootstepInkPuff(k.x, k.y, 14, 1.45);
          }
        }
        for (let rIdx = 0; rIdx < swingingRopes.length; rIdx++) {
          if (state.ropeGrab.active && state.ropeGrab.ropeIndex === rIdx) {
            continue;
          }
          const rope = swingingRopes[rIdx];
          if (
            Math.abs(rope.angle) > 0.0005 ||
            Math.abs(rope.angularVel) > 0.0005
          ) {
            const prevAngle = rope.angle;
            const gravRestore = -9.5 * Math.sin(rope.angle);
            rope.angularVel += (gravRestore - rope.angularVel * 0.95) * dt;
            rope.angle += rope.angularVel * dt;
            if (
              doesRopeOrPilgrimCollideWithBlock(rope, null, state.facing, nowSec)
            ) {
              rope.angle = prevAngle;
              rope.angularVel = -rope.angularVel * 0.25;
            }
            if (
              Math.abs(rope.angle) < 0.001 &&
              Math.abs(rope.angularVel) < 0.002
            ) {
              rope.angle = 0;
              rope.angularVel = 0;
            }
          }
        }

        // Update Back-and-Forth Horizontal Moving Platforms (move right -> move left -> back and forth)
        for (const mPlat of movingPlatforms) {
          mPlat.prevX = mPlat.x;
          if (mPlat.pauseTimer > 0) {
            mPlat.pauseTimer = Math.max(0, mPlat.pauseTimer - dt);
          } else {
            mPlat.x += mPlat.dir * mPlat.speed * dt;
            if (mPlat.x >= mPlat.maxX) {
              mPlat.x = mPlat.maxX;
              mPlat.dir = -1;
              mPlat.pauseTimer = 0.14;
            } else if (mPlat.x <= mPlat.minX) {
              mPlat.x = mPlat.minX;
              mPlat.dir = 1;
              mPlat.pauseTimer = 0.14;
            }
          }
          mPlat.deltaX = mPlat.x - mPlat.prevX;
          mPlat.wheelAngle += mPlat.deltaX * 0.095;
        }

        // If Christian is standing on a Back-and-Forth Moving Platform, carry him horizontally with the platform!
        if (
          state.onGround &&
          !state.ropeGrab.active &&
          !state.vault.active &&
          !state.sinking.active
        ) {
          for (const mPlat of movingPlatforms) {
            const halfW = mPlat.width * 0.5;
            if (
              state.x + CHAR_RADIUS_X * 0.75 >= mPlat.prevX - halfW &&
              state.x - CHAR_RADIUS_X * 0.75 <= mPlat.prevX + halfW &&
              Math.abs(state.y - mPlat.y) <= 8
            ) {
              state.x += mPlat.deltaX;
              break;
            }
          }
        }

        // Update High-Altitude Collapsing Platforms ("1 Mississippi" -> Shake -> Fall)
        for (const plat of collapsingPlatforms) {
          if (plat.state === 'IDLE') {
            plat.currentY = plat.baseY;
            plat.shakeOffsetX = 0;
            plat.shakeAngle = 0;
            // Check if Christian is currently standing on top of this platform
            if (
              state.onGround &&
              !state.ropeGrab.active &&
              !state.vault.active &&
              state.x + CHAR_RADIUS_X * 0.75 >= plat.x1 &&
              state.x - CHAR_RADIUS_X * 0.75 <= plat.x2 &&
              Math.abs(state.y - plat.currentY) <= 8
            ) {
              plat.state = 'STEPPED';
              plat.timer = 0;
              plat.splashed = false;
              spawnFootstepInkPuff(
                clamp(state.x, plat.x1 + 10, plat.x2 - 10),
                plat.baseY + 24,
                4,
                0.75
              );
            }
          } else if (plat.state === 'STEPPED') {
            plat.timer += dt;
            // Shorter period before falling: brief 0.15s settle, then 0.30s brisk tremor (0.45s total) before dropping!
            if (plat.timer < 0.15) {
              plat.currentY = plat.baseY + 2;
              plat.shakeOffsetX = 0;
              plat.shakeAngle = 0;
            } else if (plat.timer < 0.45) {
              const shakeProgress = (plat.timer - 0.15) / 0.3;
              const amp = 2.8 + shakeProgress * 4.8;
              plat.currentY =
                plat.baseY + 2 + Math.cos(now * 0.11) * (1.4 + shakeProgress * 2.0);
              plat.shakeOffsetX = Math.sin(now * 0.14) * amp;
              plat.shakeAngle = Math.sin(now * 0.095) * (0.028 + shakeProgress * 0.048);
              if (Math.random() < dt * 28) {
                spawnFootstepInkPuff(
                  plat.x1 + Math.random() * (plat.x2 - plat.x1),
                  plat.currentY + 22,
                  1,
                  0.6
                );
              }
            } else {
              plat.state = 'FALLING';
              plat.vy = 85;
              plat.respawnTimer = 0;
              plat.shakeOffsetX = 0;
              plat.shakeAngle = 0.05;
              spawnFootstepInkPuff(
                (plat.x1 + plat.x2) * 0.5,
                plat.currentY + 12,
                8,
                1.1
              );
            }
          } else if (plat.state === 'FALLING') {
            plat.vy += 2450 * dt;
            plat.currentY += plat.vy * dt;
            plat.shakeAngle += 0.35 * dt;
            if (!plat.splashed && plat.currentY >= GROUND_Y + 10) {
              plat.splashed = true;
              spawnFootstepInkPuff(
                (plat.x1 + plat.x2) * 0.5,
                GROUND_Y + 14,
                12,
                1.35
              );
            }
            plat.respawnTimer += dt;
            if (plat.respawnTimer >= 2.3) {
              plat.state = 'IDLE';
              plat.currentY = plat.baseY;
              plat.vy = 0;
              plat.timer = 0;
              plat.respawnTimer = 0;
              plat.shakeOffsetX = 0;
              plat.shakeAngle = 0;
              plat.splashed = false;
            }
          }
        }
      }

      // Poll connected Bluetooth / USB Gamepad Controller state each frame
      {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp: Gamepad | null = null;
        for (let i = 0; i < pads.length; i++) {
          if (pads[i] && pads[i]!.connected) {
            gp = pads[i];
            break;
          }
        }

        if (gp) {
          const stickX = gp.axes[0] ?? 0;
          const stickY = gp.axes[1] ?? 0;
          const dpadUp = gp.buttons[12]?.pressed ?? false;
          const dpadDown = gp.buttons[13]?.pressed ?? false;
          const dpadLeft = gp.buttons[14]?.pressed ?? false;
          const dpadRight = gp.buttons[15]?.pressed ?? false;

          const aPressed = gp.buttons[0]?.pressed ?? false; // A: Jump / Hold to Mantle
          const bPressed = gp.buttons[1]?.pressed ?? false; // B: Toggle Crawl On/Off
          const xPressed = gp.buttons[2]?.pressed ?? false; // X: Enter Doors

          const canControl =
            !pausedRef.current &&
            !state.dead &&
            !state.sinking.active &&
            !state.completed &&
            dialogueScene.phase === 'COMPLETE' &&
            endingScene.phase === 'INACTIVE';

          if (canControl) {
            gamepadState.left = stickX < -0.25 || dpadLeft;
            gamepadState.right = stickX > 0.25 || dpadRight;
            gamepadState.up = stickY < -0.28 || dpadUp;
            gamepadState.down = stickY > 0.28 || dpadDown;
            gamepadState.jumpHeld = aPressed;

            // Rising edge of X button: enter nearby door
            if (xPressed && !gamepadState.prevX) {
              tryEnterNearbyDoor();
            }

            // Hold B button to stay crawling; release B to stop crawling and stand back up
            gamepadState.crawlToggled =
              bPressed &&
              !state.ropeGrab.active &&
              state.doorTransition.phase === 'NONE';

            // Rising edge of A button: jump / rope launch / wall jump
            if (aPressed && !gamepadState.prevA) {
              triggerJumpAction();
            }
          } else {
            gamepadState.left = false;
            gamepadState.right = false;
            gamepadState.up = false;
            gamepadState.down = false;
            gamepadState.jumpHeld = false;
            gamepadState.crawlToggled = false;

            // Allow A button to advance dialogue when in opening or ending dialogue
            if (
              aPressed &&
              !gamepadState.prevA &&
              !pausedRef.current &&
              (dialogueScene.phase === 'DIALOGUE_ACTIVE' ||
                endingScene.phase === 'DIALOGUE_ACTIVE')
            ) {
              handleSkipDialogue();
            }
          }

          gamepadState.prevA = aPressed;
          gamepadState.prevB = bPressed;
          gamepadState.prevX = xPressed;
        } else {
          gamepadState.left = false;
          gamepadState.right = false;
          gamepadState.up = false;
          gamepadState.down = false;
          gamepadState.jumpHeld = false;
          gamepadState.crawlToggled = false;
          gamepadState.prevA = false;
          gamepadState.prevB = false;
          gamepadState.prevX = false;
        }
      }

      // Keep Christian in belly-crawl until his entire body (head, back, and heavy burden: ±86px)
      // has completely cleared the horizontal span of the low overhead obstacle!
      // Never auto-crawl when walking upright up to the outside of a block!
      const insideCrawlTunnel = isInsideCrawlTunnel(
        state.x,
        state.y,
        state.crouchBlend
      );
      const effectiveCrouch =
        !state.ropeGrab.active &&
        !state.sinking.active &&
        state.doorTransition.phase === 'NONE' &&
        (keysHeld.crouch || gamepadState.crawlToggled || insideCrawlTunnel);

      // Determine horizontal movement intent
      let moveDir: -1 | 0 | 1 = 0;
      if (endingScene.phase !== 'INACTIVE') {
        keysHeld.left = false;
        keysHeld.right = false;
        keysHeld.up = false;
        keysHeld.jump = false;
        keysHeld.crouch = false;
        gamepadState.crawlToggled = false;
        if (endingScene.phase === 'RUN_PAST_OBSTACLE') {
          state.scriptedWalk = false;
          moveDir = 1;
        } else if (endingScene.phase === 'WALK_OFF') {
          state.scriptedWalk = false;
          if (state.x < endingScene.cameraX + 1480) {
            moveDir = 1;
            state.facing = 1;
          } else {
            moveDir = 0;
            state.vx = 0;
          }
        } else {
          state.scriptedWalk = true;
          if (
            endingScene.phase === 'ZOOM_AND_WALK' &&
            !endingScene.christianTurned
          ) {
            if (state.x < endingScene.christianStopX) {
              moveDir = 1;
            } else {
              state.x = endingScene.christianStopX;
              state.vx = 0;
              moveDir = 0;
              state.facing = -1;
              endingScene.christianTurned = true;
            }
          }
        }
      } else if (state.doorTransition.phase === 'WALK_AND_FADE_OUT') {
        state.scriptedWalk = true;
        const distToDoor = state.doorTransition.doorX - state.x;
        if (Math.abs(distToDoor) > 6) {
          moveDir = distToDoor > 0 ? 1 : -1;
        } else {
          state.x = state.doorTransition.doorX;
          state.vx = 0;
          moveDir = 0;
        }
      } else if (!state.sinking.active) {
        state.scriptedWalk = false;
        const wantRight = keysHeld.right || gamepadState.right;
        const wantLeft = keysHeld.left || gamepadState.left;
        if (wantRight && !wantLeft) moveDir = 1;
        else if (wantLeft && !wantRight) moveDir = -1;
      }

      // Pushing A / D or Left Stick directly makes Christian run (when not army-crawling or in a scripted dialogue walk).
      // The walking speed & walk animation remain intact for scripted dialogues and Evangelist!
      const walkSpeed = 390;
      const crawlSpeed = 205;
      const runSpeed = 940;
      const isRunningInput =
        moveDir !== 0 && !effectiveCrouch && !state.scriptedWalk;
      const canRun =
        isRunningInput && !effectiveCrouch && state.crouchBlend < 0.25;
      const activeWalkSpeed = lerp(
        walkSpeed,
        crawlSpeed,
        effectiveCrouch ? 1 : state.crouchBlend
      );
      const targetSpeed =
        moveDir === 0 ? 0 : canRun ? runSpeed : activeWalkSpeed;
      const targetVx = moveDir * targetSpeed;

      if (state.sinking.active && isChapterOne) {
        // --- SLOWLY SINKING INTO TAR PIT BEFORE DEATH SCREEN (OR DOOR DIMENSION RESPAWN) ---
        state.sinking.timer += dt;
        state.vx *= Math.max(0, 1 - dt * 16);
        state.x += state.vx * dt;
        state.vy = 76; // Slow, viscous downward sink into the black tar
        state.y += state.vy * dt;
        state.onGround = false;
        state.touchingWallDir = 0;
        state.wallGripBlend = 0;

        if (Math.random() < dt * 14) {
          spawnFootstepInkPuff(
            state.x + (Math.random() - 0.5) * 28,
            state.sinking.surfaceY,
            2,
            0.55
          );
        }

        if (state.sinking.timer >= state.sinking.duration) {
          // Dying anywhere (including inside a Door Dimension) triggers the Death Screen so the player must start over
          state.dead = true;
          state.vx = 0;
          state.vy = 0;
          setIsDead(true);
        }
      } else if (state.ropeGrab.active && isChapterOne) {
        // --- SWINGING ROPE HANG, CLIMB (W / SHIFT or LEFT STICK UP / DOWN) & MOMENTUM SHIFT (A / D or LEFT STICK LEFT / RIGHT) UPDATE ---
        const rope = swingingRopes[state.ropeGrab.ropeIndex];
        if (rope) {
          // Allow Christian to climb all the way up to the overhead timber support beam (minGrabDist = 12)!
          const minGrabDist = 12;
          const prevGrabDist = state.ropeGrab.grabDist;
          let isActivelyClimbing = false;
          const climbUpInput = keysHeld.up || gamepadState.up;
          const climbDownInput = keysHeld.ropeDown || keysHeld.crouch || gamepadState.down;
          // Hold W / Left Stick Up to climb up the rope; hold Shift / Left Stick Down to slide/climb down the rope (if you go past the bottom, you fall!)
          if (climbUpInput && !climbDownInput) {
            state.ropeGrab.grabDist = Math.max(
              minGrabDist,
              state.ropeGrab.grabDist - 165 * dt
            );
            state.ropeGrab.climbCycle =
              (state.ropeGrab.climbCycle + dt * 2.15) % 1;
            isActivelyClimbing = state.ropeGrab.grabDist > minGrabDist + 0.5;
          } else if (climbDownInput && !climbUpInput) {
            state.ropeGrab.grabDist += 205 * dt;
            state.ropeGrab.climbCycle =
              (state.ropeGrab.climbCycle - dt * 2.35 + 1) % 1;
            isActivelyClimbing = true;
          }
          state.ropeGrab.climbAnimBlend +=
            ((isActivelyClimbing ? 1 : 0) - state.ropeGrab.climbAnimBlend) *
            Math.min(1, dt * 14);

          // Prevent sliding down into a solid LevelBlock (only block downward slide or upward climb into an overhead ceiling)!
          if (
            state.ropeGrab.grabDist <= rope.length + 4 &&
            state.ropeGrab.grabDist > prevGrabDist &&
            doesRopeOrPilgrimCollideWithBlock(
              rope,
              state.ropeGrab.grabDist,
              state.facing,
              nowSec
            )
          ) {
            state.ropeGrab.grabDist = prevGrabDist;
          }

          // Helper to check if Christian's boots touch solid ground or a block top at (xPos, footY)
          const findRopeLandingSurfaceY = (
            xPos: number,
            footY: number
          ): number | null => {
            for (const b of levelBlocks) {
              if (
                xPos + CHAR_RADIUS_X * 0.7 >= b.x1 &&
                xPos - CHAR_RADIUS_X * 0.7 <= b.x2 &&
                footY >= b.topY - 2 &&
                footY <= b.topY + 34
              ) {
                return b.topY;
              }
            }
            const inPit = sludgePits.some(
              (pit) => xPos >= pit.x1 + 8 && xPos <= pit.x2 - 8
            );
            if (!inPit && footY >= GROUND_Y - 2) {
              for (const seg of groundSegments) {
                if (
                  xPos + CHAR_RADIUS_X * 0.55 >= seg.x1 &&
                  xPos - CHAR_RADIUS_X * 0.55 <= seg.x2
                ) {
                  return GROUND_Y;
                }
              }
            }
            return null;
          };

          // Check if Christian slid too far down past the bottom end of the rope!
          if (state.ropeGrab.grabDist > rope.length + 4) {
            state.ropeGrab.active = false;
            state.ropeGrab.cooldown = 0.45;
            const releaseSurfaceY = findRopeLandingSurfaceY(state.x, state.y);
            if (releaseSurfaceY !== null) {
              state.y = releaseSurfaceY;
              state.vy = 0;
              state.vx = 0;
              state.onGround = true;
              state.ropeGrab.lastRopeIndex = -1;
              spawnFootstepInkPuff(state.x, state.y, 8, 1.1);
            } else {
              state.onGround = false;
              state.vy = 125;
              state.vx =
                Math.cos(rope.angle) * rope.angularVel * rope.length * 0.65;
            }
          } else {
            // Height ratio along the rope (0 = high right at top crossbeam, 1 = low near bottom of rope)
            const heightRatio = clamp(
              (state.ropeGrab.grabDist - minGrabDist) /
                Math.max(1, rope.length - minGrabDist),
              0,
              1
            );
            // Higher on the rope has slightly less swinging momentum than lower toward the bottom of the rope
            const heightMomentumScale = lerp(0.75, 1.08, heightRatio);

            // Slower, weightier pendulum restoring acceleration + gradual player A/D momentum pumping
            // so it takes multiple back-and-forth swings to build up full momentum!
            const gravityRestore = -6.2 * Math.sin(rope.angle);
            let pumpAccel = 0;
            const prevFacing = state.facing;
            if (moveDir !== 0) {
              state.facing = moveDir;
              const alignedWithSwing = moveDir * rope.angularVel >= -0.08;
              pumpAccel =
                moveDir *
                (alignedWithSwing ? 1.08 : 0.46) *
                heightMomentumScale;
            } else if (Math.abs(rope.angularVel) > 0.25) {
              state.facing = rope.angularVel >= 0 ? 1 : -1;
            }
            if (
              state.facing !== prevFacing &&
              doesRopeOrPilgrimCollideWithBlock(
                rope,
                state.ropeGrab.grabDist,
                state.facing,
                nowSec
              )
            ) {
              state.facing = prevFacing;
            }

            const prevAngle = rope.angle;
            const damping = moveDir !== 0 ? 0.12 : 0.22;
            rope.angularVel +=
              (gravityRestore + pumpAccel - rope.angularVel * damping) * dt;
            const maxAngVel = 2.05 * heightMomentumScale;
            rope.angularVel = clamp(rope.angularVel, -maxAngVel, maxAngVel);
            rope.angle += rope.angularVel * dt;

            const maxSwingAngle = 0.74 * heightMomentumScale;
            if (rope.angle > maxSwingAngle) {
              rope.angle = maxSwingAngle;
              if (rope.angularVel > 0) rope.angularVel *= 0.25;
            } else if (rope.angle < -maxSwingAngle) {
              rope.angle = -maxSwingAngle;
              if (rope.angularVel < 0) rope.angularVel *= 0.25;
            }

            // Solid Rope & Pilgrim collision against all LevelBlocks so neither the rope nor Christian ever swings through or gets stuck on a block!
            if (
              doesRopeOrPilgrimCollideWithBlock(
                rope,
                state.ropeGrab.grabDist,
                state.facing,
                nowSec
              )
            ) {
              rope.angle = prevAngle;
              rope.angularVel = -rope.angularVel * 0.25;
              // If still colliding at prevAngle, gently relax rope angle toward vertical (0) and lift grabDist slightly so Christian never gets wedged!
              if (
                doesRopeOrPilgrimCollideWithBlock(
                  rope,
                  state.ropeGrab.grabDist,
                  state.facing,
                  nowSec
                )
              ) {
                rope.angle *= 0.82;
                state.ropeGrab.grabDist = Math.max(
                  minGrabDist,
                  state.ropeGrab.grabDist - 120 * dt
                );
              }
            }

            const cosA = Math.cos(rope.angle);
            const sinA = Math.sin(rope.angle);
            // Evaluate the exact coordinate on the flexible, wavy rope at Christian's grab distance
            const handPt = getRopePointAtDist(
              rope,
              state.ropeGrab.grabDist,
              nowSec,
              state.ropeGrab.grabDist
            );

            // Position Christian so his raised hands at local (22.8, -278.0) * 0.82 = (18.7, -228.0)
            // clasp the exact wavy rope point (handPt.x, handPt.y) with zero offset!
            state.x = handPt.x - state.facing * 18.7;
            state.y = handPt.y + 228.0;
            state.vx = cosA * rope.angularVel * state.ropeGrab.grabDist;
            state.vy = -sinA * rope.angularVel * state.ropeGrab.grabDist;
            state.onGround = false;
            state.touchingWallDir = 0;
            state.wallGripBlend = 0;

            // If declining/sliding down a rope (holding Shift / Left Stick Down) onto solid ground when the rope is nearly vertical, step cleanly onto it!
            if (climbDownInput && !climbUpInput && Math.abs(rope.angle) < 0.22) {
              const stepOffY = findRopeLandingSurfaceY(state.x, state.y);
              if (stepOffY !== null && stepOffY >= GROUND_Y - 2) {
                state.ropeGrab.active = false;
                state.ropeGrab.cooldown = 0.35;
                state.ropeGrab.lastRopeIndex = -1;
                state.y = stepOffY;
                state.vy = 0;
                state.vx = 0;
                state.onGround = true;
                spawnFootstepInkPuff(state.x, state.y, 8, 1.05);
              }
            }
          }
        } else {
          state.ropeGrab.active = false;
        }
      } else if (state.vault.active) {
        // --- LEDGE VAULT / MANTLE UPDATE ---
        state.vault.timer += dt;
        const u = clamp(state.vault.timer / state.vault.duration, 0, 1);
        state.facing = state.vault.dir;
        state.vx = 0;
        state.vy = 0;
        state.touchingWallDir = 0;
        state.wallGripBlend = 0;

        if (u < 0.52) {
          // Pull up vertically alongside the ledge edge while tucking knees over the lip
          const p1 = smoothstep(0, 0.52, u);
          state.x = lerp(
            state.vault.startX,
            state.vault.edgeX + state.vault.dir * 8,
            p1
          );
          state.y = lerp(state.vault.startY, state.vault.targetY - 14, p1);
        } else {
          // Mantle forward onto the top of the ledge and plant boots
          const p2 = smoothstep(0.52, 1.0, u);
          state.x = lerp(
            state.vault.edgeX + state.vault.dir * 8,
            state.vault.targetX,
            p2
          );
          state.y = lerp(state.vault.targetY - 14, state.vault.targetY, p2);
        }

        if (u >= 1.0) {
          state.vault.active = false;
          state.x = state.vault.targetX;
          state.y = state.vault.targetY;
          state.onGround = true;
          state.vy = 0;
          state.vx = state.vault.dir * 180;
          state.landingSquash = 0.25;
          state.landingSquashVel = 0;
          state.burdenBounceVy += 95;
          state.burdenPitchVel += 1.2;
          spawnFootstepInkPuff(state.x, state.y, 9, 1.2);
        }
      } else {
        if (moveDir !== 0 && state.wallJumpLockTimer <= 0 && state.touchingWallDir === 0) {
          state.facing = moveDir;
        }

        // Smooth horizontal acceleration & deceleration (preserve strong wall-jump cross-shaft boost during wallJumpLockTimer)
        const prevVx = state.vx;
        const groundAccelRate = moveDir === 0 ? 28 : 24;

        if (state.onGround) {
          state.vx += (targetVx - state.vx) * Math.min(1, groundAccelRate * dt);
        } else if (state.wallJumpLockTimer > 0) {
          // Keep strong cross-shaft horizontal velocity so wall jumps easily reach the opposite wall
          const lockTargetVx = state.wallPushOffDir * 780;
          state.vx += (lockTargetVx - state.vx) * Math.min(1, 4.0 * dt);
        } else {
          state.vx += (targetVx - state.vx) * Math.min(1, 14 * dt);
        }

        if (
          Math.abs(state.vx) < 3 &&
          moveDir === 0 &&
          state.wallJumpLockTimer <= 0
        ) {
          state.vx = 0;
        }

        // Smooth, subtle acceleration lean so torso never jerks or bobbles the head
        const dvx = (state.vx - prevVx) / Math.max(0.001, dt);
        const targetAccelTilt = clamp(
          (dvx * state.facing) / 9500,
          -0.25,
          0.3
        );
        state.accelTilt +=
          (targetAccelTilt - state.accelTilt) * Math.min(1, dt * 10);

        const prevX = state.x;
        const prevY = state.y;
        state.x += state.vx * dt;
        state.x = Math.max(85, Math.min(LEVEL_WIDTH - 85, state.x));

        // --- HORIZONTAL OBSTACLE & WALL COLLISIONS (CHAPTER 1) ---
        state.touchingWallDir = 0;
        const isFullyCrawling =
          effectiveCrouch && (state.crouchBlend >= 0.45 || insideCrawlTunnel);
        const charHeight = isFullyCrawling ? CRAWL_H : STANDING_H;
        const charTop = state.y - charHeight;
        const charBottom = state.y;

        if (isChapterOne) {
          // 1. Solid Level Blocks horizontal collision & wall-grip detection
          for (const b of levelBlocks) {
            if (charBottom > b.topY + 8 && charTop < b.bottomY - 2) {
              if (
                prevX + CHAR_RADIUS_X <= b.x1 + 14 &&
                state.x + CHAR_RADIUS_X > b.x1
              ) {
                state.x = b.x1 - CHAR_RADIUS_X;
                state.vx = 0;
                state.wallJumpLockTimer = 0;
                if (!state.onGround && b.canWallJumpLeft) {
                  state.touchingWallDir = 1;
                }
              } else if (
                prevX - CHAR_RADIUS_X >= b.x2 - 14 &&
                state.x - CHAR_RADIUS_X < b.x2
              ) {
                state.x = b.x2 + CHAR_RADIUS_X;
                state.vx = 0;
                state.wallJumpLockTimer = 0;
                if (!state.onGround && b.canWallJumpRight) {
                  state.touchingWallDir = -1;
                }
              }
            }

            // Detect close wall proximity while airborne for forgiving wall-gripping & wall-jumping
            if (!state.onGround && state.wallPushOffTimer <= 0.14) {
              if (
                b.canWallJumpRight &&
                state.y - 20 > b.topY &&
                state.y - 160 < b.bottomY &&
                Math.abs(state.x - CHAR_RADIUS_X - b.x2) <= 36
              ) {
                state.touchingWallDir = -1;
                state.x = b.x2 + CHAR_RADIUS_X;
                state.vx = Math.max(0, state.vx);
                state.wallJumpLockTimer = 0;
              } else if (
                b.canWallJumpLeft &&
                state.y - 16 > b.topY &&
                state.y - 160 < b.bottomY &&
                Math.abs(state.x + CHAR_RADIUS_X - b.x1) <= 36
              ) {
                state.touchingWallDir = 1;
                state.x = b.x1 - CHAR_RADIUS_X;
                state.vx = Math.min(0, state.vx);
                state.wallJumpLockTimer = 0;
              }
            }
          }

          // 2. Check for Ledge Mantle when holding SPACE or Controller A button in the air near any mountable block corner!
          if (
            !state.onGround &&
            (keysHeld.jump || gamepadState.jumpHeld) &&
            state.vy >= -520
          ) {
            for (const ledge of mountableLedges) {
              const distToEdgeX = (ledge.edgeX - state.x) * ledge.dir;
              if (
                distToEdgeX >= -20 &&
                distToEdgeX <= 56 &&
                state.y >= ledge.topY + 8 &&
                state.y <= ledge.topY + 148
              ) {
                state.vault.active = true;
                state.vault.timer = 0;
                state.vault.duration = 0.36;
                state.vault.startX = state.x;
                state.vault.startY = state.y;
                state.vault.edgeX = ledge.edgeX;
                state.vault.targetX = ledge.edgeX + ledge.dir * 36;
                state.vault.targetY = ledge.topY;
                state.vault.dir = ledge.dir;
                state.facing = ledge.dir;
                state.vx = 0;
                state.vy = 0;
                state.touchingWallDir = 0;
                state.wallGripBlend = 0;
                state.wallJumpLockTimer = 0;
                state.wallPushOffTimer = 0;
                spawnFootstepInkPuff(
                  ledge.edgeX + ledge.dir * 6,
                  ledge.topY,
                  7,
                  1.05
                );
                break;
              }
            }
          }

          // 3. Check for grabbing a Swinging Hemp Rope while airborne!
          if (!state.onGround && !state.vault.active && !state.ropeGrab.active) {
            const grabTargetX = state.x + state.facing * 16;
            const grabTargetY = state.y - 185; // Raised hands / upper chest reach height
            for (let rIdx = 0; rIdx < swingingRopes.length; rIdx++) {
              // Allow instant rope-to-rope transfers when jumping to a different rope!
              if (
                state.ropeGrab.cooldown > 0 &&
                rIdx === state.ropeGrab.lastRopeIndex
              ) {
                continue;
              }
              const rope = swingingRopes[rIdx];
              const sinA = Math.sin(rope.angle);
              const cosA = Math.cos(rope.angle);
              const dx = grabTargetX - rope.pivotX;
              const dy = grabTargetY - rope.pivotY;
              // Project Christian's reach point onto the rope axis
              const projDist = dx * sinA + dy * cosA;
              const clampedDist = clamp(
                projDist,
                12,
                rope.length * 1.02
              );
              const closestPt = getRopePointAtDist(
                rope,
                clampedDist,
                now * 0.001,
                null
              );
              const distToRope = Math.hypot(
                grabTargetX - closestPt.x,
                grabTargetY - closestPt.y
              );

              if (distToRope <= 68 && projDist >= 10 && projDist <= rope.length + 28) {
                state.ropeGrab.active = true;
                state.ropeGrab.ropeIndex = rIdx;
                state.ropeGrab.lastRopeIndex = rIdx;
                state.ropeGrab.climbAnimBlend = 0;
                state.ropeGrab.grabDist = clamp(
                  projDist,
                  12,
                  rope.length - 16
                );
                // Transfer only a gentle initial nudge when grabbing a still rope so the player
                // must pump A and D across multiple swings to build up full momentum!
                const heightRatio = clamp(
                  (state.ropeGrab.grabDist - 12) / Math.max(1, rope.length - 12),
                  0,
                  1
                );
                const heightMomentumScale = lerp(0.75, 1.08, heightRatio);
                rope.angularVel = clamp(
                  rope.angularVel + (state.vx / 3400) * heightMomentumScale,
                  -0.42,
                  0.42
                );
                state.touchingWallDir = 0;
                state.wallGripBlend = 0;
                state.wallJumpLockTimer = 0;
                state.wallPushOffTimer = 0;
                state.burdenBounceVy += 95;
                spawnFootstepInkPuff(closestPt.x, closestPt.y, 8, 1.05);
                break;
              }
            }
          }
        }

        // Orient Christian toward the wall while gripping it and smoothly blend wallGripBlend
        if (!state.onGround && state.touchingWallDir !== 0 && state.wallPushOffTimer <= 0.08) {
          state.facing = state.touchingWallDir;
          state.wallGripBlend += (1 - state.wallGripBlend) * Math.min(1, dt * 22);
        } else {
          state.wallGripBlend += (0 - state.wallGripBlend) * Math.min(1, dt * 18);
        }

        // --- SUPPORT SURFACE CHECK WHEN WALKING ON GROUND, BLOCK TOPS, COLLAPSING PLATFORMS, OR MOVING PLATFORMS ---
        const findSupportSurfaceY = (
          xPos: number,
          oldY: number,
          newY: number
        ): number | null => {
          let bestTopY: number | null = null;

          // 1. Check all solid LevelBlock tops
          for (const b of levelBlocks) {
            if (
              xPos + CHAR_RADIUS_X * 0.75 >= b.x1 &&
              xPos - CHAR_RADIUS_X * 0.75 <= b.x2 &&
              oldY <= b.topY + 12 &&
              newY >= b.topY
            ) {
              if (bestTopY === null || b.topY < bestTopY) {
                bestTopY = b.topY;
              }
            }
          }

          // 2. Check all active (non-falling) High-Altitude Collapsing Platforms
          for (const plat of collapsingPlatforms) {
            if (plat.state === 'FALLING') continue;
            if (
              xPos + CHAR_RADIUS_X * 0.75 >= plat.x1 &&
              xPos - CHAR_RADIUS_X * 0.75 <= plat.x2 &&
              oldY <= plat.currentY + 14 &&
              newY >= plat.currentY - 2
            ) {
              if (bestTopY === null || plat.currentY < bestTopY) {
                bestTopY = plat.currentY;
              }
            }
          }

          // 3. Check all Back-and-Forth Horizontal Moving Platforms
          for (const mPlat of movingPlatforms) {
            const halfW = mPlat.width * 0.5;
            if (
              xPos + CHAR_RADIUS_X * 0.75 >= mPlat.x - halfW &&
              xPos - CHAR_RADIUS_X * 0.75 <= mPlat.x + halfW &&
              oldY <= mPlat.y + 14 &&
              newY >= mPlat.y - 2
            ) {
              if (bestTopY === null || mPlat.y < bestTopY) {
                bestTopY = mPlat.y;
              }
            }
          }

          if (bestTopY !== null) return bestTopY;

          // 4. Check Main Ground Segments (GROUND_Y = 855)
          for (const seg of groundSegments) {
            if (
              xPos + CHAR_RADIUS_X * 0.55 >= seg.x1 &&
              xPos - CHAR_RADIUS_X * 0.55 <= seg.x2 &&
              oldY <= GROUND_Y + 42 &&
              newY >= GROUND_Y
            ) {
              return GROUND_Y;
            }
          }

          return null;
        };

        // If currently on ground/platform, verify Christian still has solid ground beneath his boots
        if (state.onGround && !state.vault.active) {
          const supportY = findSupportSurfaceY(state.x, state.y - 6, state.y + 6);
          if (supportY === null) {
            state.onGround = false;
          } else {
            state.y = supportY;
          }
        }

        // Jump, wall-slide & gravity physics (identical jump height on both Keyboard and Bluetooth Controller!)
        if (!state.onGround && !state.vault.active && !state.ropeGrab.active) {
          const gravity = state.vy < 0 ? 3650 : 4250;
          state.vy += gravity * dt;

          // Slower wall-grip slide friction when holding onto a wall so wall-jumps over tar pits are much easier!
          if (state.touchingWallDir !== 0 && state.vy > 130) {
            state.vy = 130;
            if (Math.random() < dt * 18) {
              spawnFootstepInkPuff(
                state.x + state.touchingWallDir * 18,
                state.y - 45,
                1,
                0.45
              );
            }
          }

          const nextY = state.y + state.vy * dt;

          // Check ceiling bump against underside of any overhead block so Christian's head never clips upward into a block
          if (state.vy < 0 && isChapterOne) {
            const nextTop = nextY - charHeight;
            for (const b of levelBlocks) {
              if (
                b.bottomY < GROUND_Y &&
                state.x + CHAR_RADIUS_X - 4 > b.x1 &&
                state.x - CHAR_RADIUS_X + 4 < b.x2 &&
                prevY - charHeight >= b.bottomY - 14 &&
                nextTop < b.bottomY
              ) {
                state.vy = 50;
              }
            }
          }

          // Check landing on any solid ground segment or block top
          const landedY =
            state.vy >= 0 ? findSupportSurfaceY(state.x, prevY, nextY) : null;
          if (landedY !== null) {
            const impactVy = state.vy;
            state.y = landedY;
            state.vy = 0;
            state.onGround = true;
            state.ropeGrab.lastRopeIndex = -1;
            state.touchingWallDir = 0;
            state.wallGripBlend = 0;
            state.wallPushOffTimer = 0;
            state.landingSquash = clamp(impactVy / 1250, 0.2, 0.85);
            state.landingSquashVel = 0;
            state.burdenBounceVy += impactVy * 0.22;
            state.burdenPitchVel += (impactVy / 1250) * 2.8;
            spawnFootstepInkPuff(state.x, state.y, 12, 1.45);
          } else {
            state.y = nextY;
            // Check if Christian has landed in an ink-black sludge / tar pit -> begin slow sinking animation!
            if (isChapterOne && state.y >= GROUND_Y) {
              const inSludgePit = sludgePits.some(
                (pit) => state.x >= pit.x1 + 4 && state.x <= pit.x2 - 4
              );
              if (inSludgePit && state.y >= GROUND_Y + 14) {
                state.sinking.active = true;
                state.sinking.timer = 0;
                state.sinking.surfaceY = GROUND_Y + 14;
                state.vx *= 0.15;
                state.vy = 76;
                spawnFootstepInkPuff(state.x, GROUND_Y + 14, 18, 1.55);
              } else if (!inSludgePit) {
                // Landed on solid ground (e.g. after sliding off the bottom of a rope over solid ground)
                state.y = GROUND_Y;
                state.vy = 0;
                state.onGround = true;
                state.ropeGrab.lastRopeIndex = -1;
                state.touchingWallDir = 0;
                state.wallGripBlend = 0;
                state.wallPushOffTimer = 0;
                spawnFootstepInkPuff(state.x, state.y, 9, 1.15);
              }
            }
          }
        }

        // Solid AABB depenetration pass against all LevelBlocks using CHAR_RADIUS_X
        if (isChapterOne && !state.vault.active && !state.sinking.active) {
          const curTop = state.y - charHeight + 8;
          const curBottom = state.y - 6;
          for (const b of levelBlocks) {
            const isOverheadCrawlBarrier = b.bottomY < state.y - CRAWL_H + 8;
            if (
              state.x + CHAR_RADIUS_X > b.x1 &&
              state.x - CHAR_RADIUS_X < b.x2 &&
              curBottom > b.topY &&
              curTop < b.bottomY
            ) {
              const overlapLeft = state.x + CHAR_RADIUS_X - b.x1;
              const overlapRight = b.x2 - (state.x - CHAR_RADIUS_X);
              const overlapTop = curBottom - b.topY;
              const overlapBottom = b.bottomY - curTop;
              const minHoriz = Math.min(overlapLeft, overlapRight);
              const minVert = Math.min(overlapTop, overlapBottom);
              if (minHoriz <= minVert || isOverheadCrawlBarrier) {
                if (overlapLeft <= overlapRight) {
                  state.x = b.x1 - CHAR_RADIUS_X;
                  if (state.vx > 0) state.vx = 0;
                } else {
                  state.x = b.x2 + CHAR_RADIUS_X;
                  if (state.vx < 0) state.vx = 0;
                }
              } else if (overlapTop < overlapBottom && state.vy >= 0) {
                state.y = b.topY;
                state.vy = 0;
                state.onGround = true;
              } else if (state.vy < 0) {
                state.vy = 45;
              }
            }
          }
        }
      }

      // Smooth spring recovery from landing squash
      if (state.landingSquash > 0 || state.landingSquashVel !== 0) {
        const springF =
          -state.landingSquash * 145 - state.landingSquashVel * 17;
        state.landingSquashVel += springF * dt;
        state.landingSquash += state.landingSquashVel * dt;
        if (state.landingSquash < 0.005 && Math.abs(state.landingSquashVel) < 0.05) {
          state.landingSquash = 0;
          state.landingSquashVel = 0;
        } else {
          state.landingSquash = Math.max(0, state.landingSquash);
        }
      }

      // Smooth animation blends
      const speedAbs = Math.abs(state.vx);
      const targetWalkBlend =
        !state.ropeGrab.active && speedAbs > 12 ? 1 : 0;
      const targetRunBlend =
        !state.ropeGrab.active && canRun && moveDir !== 0 ? 1 : 0;
      const targetCrouchBlend =
        !state.ropeGrab.active && effectiveCrouch && state.onGround ? 1 : 0;

      state.walkBlend +=
        (targetWalkBlend - state.walkBlend) * Math.min(1, dt * 16);
      state.runBlend +=
        (targetRunBlend - state.runBlend) * Math.min(1, dt * 11);
      state.crouchBlend +=
        (targetCrouchBlend - state.crouchBlend) * Math.min(1, dt * 12);
      // If Christian is currently inside a low crawl tunnel, keep crouchBlend locked in belly crawl until his entire head, back, and burden clear the tunnel!
      if (insideCrawlTunnel && state.onGround) {
        state.crouchBlend = Math.max(state.crouchBlend, 0.98);
      }

      // Advance gait cycle directly locked to ground distance traveled (scaled by CHAR_SCALE) so feet/elbows NEVER slip!
      if (state.onGround && speedAbs > 8) {
        // Deliberate elbow-and-knee cadence when army-crawling on belly, keeping walking/running unchanged
        const cycleDistance = lerp(325, 395, state.runBlend) * CHAR_SCALE;
        const crouchLegSpeedScale = lerp(1.0, 0.85, state.crouchBlend);
        const dCycle = ((speedAbs * dt) / cycleDistance) * crouchLegSpeedScale;
        state.gaitCycle = (state.gaitCycle + dCycle) % 1;
        // Advance walking arm cycle slightly slower than leg stride when walking,
        // and smoothly phase-sync with gaitCycle when running so switching walk<->run never snaps the arms
        const armRate = lerp(0.78, 1.0, state.runBlend);
        state.walkArmCycle = (state.walkArmCycle + dCycle * armRate) % 1;
        if (state.runBlend > 0.85) {
          state.walkArmCycle = state.gaitCycle;
        } else if (state.runBlend > 0.01) {
          const phaseDiff =
            ((state.gaitCycle - state.walkArmCycle + 1.5) % 1) - 0.5;
          state.walkArmCycle =
            (state.walkArmCycle +
              phaseDiff * Math.min(1, dt * 14 * state.runBlend) +
              1) %
            1;
        }

        // Trigger footstrike ink dust & subtle burden weight at Heel-Strike (0.0 and 0.5)
        const stepIdx = Math.floor(((state.gaitCycle + 0.02) % 1) * 2);
        if (stepIdx !== state.prevStepIdx) {
          state.prevStepIdx = stepIdx;
          state.burdenBounceVy += 34 + state.runBlend * 68;
          state.burdenPitchVel += 0.45 + state.runBlend * 0.95;
          if (state.runBlend > 0.25) {
            spawnFootstepInkPuff(
              state.x + state.facing * 20 * CHAR_SCALE,
              state.y,
              6,
              1.0 + state.runBlend * 0.4
            );
          } else {
            spawnFootstepInkPuff(
              state.x + state.facing * 15 * CHAR_SCALE,
              state.y,
              3,
              0.65
            );
          }
        }
      } else if (state.onGround && speedAbs <= 8) {
        const nearestHalf = Math.round(state.gaitCycle * 2) / 2;
        state.gaitCycle += (nearestHalf - state.gaitCycle) * Math.min(1, dt * 8);
        state.walkArmCycle = state.gaitCycle;
      }

      // Secondary spring physics for the heavy connected burden
      const burdenSpringK = 210;
      const burdenDamping = 16;
      const burdenTargetY =
        Math.sin(state.gaitCycle * Math.PI * 4) *
          (1.4 + state.runBlend * 3.0) *
          state.walkBlend +
        state.landingSquash * 8;
      const burdenForce =
        (burdenTargetY - state.burdenBounceY) * burdenSpringK -
        state.burdenBounceVy * burdenDamping;
      state.burdenBounceVy += burdenForce * dt;
      state.burdenBounceY += state.burdenBounceVy * dt;
      state.burdenBounceY = clamp(state.burdenBounceY, -10, 12);

      const pitchTarget =
        Math.sin(state.gaitCycle * Math.PI * 4 - 0.6) *
          (0.012 + state.runBlend * 0.028) *
          state.walkBlend +
        state.landingSquash * 0.05;
      const pitchForce =
        (pitchTarget - state.burdenPitch) * 180 - state.burdenPitchVel * 15;
      state.burdenPitchVel += pitchForce * dt;
      state.burdenPitch += state.burdenPitchVel * dt;
      state.burdenPitch = clamp(state.burdenPitch, -0.09, 0.11);

      // Secondary cloth & hair physics
      const targetCoatSway =
        (speedAbs / runSpeed) * 0.75 +
        Math.sin(state.gaitCycle * Math.PI * 4 - 0.5) *
          (0.14 + state.runBlend * 0.28) *
          state.walkBlend +
        clamp(-state.vy / 950, -0.4, 0.45);
      const coatSpring =
        (targetCoatSway - state.coatSway) * 135 - state.coatSwayVel * 12;
      state.coatSwayVel += coatSpring * dt;
      state.coatSway += state.coatSwayVel * dt;

      const targetHairFlutter =
        (speedAbs / runSpeed) * 0.75 +
        Math.sin(state.gaitCycle * Math.PI * 4) * 0.16 * state.walkBlend +
        clamp(state.vy / 900, -0.45, 0.55);
      state.hairFlutter +=
        (targetHairFlutter - state.hairFlutter) * Math.min(1, dt * 14);

      // Update Chapter 1 Opening Dialogue Sequence & Evangelist Movement (using exact same walk speed & physics as Christian)
      if (dialogueScene.phase !== 'COMPLETE') {
        dialogueScene.talkAnimTimer += dt;
        const ev = dialogueScene.evangelist;
        let evMoveDir: -1 | 0 | 1 = 0;

        if (dialogueScene.phase === 'WAITING_FOR_FADE') {
          state.dialogueBookBlend = 1;
          dialogueScene.zoomBlend = 1;
          if (
            introPhaseRef.current === 'BLACK_FADE_TO_PARCHMENT' ||
            introPhaseRef.current === 'COMPLETE'
          ) {
            dialogueScene.fadeWaitTimer += dt;
            if (dialogueScene.fadeWaitTimer >= 0.55) {
              dialogueScene.phase = 'EVANGELIST_WALK_IN';
            }
          }
        } else if (dialogueScene.phase === 'EVANGELIST_WALK_IN') {
          evMoveDir = -1;
          if (ev.x <= 610) {
            ev.x = 610;
            ev.vx = 0;
            evMoveDir = 0;
            dialogueScene.phase = 'DIALOGUE_ACTIVE';
            dialogueScene.lineIndex = 0;
            dialogueScene.typedChars = 0;
            dialogueScene.fadingOutText = false;
            syncDialogueUIState();
          }
        } else if (dialogueScene.phase === 'DIALOGUE_ACTIVE') {
          evMoveDir = 0;
          ev.facing = -1;
          if (dialogueScene.fadingOutText) {
            dialogueScene.fadeOutTimer += dt;
            if (dialogueScene.fadeOutTimer >= 0.24) {
              dialogueScene.fadingOutText = false;
              dialogueScene.fadeOutTimer = 0;
              dialogueScene.lineIndex += 1;
              dialogueScene.typedChars = 0;
              syncDialogueUIState();
            }
          } else {
            const currentLine =
              CHAPTER_1_OPENING_DIALOGUE[dialogueScene.lineIndex];
            if (
              currentLine &&
              dialogueScene.typedChars < currentLine.text.length
            ) {
              dialogueScene.typedChars = Math.min(
                currentLine.text.length,
                dialogueScene.typedChars + dt * 42
              );
              syncDialogueUIState();
            }
          }
        } else if (dialogueScene.phase === 'EVANGELIST_WALK_OUT') {
          evMoveDir = 1;
          // Once Evangelist runs out of the zoomed-in view on the right (screen right edge at zoom 1.38 is x = 1391),
          // hide him and zoom out into full view where the first obstacle at x = 1480 is revealed!
          if (ev.x >= 1435) {
            ev.visible = false;
            ev.vx = 0;
            evMoveDir = 0;
            dialogueScene.phase = 'ZOOMING_OUT';
          }
        } else if (dialogueScene.phase === 'ZOOMING_OUT') {
          dialogueScene.zoomBlend = Math.max(
            0,
            dialogueScene.zoomBlend - dt * 1.15
          );
          state.dialogueBookBlend = dialogueScene.zoomBlend;
          if (dialogueScene.zoomBlend <= 0.001) {
            dialogueScene.zoomBlend = 0;
            state.dialogueBookBlend = 0;
            dialogueScene.phase = 'COMPLETE';
            onDialogueModeChangeRef.current?.(false);
          }
        }

        if (evMoveDir !== 0) {
          ev.facing = evMoveDir;
        }

        // Evangelist walks in at walkSpeed (390) and runs away at runSpeed (940) when dialogue finishes
        const evIsRunning = dialogueScene.phase === 'EVANGELIST_WALK_OUT';
        const evTargetVx = evMoveDir * (evIsRunning ? runSpeed : walkSpeed);
        const prevEvVx = ev.vx;
        const evAccelRate = evMoveDir === 0 ? 28 : 24;
        ev.vx += (evTargetVx - ev.vx) * Math.min(1, evAccelRate * dt);
        if (Math.abs(ev.vx) < 3 && evMoveDir === 0) {
          ev.vx = 0;
        }

        const evDvx = (ev.vx - prevEvVx) / Math.max(0.001, dt);
        const evTargetAccelTilt = clamp(
          (evDvx * ev.facing) / 9500,
          -0.25,
          0.3
        );
        ev.accelTilt +=
          (evTargetAccelTilt - ev.accelTilt) * Math.min(1, dt * 10);

        ev.x += ev.vx * dt;

        const evSpeedAbs = Math.abs(ev.vx);
        const evTargetWalk = evSpeedAbs > 12 ? 1 : 0;
        const evTargetRun = evIsRunning && evMoveDir !== 0 ? 1 : 0;
        ev.walkBlend += (evTargetWalk - ev.walkBlend) * Math.min(1, dt * 16);
        ev.runBlend += (evTargetRun - ev.runBlend) * Math.min(1, dt * 11);

        const isEvSpeakingNow =
          dialogueScene.phase === 'DIALOGUE_ACTIVE' &&
          !dialogueScene.fadingOutText &&
          CHAPTER_1_OPENING_DIALOGUE[dialogueScene.lineIndex]?.speaker ===
            'Evangelist';
        const targetTalkBlend = isEvSpeakingNow ? 1 : 0;
        ev.talkBlend +=
          (targetTalkBlend - ev.talkBlend) * Math.min(1, dt * 12);

        if (evSpeedAbs > 8) {
          const cycleDistance = lerp(325, 395, ev.runBlend) * CHAR_SCALE;
          const dCycle = (evSpeedAbs * dt) / cycleDistance;
          ev.gaitCycle = (ev.gaitCycle + dCycle) % 1;
          const armRate = lerp(0.78, 1.0, ev.runBlend);
          ev.walkArmCycle = (ev.walkArmCycle + dCycle * armRate) % 1;
          if (ev.runBlend > 0.85) {
            ev.walkArmCycle = ev.gaitCycle;
          } else if (ev.runBlend > 0.01) {
            const phaseDiff =
              ((ev.gaitCycle - ev.walkArmCycle + 1.5) % 1) - 0.5;
            ev.walkArmCycle =
              (ev.walkArmCycle +
                phaseDiff * Math.min(1, dt * 14 * ev.runBlend) +
                1) %
              1;
          }

          const stepIdx = Math.floor(((ev.gaitCycle + 0.02) % 1) * 2);
          if (stepIdx !== ev.prevStepIdx) {
            ev.prevStepIdx = stepIdx;
            if (ev.runBlend > 0.25) {
              spawnFootstepInkPuff(
                ev.x + ev.facing * 20 * CHAR_SCALE,
                ev.y,
                6,
                1.0 + ev.runBlend * 0.4
              );
            } else {
              spawnFootstepInkPuff(
                ev.x + ev.facing * 15 * CHAR_SCALE,
                ev.y,
                3,
                0.65
              );
            }
          }
        } else {
          const nearestHalf = Math.round(ev.gaitCycle * 2) / 2;
          ev.gaitCycle =
            ((ev.gaitCycle +
              (nearestHalf - ev.gaitCycle) * Math.min(1, dt * 8)) %
              1 +
              1) %
            1;
          ev.walkArmCycle = ev.gaitCycle;
        }

        const evTargetCoat =
          (evSpeedAbs / runSpeed) * 0.75 +
          Math.sin(ev.gaitCycle * Math.PI * 4 - 0.5) *
            (0.14 + ev.runBlend * 0.28) *
            ev.walkBlend;
        const evCoatSpring =
          (evTargetCoat - ev.coatSway) * 135 - ev.coatSwayVel * 12;
        ev.coatSwayVel += evCoatSpring * dt;
        ev.coatSway += ev.coatSwayVel * dt;

        const evTargetHair =
          (evSpeedAbs / runSpeed) * 0.75 +
          Math.sin(ev.gaitCycle * Math.PI * 4) * 0.16 * ev.walkBlend;
        ev.hairFlutter +=
          (evTargetHair - ev.hairFlutter) * Math.min(1, dt * 14);
      }

      // Check Single Exit Gate 3-Key Requirement & Trigger Chapter 1 Ending Sequence on Main Course (dimension 0)
      const allKeysCollected = chapterKeys.every((k) => k.collected);
      if (
        isChapterOne &&
        state.currentDimension === 0 &&
        endingScene.phase === 'INACTIVE' &&
        !state.dead
      ) {
        if (!allKeysCollected && state.x >= 48280) {
          if (state.x > 48452 - CHAR_RADIUS_X) {
            state.x = 48452 - CHAR_RADIUS_X;
            state.vx = Math.min(0, state.vx);
          }
          setLockedGateWarning(true);
        } else if (state.x < 48280) {
          setLockedGateWarning(false);
        }
      }

      if (
        isChapterOne &&
        state.currentDimension === 0 &&
        endingScene.phase === 'INACTIVE' &&
        allKeysCollected &&
        state.x > 48500 &&
        state.onGround &&
        state.y >= GROUND_Y - 4 &&
        !state.sinking.active &&
        !state.dead
      ) {
        keysHeld.left = false;
        keysHeld.right = false;
        keysHeld.up = false;
        keysHeld.jump = false;
        keysHeld.crouch = false;
        onDialogueModeChangeRef.current?.(true);

        if (state.x < 49180) {
          endingScene.phase = 'RUN_PAST_OBSTACLE';
          state.scriptedWalk = false;
        } else {
          endingScene.phase = 'ZOOM_AND_WALK';
          state.scriptedWalk = true;
          endingScene.cameraX = Math.max(48600, state.x - 580);
          endingScene.christianStopX = endingScene.cameraX + 1015;
          endingScene.pliableStopX = endingScene.cameraX + 475;
          endingScene.obstinateStopX = endingScene.cameraX + 330;
          endingScene.pursuersSpawned = false;
          endingScene.christianTurned = false;
          endingScene.settleTimer = 0;
        }
      }

      // Update Chapter 1 Ending Cutscene & Dialogue (Christian, Pliable & Obstinate)
      if (endingScene.phase !== 'INACTIVE') {
        endingScene.talkAnimTimer += dt;
        const pl = endingScene.pliable;
        const ob = endingScene.obstinate;
        let plMoveDir: -1 | 0 | 1 = 0;
        let obMoveDir: -1 | 0 | 1 = 0;

        if (endingScene.phase === 'RUN_PAST_OBSTACLE') {
          // Keep scrolling like a normal game until the last obstacle (x2 = 48550) has scrolled off the left edge of the screen!
          if (state.x >= 49180) {
            endingScene.phase = 'ZOOM_AND_WALK';
            state.scriptedWalk = true;
            endingScene.cameraX = Math.max(48600, state.x - 580);
            endingScene.christianStopX = endingScene.cameraX + 1015;
            endingScene.pliableStopX = endingScene.cameraX + 475;
            endingScene.obstinateStopX = endingScene.cameraX + 330;
            endingScene.pursuersSpawned = false;
            endingScene.christianTurned = false;
            endingScene.settleTimer = 0;
          }
        } else if (endingScene.phase === 'ZOOM_AND_WALK') {
          endingScene.zoomBlend = Math.min(
            1,
            endingScene.zoomBlend + dt * 1.45
          );

          // Check if Christian reached his stopping spot on the right of the screen -> stop and turn around to face left!
          if (!endingScene.christianTurned && state.x >= endingScene.christianStopX) {
            state.x = endingScene.christianStopX;
            state.vx = 0;
            state.facing = -1;
            endingScene.christianTurned = true;
          } else if (endingScene.christianTurned) {
            state.facing = -1;
          }

          // Spawn Pliable & Obstinate running in from the left as Christian walks rightward
          if (
            !endingScene.pursuersSpawned &&
            (state.x >= endingScene.cameraX + 760 || endingScene.christianTurned)
          ) {
            endingScene.pursuersSpawned = true;
            pl.visible = true;
            pl.x = endingScene.cameraX - 75;
            pl.facing = 1;
            ob.visible = true;
            ob.x = endingScene.cameraX - 230;
            ob.facing = 1;
          }

          if (endingScene.pursuersSpawned) {
            if (pl.x < endingScene.pliableStopX) {
              plMoveDir = 1;
            } else {
              pl.x = endingScene.pliableStopX;
              pl.vx = 0;
              plMoveDir = 0;
            }

            if (ob.x < endingScene.obstinateStopX) {
              obMoveDir = 1;
            } else {
              ob.x = endingScene.obstinateStopX;
              ob.vx = 0;
              obMoveDir = 0;
            }
          }

          if (
            endingScene.christianTurned &&
            endingScene.zoomBlend >= 0.99 &&
            endingScene.pursuersSpawned &&
            pl.x >= endingScene.pliableStopX &&
            ob.x >= endingScene.obstinateStopX
          ) {
            endingScene.settleTimer += dt;
            if (endingScene.settleTimer >= 0.25) {
              endingScene.phase = 'DIALOGUE_ACTIVE';
              endingScene.lineIndex = 0;
              endingScene.typedChars = 0;
              endingScene.fadingOutText = false;
              syncDialogueUIState();
            }
          }
        } else if (endingScene.phase === 'DIALOGUE_ACTIVE') {
          endingScene.zoomBlend = 1;
          state.facing = -1;

          if (endingScene.fadingOutText) {
            endingScene.fadeOutTimer += dt;
            if (endingScene.fadeOutTimer >= 0.24) {
              endingScene.fadingOutText = false;
              endingScene.fadeOutTimer = 0;
              endingScene.lineIndex += 1;
              endingScene.typedChars = 0;
              syncDialogueUIState();
            }
          } else {
            const currentLine =
              CHAPTER_1_ENDING_DIALOGUE[endingScene.lineIndex];
            if (
              currentLine &&
              endingScene.typedChars < currentLine.text.length
            ) {
              endingScene.typedChars = Math.min(
                currentLine.text.length,
                endingScene.typedChars + dt * 42
              );
              syncDialogueUIState();
            }
          }
        } else if (endingScene.phase === 'WALK_OFF') {
          endingScene.zoomBlend = 1;

          // Pliable walks off to the right alongside Christian and disappears off the right edge of the screen
          if (pl.visible) {
            if (pl.x < endingScene.cameraX + 1480) {
              plMoveDir = 1;
            } else {
              pl.visible = false;
              pl.vx = 0;
              plMoveDir = 0;
            }
          }

          // Obstinate turns around and walks back toward the City of Destruction, disappearing off the left edge of the screen
          if (ob.visible) {
            if (ob.x > endingScene.cameraX - 110) {
              obMoveDir = -1;
            } else {
              ob.visible = false;
              ob.vx = 0;
              obMoveDir = 0;
            }
          }

          // Once Christian, Pliable, and Obstinate have all walked off-screen, finish Chapter 1!
          if (
            state.x >= endingScene.cameraX + 1480 &&
            !pl.visible &&
            !ob.visible
          ) {
            endingScene.phase = 'COMPLETE';
            onDialogueModeChangeRef.current?.(false);
            state.completed = true;
            state.vx = 0;
            setLevelComplete(true);
          }
        }

        // Update Pliable's running/walking physics & animations
        const pursuerMoveSpeed = 780;
        if (pl.visible) {
          if (plMoveDir !== 0) pl.facing = plMoveDir;
          const plTargetVx = plMoveDir * pursuerMoveSpeed;
          const prevPlVx = pl.vx;
          const plAccelRate = plMoveDir === 0 ? 28 : 24;
          pl.vx += (plTargetVx - pl.vx) * Math.min(1, plAccelRate * dt);
          if (Math.abs(pl.vx) < 3 && plMoveDir === 0) pl.vx = 0;

          const plDvx = (pl.vx - prevPlVx) / Math.max(0.001, dt);
          const plTargetTilt = clamp((plDvx * pl.facing) / 9500, -0.25, 0.3);
          pl.accelTilt += (plTargetTilt - pl.accelTilt) * Math.min(1, dt * 10);

          pl.x += pl.vx * dt;
          if (
            endingScene.phase === 'ZOOM_AND_WALK' &&
            plMoveDir > 0 &&
            pl.x >= endingScene.pliableStopX
          ) {
            pl.x = endingScene.pliableStopX;
            pl.vx = 0;
          }

          const plSpeedAbs = Math.abs(pl.vx);
          const plTargetWalk = plSpeedAbs > 12 ? 1 : 0;
          const plTargetRun = plMoveDir !== 0 ? 1 : 0;
          pl.walkBlend += (plTargetWalk - pl.walkBlend) * Math.min(1, dt * 16);
          pl.runBlend += (plTargetRun - pl.runBlend) * Math.min(1, dt * 11);

          const isPlSpeaking =
            endingScene.phase === 'DIALOGUE_ACTIVE' &&
            !endingScene.fadingOutText &&
            CHAPTER_1_ENDING_DIALOGUE[endingScene.lineIndex]?.speaker ===
              'Pliable';
          pl.talkBlend +=
            ((isPlSpeaking ? 1 : 0) - pl.talkBlend) * Math.min(1, dt * 12);

          if (plSpeedAbs > 8) {
            const cycleDistance =
              lerp(325, 395, pl.runBlend) * CHAR_SCALE;
            const dCycle = (plSpeedAbs * dt) / cycleDistance;
            pl.gaitCycle = (pl.gaitCycle + dCycle) % 1;
            pl.walkArmCycle = (pl.walkArmCycle + dCycle * lerp(0.86, 1.0, pl.runBlend)) % 1;

            const stepIdx = Math.floor(((pl.gaitCycle + 0.02) % 1) * 2);
            if (stepIdx !== pl.prevStepIdx) {
              pl.prevStepIdx = stepIdx;
              spawnFootstepInkPuff(
                pl.x + pl.facing * 18 * CHAR_SCALE,
                pl.y,
                5,
                1.2
              );
            }
          } else {
            const nearestHalf = Math.round(pl.gaitCycle * 2) / 2;
            pl.gaitCycle =
              ((pl.gaitCycle +
                (nearestHalf - pl.gaitCycle) * Math.min(1, dt * 8)) %
                1 +
                1) %
              1;
            pl.walkArmCycle = pl.gaitCycle;
          }

          const plTargetCoat =
            (plSpeedAbs / runSpeed) * 0.75 +
            Math.sin(pl.gaitCycle * Math.PI * 4 - 0.5) *
              (0.14 + pl.runBlend * 0.28) *
              pl.walkBlend;
          const plCoatSpring =
            (plTargetCoat - pl.coatSway) * 135 - pl.coatSwayVel * 12;
          pl.coatSwayVel += plCoatSpring * dt;
          pl.coatSway += pl.coatSwayVel * dt;

          const plTargetHair =
            (plSpeedAbs / runSpeed) * 0.75 +
            Math.sin(pl.gaitCycle * Math.PI * 4) * 0.16 * pl.walkBlend;
          pl.hairFlutter +=
            (plTargetHair - pl.hairFlutter) * Math.min(1, dt * 14);
        }

        // Update Obstinate's running/walking physics & animations
        if (ob.visible) {
          if (obMoveDir !== 0) ob.facing = obMoveDir;
          const obTargetVx = obMoveDir * pursuerMoveSpeed;
          const prevObVx = ob.vx;
          const obAccelRate = obMoveDir === 0 ? 28 : 24;
          ob.vx += (obTargetVx - ob.vx) * Math.min(1, obAccelRate * dt);
          if (Math.abs(ob.vx) < 3 && obMoveDir === 0) ob.vx = 0;

          const obDvx = (ob.vx - prevObVx) / Math.max(0.001, dt);
          const obTargetTilt = clamp((obDvx * ob.facing) / 9500, -0.25, 0.3);
          ob.accelTilt += (obTargetTilt - ob.accelTilt) * Math.min(1, dt * 10);

          ob.x += ob.vx * dt;
          if (
            endingScene.phase === 'ZOOM_AND_WALK' &&
            obMoveDir > 0 &&
            ob.x >= endingScene.obstinateStopX
          ) {
            ob.x = endingScene.obstinateStopX;
            ob.vx = 0;
          }

          const obSpeedAbs = Math.abs(ob.vx);
          const obTargetWalk = obSpeedAbs > 12 ? 1 : 0;
          const obTargetRun = obMoveDir !== 0 ? 1 : 0;
          ob.walkBlend += (obTargetWalk - ob.walkBlend) * Math.min(1, dt * 16);
          ob.runBlend += (obTargetRun - ob.runBlend) * Math.min(1, dt * 11);

          const isObSpeaking =
            endingScene.phase === 'DIALOGUE_ACTIVE' &&
            !endingScene.fadingOutText &&
            CHAPTER_1_ENDING_DIALOGUE[endingScene.lineIndex]?.speaker ===
              'Obstinate';
          ob.talkBlend +=
            ((isObSpeaking ? 1 : 0) - ob.talkBlend) * Math.min(1, dt * 12);

          if (obSpeedAbs > 8) {
            const cycleDistance = lerp(325, 395, ob.runBlend) * CHAR_SCALE;
            const dCycle = (obSpeedAbs * dt) / cycleDistance;
            ob.gaitCycle = (ob.gaitCycle + dCycle) % 1;
            ob.walkArmCycle = (ob.walkArmCycle + dCycle * lerp(0.86, 1.0, ob.runBlend)) % 1;

            const stepIdx = Math.floor(((ob.gaitCycle + 0.02) % 1) * 2);
            if (stepIdx !== ob.prevStepIdx) {
              ob.prevStepIdx = stepIdx;
              spawnFootstepInkPuff(
                ob.x + ob.facing * 20 * CHAR_SCALE,
                ob.y,
                6,
                1.25
              );
            }
          } else {
            const nearestHalf = Math.round(ob.gaitCycle * 2) / 2;
            ob.gaitCycle =
              ((ob.gaitCycle +
                (nearestHalf - ob.gaitCycle) * Math.min(1, dt * 8)) %
                1 +
                1) %
              1;
            ob.walkArmCycle = ob.gaitCycle;
          }

          const obTargetCoat =
            (obSpeedAbs / runSpeed) * 0.75 +
            Math.sin(ob.gaitCycle * Math.PI * 4 - 0.5) *
              (0.14 + ob.runBlend * 0.28) *
              ob.walkBlend;
          const obCoatSpring =
            (obTargetCoat - ob.coatSway) * 135 - ob.coatSwayVel * 12;
          ob.coatSwayVel += obCoatSpring * dt;
          ob.coatSway += ob.coatSwayVel * dt;

          const obTargetHair =
            (obSpeedAbs / runSpeed) * 0.75 +
            Math.sin(ob.gaitCycle * Math.PI * 4) * 0.16 * ob.walkBlend;
          ob.hairFlutter +=
            (obTargetHair - ob.hairFlutter) * Math.min(1, dt * 14);
        }

        // Update Christian's upright speaking gesture blend during the ending dialogue
        const isChristianEndingSpeaking =
          endingScene.phase === 'DIALOGUE_ACTIVE' &&
          !endingScene.fadingOutText &&
          CHAPTER_1_ENDING_DIALOGUE[endingScene.lineIndex]?.speaker ===
            'Christian';
        state.endingTalkBlend +=
          ((isChristianEndingSpeaking ? 1 : 0) - state.endingTalkBlend) *
          Math.min(1, dt * 12);
      }

      // Smoothly update horizontal camera to follow Christian across the Chapter 1 level.
      // When moving left by ~5 steps (~350px), shift the camera so Christian is on the right side of the screen (W - 580 = 1340px),
      // leaving the left side open to see upcoming obstacles. When moving right by ~5 steps (~350px), shift back to the left side (580px).
      if (
        isChapterOne &&
        dialogueScene.phase === 'COMPLETE' &&
        endingScene.phase === 'INACTIVE' &&
        state.doorTransition.phase === 'NONE'
      ) {
        const CAMERA_TURN_STEPS_DIST = 350; // ~5 footsteps
        if (state.cameraLeadDir === 1) {
          if (state.x > state.cameraTurnAnchorX) {
            state.cameraTurnAnchorX = state.x;
          } else if (
            state.cameraTurnAnchorX - state.x >= CAMERA_TURN_STEPS_DIST &&
            state.facing === -1
          ) {
            state.cameraLeadDir = -1;
            state.cameraTurnAnchorX = state.x;
          }
        } else {
          if (state.x < state.cameraTurnAnchorX) {
            state.cameraTurnAnchorX = state.x;
          } else if (
            state.x - state.cameraTurnAnchorX >= CAMERA_TURN_STEPS_DIST &&
            state.facing === 1
          ) {
            state.cameraLeadDir = 1;
            state.cameraTurnAnchorX = state.x;
          }
        }
      } else {
        state.cameraLeadDir = 1;
        state.cameraTurnAnchorX = state.x;
      }

      const targetScreenOffsetX =
        state.cameraLeadDir === -1 ? W - 580 : 580; // 1340px (right side) when going left, 580px (left side) when going right
      state.cameraScreenOffsetX +=
        (targetScreenOffsetX - state.cameraScreenOffsetX) *
        Math.min(1, dt * 4.5);

      const targetCameraX =
        dialogueScene.phase !== 'COMPLETE'
          ? 0
          : endingScene.phase === 'ZOOM_AND_WALK' ||
            endingScene.phase === 'DIALOGUE_ACTIVE' ||
            endingScene.phase === 'WALK_OFF' ||
            endingScene.phase === 'COMPLETE'
          ? endingScene.cameraX
          : clamp(
              state.x - state.cameraScreenOffsetX,
              0,
              Math.max(0, LEVEL_WIDTH - W)
            );
      state.cameraX +=
        (targetCameraX - state.cameraX) * Math.min(1, dt * 10);
      const camX = state.cameraX;

      // Smoothly pan vertical camera upward when Christian climbs to elevated dead-end platforms or high obstacle paths
      let targetCameraY = 0;
      if (
        isChapterOne &&
        dialogueScene.phase === 'COMPLETE' &&
        endingScene.phase === 'INACTIVE'
      ) {
        if (state.y < 520) {
          targetCameraY = clamp(state.y - 520, -900, 0);
        }
      }
      state.cameraY +=
        (targetCameraY - state.cameraY) * Math.min(1, dt * 8.0);
      const camY = state.cameraY;

      // Clear canvas
      ctx.clearRect(0, 0, W, H);

      // Apply smooth Dialogue Mode zoom transform that lifts the ground line into the upper-middle of the screen
      // so the full bodies of all characters are 100% visible above the bottom dialogue box
      const activeZoomBlend = Math.max(
        dialogueScene.zoomBlend,
        endingScene.zoomBlend
      );
      const smoothZoom = smoothstep(0, 1, activeZoomBlend);
      const currentZoom = lerp(1.0, 1.38, smoothZoom);
      const screenGroundY = lerp(GROUND_Y, 695, smoothZoom);

      ctx.save();
      if (smoothZoom > 0.0001) {
        ctx.translate(0, screenGroundY);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(0, -GROUND_Y);
      }

      // Translate into scrolling world space (both horizontal and vertical so higher obstacle paths stay framed)
      ctx.save();
      ctx.translate(-camX, -camY);

      // 1. Draw strictly non-interactive background pen-and-ink city houses locked in world space!
      // Because they are drawn in world coordinates (not parallax-clipped), moving left or right never shifts
      // or slices a house, and the houses end cleanly with one final house at x = 48785 just past the last obstacle (48550),
      // leaving nothing more after that house except for grass!
      if (isChapterOne) {
        const firstHouseTile = Math.max(0, Math.floor(camX / W) * W);
        const lastVisibleX = camX + W;
        for (let tx = firstHouseTile; tx <= Math.min(48000, lastVisibleX); tx += W) {
          if (tx < 48000) {
            const tileIdx = Math.floor(tx / W) % cityTiles.length;
            ctx.drawImage(cityTiles[tileIdx], tx, 0);
          } else if (tx === 48000) {
            ctx.drawImage(cityEndCanvas, tx, 0);
          }
        }
      }

      // 2. Draw pen-and-ink grass and floor clipped to each solid ground segment
      for (const seg of groundSegments) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(seg.x1, GROUND_Y - 40, seg.x2 - seg.x1, GROUND_H);
        ctx.clip();
        const startTile = Math.floor(seg.x1 / W) * W;
        for (let tx = startTile; tx < seg.x2; tx += W) {
          ctx.drawImage(groundCanvas, tx, 0);
        }
        ctx.restore();
      }

      // 2B. Draw Chapter 1 level obstacles (ink-black sludge/tar pits, solid ink-black blocks, belly-crawl barriers, and wall-jump climbs)
      drawChapterOneLevelElements(now);

      // 3. Update & draw ink footstep dust puffs
      for (let i = dustPuffs.length - 1; i >= 0; i--) {
        const p = dustPuffs[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          dustPuffs.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 140 * dt;
        const progress = p.life / p.maxLife;
        const curAlpha = p.alpha * (1 - progress);
        ctx.fillStyle = `rgba(14, 7, 4, ${curAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + progress * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Draw Evangelist (opening dialogue), Obstinate & Pliable (ending dialogue), and Christian
      drawEvangelistCharacter();
      drawObstinateCharacter();
      drawPliableCharacter();
      drawPilgrimCharacter();

      // 5. Draw subtle foreground pen-and-ink grass blades along the boot contact line for each solid ground segment
      for (const seg of groundSegments) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(seg.x1, GROUND_Y - 40, seg.x2 - seg.x1, 120);
        ctx.clip();
        const startTile = Math.floor(seg.x1 / W) * W;
        for (let tx = startTile; tx < seg.x2; tx += W) {
          ctx.drawImage(fgGrassCanvas, tx, 0);
        }
        ctx.restore();
      }

      ctx.restore(); // End world camera translation
      ctx.restore(); // End dialogue zoom transform

      // 6. Draw Door Dimension Fade-to-Black Screen Overlay
      if (state.doorTransition.fadeAlpha > 0.001) {
        ctx.save();
        ctx.fillStyle = `rgba(4, 1, 0, ${clamp(
          state.doorTransition.fadeAlpha,
          0,
          1
        )})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      frameId = requestAnimationFrame(renderLoop);
    };

    frameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [active, chapter, levelResetKey]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="w-full h-full pointer-events-none select-none block"
      />

      {/* Top HUD: 3 Black Silhouette Keys Counter & Locked Exit Gate Notice */}
      {(chapter ?? 1) === 1 && !dialogueUI.visible && !levelComplete && !isDead && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-5 sm:p-7">
          <div
            className="pointer-events-auto flex items-center gap-3 px-4 py-2 border-2 border-[#140603] shadow-[4px_4px_0px_#140603]"
            style={{
              background: 'linear-gradient(180deg, #F6E6B8 0%, #DFC48D 100%)',
              fontFamily: "'IM Fell English', serif",
            }}
          >
            <span
              className="text-sm sm:text-base uppercase tracking-[0.14em] font-bold text-[#140603]"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              Keys
            </span>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((idx) => {
                const collected = idx <= collectedKeysCount;
                return (
                  <svg
                    key={idx}
                    width="18"
                    height="28"
                    viewBox="0 0 24 36"
                    className={`transition-transform duration-300 ${
                      collected ? 'scale-110 opacity-100' : 'scale-95 opacity-25'
                    }`}
                  >
                    <circle cx="12" cy="9" r="6.5" fill="#040100" />
                    <circle cx="12" cy="9" r="2.5" fill="#F2DFB2" />
                    <rect x="10" y="15" width="4" height="17" fill="#040100" />
                    <rect x="14" y="22" width="6" height="3" fill="#040100" />
                    <rect x="14" y="27" width="7" height="3.5" fill="#040100" />
                  </svg>
                );
              })}
            </div>
            <span className="text-sm sm:text-base font-bold text-[#140603] ml-1">
              {collectedKeysCount} / 3
            </span>
          </div>
        </div>
      )}

      {/* Centered Popup in the Middle of the Screen when walking up to the final wall without all 3 keys */}
      {(chapter ?? 1) === 1 &&
        lockedGateWarning &&
        collectedKeysCount < 3 &&
        !dialogueUI.visible &&
        !levelComplete &&
        !isDead && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-6">
            <div
              className="relative px-9 py-6 flex flex-col items-center text-center rounded-sm border-[3.5px] border-[#140603] shadow-[0_16px_42px_rgba(0,0,0,0.82)]"
              style={{
                background:
                  'linear-gradient(180deg, #F6E6B8 0%, #EAD39C 55%, #D8BC82 100%)',
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                textShadow: '0 1px 0 rgba(255, 248, 220, 0.6)',
              }}
            >
              <div className="pointer-events-none absolute inset-[6px] border-[1.8px] border-[#1A0803]/75" />
              <p className="relative text-[28px] sm:text-[32px] leading-snug tracking-[0.04em] text-[#0E0502]">
                Collect All Three Keys To Finish This Chapter
              </p>
            </div>
          </div>
        )}

      {/* Bottom Dialogue Speech Box (positioned low in the lower grass area below the characters' boots) */}
      {dialogueUI.visible && (
        <div
          onClick={() => skipDialogueRef.current?.()}
          className="pointer-events-auto absolute inset-x-0 bottom-[1.8vh] z-40 flex justify-center px-6 cursor-pointer"
        >
          <div
            className="relative w-full max-w-[860px] px-8 pt-3.5 pb-2.5 flex flex-col justify-between rounded-sm border-[3px] border-[#140603] shadow-[0_12px_32px_rgba(0,0,0,0.75)]"
            style={{
              background:
                'linear-gradient(180deg, #F6E6B8 0%, #EAD39C 58%, #D8BC82 100%)',
              fontFamily: "'IM Fell English', serif",
              textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
            }}
          >
            {/* Inner 17th-century double-ruled ink border */}
            <div className="pointer-events-none absolute inset-[5px] border-[1.5px] border-[#1A0803]/75" />

            {/* Dialogue Speaker & Typewriter Words (fades out between lines when skipped while keeping the box) */}
            <div
              className={`transition-opacity duration-200 ${
                dialogueUI.fadingOut ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <div
                className="text-[22px] font-bold tracking-wide text-[#0E0502] leading-tight"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                {dialogueUI.speaker}:
              </div>
              <p className="text-[21px] leading-snug text-[#120602] tracking-[0.01em] min-h-[48px] mt-0.5">
                {dialogueUI.visibleText}
              </p>
            </div>

            {/* Bottom Click To Skip Button */}
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  skipDialogueRef.current?.();
                }}
                className="group inline-flex items-center gap-1.5 px-2 py-0.5 text-[17px] tracking-[0.06em] text-[#2B1107] hover:text-[#6B1A0E] transition-colors duration-150 cursor-pointer bg-transparent border-0 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                <span>Click To Skip</span>
                <span className="inline-block transition-transform duration-150 group-hover:translate-x-1">
                  ▸
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fade-to-Black Death Screen when Christian falls into a tar pit */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-[#040100] transition-opacity duration-700 ${
          isDead
            ? 'opacity-100 pointer-events-auto cursor-default'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{ cursor: isDead ? 'default' : undefined }}
      >
        <div
          className="flex flex-col items-center text-center px-8 max-w-[640px]"
          style={{ fontFamily: "'IM Fell English', serif" }}
        >
          <p
            className="text-[19px] tracking-[0.26em] uppercase text-[#B89962]/80 mb-2"
            style={{
              fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            }}
          >
            Chapter I • The City Of Destruction
          </p>

          <h2
            className="text-[48px] leading-tight tracking-[0.04em] text-[#F3DFB4] drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]"
            style={{
              fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
            }}
          >
            Thou Hast Fallen Upon The Way
          </h2>

          <p className="mt-2 text-[22px] italic text-[#D7BE8C]/90">
            “Watch and be sober, lest the snares of the plain overtake thy steps before the Wicket-Gate.”
          </p>

          {/* Ornamental 17th-century divider */}
          <div className="my-6 flex items-center justify-center gap-3 w-72 opacity-80">
            <span className="h-[1.5px] flex-1 bg-[#C8A970]" />
            <span className="w-2.5 h-2.5 rotate-45 bg-[#C8A970]" />
            <span className="h-[1.5px] flex-1 bg-[#C8A970]" />
          </div>

          <div className="mt-2 flex flex-col items-center gap-5 w-full">
            <button
              type="button"
              disabled={!isDead}
              tabIndex={isDead ? 0 : -1}
              onClick={(e) => {
                if (!isDead) return;
                e.currentTarget.blur();
                soundFX.playPageTurn('next');
                skipDialogueOnRestartRef.current = true;
                setLevelResetKey((k) => k + 1);
              }}
              className="group flex flex-col items-center gap-1.5 text-[#F3DFB4] hover:text-[#E59A52] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              <span className="w-64 h-[2px] bg-[#C8A970]/80 group-hover:bg-[#E59A52] transition-colors duration-150 rounded-full" />
              <span className="text-[28px] leading-tight tracking-[0.08em] px-4 py-0.5">
                Restart Chapter 1
              </span>
              <span className="w-64 h-[2px] bg-[#C8A970]/80 group-hover:bg-[#E59A52] transition-colors duration-150 rounded-full" />
            </button>

            <button
              type="button"
              disabled={!isDead}
              tabIndex={isDead ? 0 : -1}
              onClick={(e) => {
                if (!isDead) return;
                e.currentTarget.blur();
                onReturnToMenu?.();
              }}
              className="group flex flex-col items-center gap-1.5 text-[#D7BE8C] hover:text-[#E59A52] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              <span className="w-64 h-[1.5px] bg-[#9E8250]/75 group-hover:bg-[#E59A52] transition-colors duration-150 rounded-full" />
              <span className="text-[24px] leading-tight tracking-[0.08em] px-4 py-0.5">
                Return To Main Menu
              </span>
              <span className="w-64 h-[1.5px] bg-[#9E8250]/75 group-hover:bg-[#E59A52] transition-colors duration-150 rounded-full" />
            </button>
          </div>
        </div>
      </div>

      {/* Chapter 1 Complete Overlay upon reaching The Wicket-Gate */}
      {levelComplete && (
        <div
          className="pointer-events-auto cursor-default absolute inset-0 z-40 flex items-center justify-center bg-[#0C0502]/60 backdrop-blur-[2px] select-none"
          style={{ cursor: 'default' }}
        >
          <div
            className="relative w-[480px] px-10 py-9 flex flex-col items-center text-center rounded-sm border-[3.5px] border-[#140603] shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
            style={{
              background:
                'linear-gradient(180deg, #F6E6B8 0%, #EAD39C 55%, #D8BC82 100%)',
              fontFamily: "'IM Fell English', serif",
              textShadow: '0 1px 0 rgba(255, 248, 220, 0.55)',
            }}
          >
            <div className="pointer-events-none absolute inset-[7px] border-[1.8px] border-[#1A0803]/75" />

            <h2
              className="text-[36px] leading-tight tracking-wide text-[#0E0502]"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              Chapter 1 Complete
            </h2>
            <p className="mt-1 text-[19px] italic text-[#1A0803]">
              Christian has successfully fled from the city of destruction
            </p>

            <div className="my-3 flex items-center justify-center gap-2.5 w-56 opacity-85">
              <span className="h-[1.8px] flex-1 bg-[#1A0803]" />
              <span className="w-2 h-2 rotate-45 bg-[#1A0803]" />
              <span className="h-[1.8px] flex-1 bg-[#1A0803]" />
            </div>

            <div className="mt-3 flex flex-col items-center gap-4 w-full">
              <button
                type="button"
                onClick={() => onNextChapter?.(2)}
                className="group flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                <span className="text-[25px] leading-tight tracking-[0.06em] px-3 py-0.5">
                  Continue to Chapter 2
                </span>
                <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFX.playPageTurn('prev');
                  setLevelResetKey((k) => k + 1);
                }}
                className="group flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                <span className="w-56 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                <span className="text-[23px] leading-tight tracking-[0.06em] px-3 py-0.5">
                  Replay Chapter 1
                </span>
                <span className="w-56 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
              </button>

              <button
                type="button"
                onClick={() => onReturnToMenu?.()}
                className="group flex flex-col items-center gap-1 text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] active:scale-[0.98] transition-all duration-150 cursor-pointer bg-transparent border-0 p-1 focus:outline-none"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
                <span className="text-[23px] leading-tight tracking-[0.06em] px-3 py-0.5">
                  Return To Main Menu
                </span>
                <span className="w-60 h-[2px] bg-[#160703] group-hover:bg-[#6B1A0E] transition-colors duration-150 rounded-full opacity-85" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
