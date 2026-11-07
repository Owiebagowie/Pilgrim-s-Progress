import React, { useEffect, useRef, useState } from 'react';
import { soundFX } from '../utils/sound';

interface ChapterOneLevelProps {
  onReturnToBook: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpikeHazard extends Rect {
  orientation: 'up' | 'down' | 'left' | 'right';
}

interface InkBlot {
  x: number;
  y: number;
  r: number;
  seed: number;
}

interface InkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ParchmentStain {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  color: string;
  alpha: number;
}

interface AmbientSpeck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
}

interface Checkpoint {
  x: number;
  y: number;
  label: string;
}

interface ParchmentNote {
  x: number;
  y: number;
  lines: string[];
}

export const ChapterOneLevel: React.FC<ChapterOneLevelProps> = ({
  onReturnToBook,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [deathCount, setDeathCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // ================= LEVEL GEOMETRY: CHAPTER 1 - THE CITY OF DESTRUCTION =================
    // World coordinates: X from 0 to 4600, Y from -200 to 1100 (ground baseline ~680)
    const solidPlatforms: Rect[] = [
      // Boundary left wall
      { x: -60, y: 0, w: 80, h: 900 },
      // Section 1: Starting street of the City of Destruction
      { x: 0, y: 660, w: 620, h: 260 },
      // Low ruined step to jump onto
      { x: 420, y: 575, w: 180, h: 85 },
      // Gap 1 (spike pit below at y: 740) -> Landing ledge
      { x: 740, y: 550, w: 310, h: 370 },
      // Floor under first spike pit
      { x: 600, y: 760, w: 160, h: 160 },

      // Section 2: Climbable Wall Tower & Upper Walk
      // High tower block on right of climbable wall 1
      { x: 1260, y: 390, w: 240, h: 530 },
      // Lower floor beneath Climbable Wall 1 with spikes
      { x: 1050, y: 760, w: 230, h: 160 },

      // Section 3: Wall-Jump Chimney Shaft (Two vertical walls facing each other)
      // Left shaft pillar
      { x: 1640, y: 190, w: 95, h: 510 },
      // Right shaft pillar
      { x: 1875, y: 140, w: 110, h: 680 },
      // Safe ledge at top of chimney
      { x: 1985, y: 260, w: 320, h: 660 },
      // Spike floor below chimney
      { x: 1500, y: 780, w: 500, h: 150 },

      // Section 4: The High Aqueduct & Controlled Free-Fall Drop (Hold S + Release Space)
      // Overhanging ceiling block
      { x: 2440, y: 60, w: 640, h: 90 },
      // Left spike bed ledge below aqueduct
      { x: 2305, y: 690, w: 265, h: 230 },
      // Safe narrow landing island in the middle (for Hold S + Release Space free-fall!)
      { x: 2570, y: 650, w: 190, h: 270 },
      // Right spike bed ledge below aqueduct
      { x: 2760, y: 690, w: 250, h: 230 },
      // Divider pillar after drop zone
      { x: 3010, y: 490, w: 190, h: 430 },

      // Section 5: The Crumbling Viaduct & Final Climb to the City Gate
      // Mid-air stone pier
      { x: 3390, y: 540, w: 150, h: 380 },
      // Final high bastion before the City Gate exit
      { x: 3890, y: 370, w: 650, h: 550 },
    ];

    // Climbable Ink-Crosshatched Walls (Player can grip with Space in air, climb WASD, tap Space to wall-jump, WASD+Space to directional jump, Hold S+Release Space to free-fall)
    const climbableWalls: Rect[] = [
      // Climbable Wall 1: Broad masonry wall bridging Section 1 to Section 2 top
      { x: 1080, y: 340, w: 190, h: 340 },
      // Climbable Wall 2A & 2B: Inside edges & surface of the Wall-Jump Chimney
      { x: 1720, y: 200, w: 45, h: 470 },
      { x: 1845, y: 150, w: 45, h: 530 },
      // Climbable Wall 3: High Aqueduct Trellis (Climb right across the chasm, avoid spikes below, line up over the safe island at x: 2600..2730, and Hold S + Release Space to Free Fall!)
      { x: 2340, y: 150, w: 640, h: 210 },
      // Climbable Wall 4A & 4B: Final Viaduct Ascent panels
      { x: 3220, y: 310, w: 150, h: 290 },
      { x: 3580, y: 250, w: 280, h: 320 },
    ];

    // Deadly Hand-Drawn Ink Spikes
    const spikes: SpikeHazard[] = [
      // Pit 1 spikes
      { x: 625, y: 734, w: 110, h: 26, orientation: 'up' },
      // Pit 2 spikes under Wall 1
      { x: 1065, y: 734, w: 185, h: 26, orientation: 'up' },
      // Chimney floor spikes
      { x: 1520, y: 754, w: 440, h: 26, orientation: 'up' },
      // Aqueduct left spike bed (punishes dropping too early!)
      { x: 2320, y: 664, w: 235, h: 26, orientation: 'up' },
      // Aqueduct right spike bed (punishes dropping too late!)
      { x: 2775, y: 664, w: 220, h: 26, orientation: 'up' },
      // Underside spikes on middle of Aqueduct trellis (requires climbing down/around)
      { x: 2530, y: 360, w: 110, h: 22, orientation: 'down' },
    ];

    // Checkpoints along the level
    const checkpoints: Checkpoint[] = [
      { x: 120, y: 660, label: 'Start' },
      { x: 840, y: 550, label: 'Watchtower Base' },
      { x: 1350, y: 390, label: 'Upper Battlement' },
      { x: 2080, y: 260, label: 'Bellfreed Overlook' },
      { x: 3080, y: 490, label: 'Outer Wall' },
    ];

    const goalPortal = { x: 4220, y: 370, w: 110, h: 170 };

    // 17th-Century Marginalia Ink Notes on the Parchment
    const parchmentNotes: ParchmentNote[] = [
      {
        x: 190,
        y: 430,
        lines: [
          'Press A & D to haste forth',
          'Press SPACE to leap over the mire',
        ],
      },
      {
        x: 930,
        y: 250,
        lines: [
          'In mid-air upon a hatched wall:',
          'HOLD SPACE to grip & climb with W A S D',
          'Press SPACE again with W A S D to leap that way',
        ],
      },
      {
        x: 1620,
        y: 105,
        lines: [
          'TAP SPACE (do not hold) upon a wall',
          'to rebound with a swift Wall-Jump',
        ],
      },
      {
        x: 2640,
        y: 445,
        lines: [
          'Beware the spikes below!',
          'Hold S while releasing SPACE',
          'to Free-Fall straight down to safety',
        ],
      },
      {
        x: 3690,
        y: 185,
        lines: [
          'Grip, climb, and leap toward',
          'the Gate beyond the doomed City',
        ],
      },
    ];

    // Static decorative ink blotches on the parchment world
    const worldInkBlots: InkBlot[] = [
      { x: 390, y: 695, r: 18, seed: 1.1 },
      { x: 615, y: 585, r: 12, seed: 2.3 },
      { x: 1045, y: 575, r: 16, seed: 3.7 },
      { x: 1280, y: 420, r: 22, seed: 4.5 },
      { x: 1665, y: 320, r: 15, seed: 5.2 },
      { x: 1910, y: 240, r: 19, seed: 6.8 },
      { x: 2480, y: 110, r: 24, seed: 7.4 },
      { x: 2660, y: 710, r: 16, seed: 8.1 },
      { x: 3060, y: 535, r: 20, seed: 9.3 },
      { x: 3440, y: 590, r: 17, seed: 10.6 },
      { x: 3960, y: 415, r: 25, seed: 11.2 },
    ];

    // Aged parchment stain rings & blemishes in screen/parallax space
    const parchmentStains: ParchmentStain[] = [
      { x: 280, y: 180, rx: 190, ry: 140, rotation: 0.3, color: '#B8894A', alpha: 0.16 },
      { x: 820, y: 520, rx: 240, ry: 175, rotation: -0.4, color: '#A47134', alpha: 0.14 },
      { x: 1380, y: 240, rx: 165, ry: 150, rotation: 0.8, color: '#C29456', alpha: 0.18 },
      { x: 1950, y: 480, rx: 280, ry: 190, rotation: 0.15, color: '#9C682D', alpha: 0.13 },
      { x: 2560, y: 220, rx: 220, ry: 160, rotation: -0.25, color: '#B38242', alpha: 0.16 },
      { x: 3180, y: 540, rx: 250, ry: 180, rotation: 0.5, color: '#A16E32', alpha: 0.15 },
      { x: 3820, y: 290, rx: 210, ry: 165, rotation: -0.35, color: '#B8894A', alpha: 0.17 },
    ];

    // Small ambient particles drifting across the parchment
    const ambientSpecks: AmbientSpeck[] = Array.from({ length: 38 }, () => ({
      x: Math.random() * 2000,
      y: Math.random() * 1080,
      vx: -0.15 - Math.random() * 0.25,
      vy: -0.08 + (Math.random() - 0.5) * 0.2,
      r: 1.0 + Math.random() * 1.8,
      alpha: 0.15 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
    }));

    // Dynamic ink splatter particles from footsteps, jumps, wall grips, and deaths
    const inkParticles: InkParticle[] = [];

    const spawnInkSplatter = (
      px: number,
      py: number,
      count: number,
      speedScale = 1,
      biasVx = 0,
      biasVy = 0
    ) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.8 + Math.random() * 3.8) * speedScale;
        inkParticles.push({
          x: px + (Math.random() - 0.5) * 10,
          y: py + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed + biasVx,
          vy: Math.sin(angle) * speed + biasVy,
          r: 1.6 + Math.random() * 3.6,
          alpha: 0.85 + Math.random() * 0.15,
          life: 0,
          maxLife: 24 + Math.random() * 26,
        });
      }
    };

    // ================= PLAYER STATE & PRINCE OF PERSIA PARKOUR PHYSICS =================
    const player = {
      x: 120,
      y: 660 - 54,
      w: 28,
      h: 54,
      vx: 0,
      vy: 0,
      facing: 1 as 1 | -1,
      onGround: false,
      coyoteTimer: 0,
      // Wall grip & wall jump state
      isGrippingWall: false,
      gripSpaceStillHeld: false,
      gripStartTime: 0,
      hasReleasedSpaceInAir: false,
      wallNormalX: 0 as -1 | 0 | 1, // -1 if wall is on right, +1 if wall is on left, 0 if on 2D background climbable wall
      wallJumpCooldown: 0,
      isFreeFalling: false,
      // Animation timers
      runCycle: 0,
      climbCycle: 0,
      coatSway: 0,
      activeCheckpoint: 0,
      isDead: false,
      respawnTimer: 0,
      completed: false,
    };

    // Input tracking
    const keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
    };

    // Helper: Check if player overlaps or touches any climbable wall
    const findClimbableWallContact = (): {
      overlapping: boolean;
      wall: Rect | null;
      normalX: -1 | 0 | 1;
    } => {
      const margin = 8;
      const px = player.x;
      const py = player.y;
      const pw = player.w;
      const ph = player.h;

      // 1. Check dedicated climbable hatched walls
      for (const cw of climbableWalls) {
        if (
          px + pw + margin > cw.x &&
          px - margin < cw.x + cw.w &&
          py + ph > cw.y + 4 &&
          py < cw.y + cw.h - 4
        ) {
          // Determine if player is near the left or right edge for wall-jump direction
          const centerPlayer = px + pw * 0.5;
          const centerWall = cw.x + cw.w * 0.5;
          let normalX: -1 | 0 | 1 = 0;
          if (cw.w <= 65) {
            normalX = centerPlayer < centerWall ? -1 : 1;
          }
          return { overlapping: true, wall: cw, normalX };
        }
      }

      // 2. Also allow wall-jumping / gripping vertical side faces of solid stone towers when in air
      for (const plat of solidPlatforms) {
        if (plat.x < 0) continue; // skip world boundary
        const verticalOverlap = py + ph > plat.y + 10 && py < plat.y + plat.h - 10;
        if (!verticalOverlap) continue;

        // Touching left vertical face of platform
        if (Math.abs(px + pw - plat.x) <= margin) {
          return { overlapping: true, wall: plat, normalX: -1 };
        }
        // Touching right vertical face of platform
        if (Math.abs(px - (plat.x + plat.w)) <= margin) {
          return { overlapping: true, wall: plat, normalX: 1 };
        }
      }

      return { overlapping: false, wall: null, normalX: 0 };
    };

    const executeWallJump = (contactNormalX: -1 | 0 | 1) => {
      player.isGrippingWall = false;
      player.gripSpaceStillHeld = false;
      player.isFreeFalling = false;
      player.wallJumpCooldown = 12;

      // Determine jump direction from WASD or wall normal
      let dirX = 0;
      let dirY = -1;

      if (keys.a) dirX -= 1;
      if (keys.d) dirX += 1;
      if (keys.w) dirY = -1.15;
      else if (keys.s) dirY = 0.45;

      if (dirX === 0) {
        if (contactNormalX !== 0) {
          dirX = contactNormalX;
        } else {
          dirX = -player.facing;
        }
      }

      player.vx = dirX * 8.4;
      player.vy = dirY * 11.4;
      if (dirX !== 0) {
        player.facing = dirX > 0 ? 1 : -1;
      }

      soundFX.playWallJump();
      spawnInkSplatter(
        player.x + player.w * 0.5,
        player.y + player.h * 0.5,
        14,
        1.3,
        -player.vx * 0.25,
        -player.vy * 0.15
      );
    };

    const executeDirectionalWallLeap = () => {
      player.isGrippingWall = false;
      player.gripSpaceStillHeld = false;
      player.isFreeFalling = false;
      player.wallJumpCooldown = 10;

      let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      let dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);

      if (dx === 0 && dy === 0) {
        // Default upward leap off wall
        dy = -1;
        dx = player.wallNormalX !== 0 ? player.wallNormalX : player.facing;
      }

      if (dx !== 0) {
        player.vx = dx * 8.6;
        player.facing = dx > 0 ? 1 : -1;
      } else {
        player.vx = 0;
      }

      if (dy < 0) {
        player.vy = -11.8;
      } else if (dy > 0) {
        player.vy = 6.5;
      } else {
        player.vy = -9.6;
      }

      soundFX.playWallJump();
      spawnInkSplatter(
        player.x + player.w * 0.5,
        player.y + player.h * 0.5,
        14,
        1.25,
        -player.vx * 0.2,
        -player.vy * 0.2
      );
    };

    const executeFreeFall = () => {
      player.isGrippingWall = false;
      player.gripSpaceStillHeld = false;
      player.isFreeFalling = true;
      player.vx = 0;
      player.vy = 5.5;
      soundFX.playFreeFall();
      spawnInkSplatter(player.x + player.w * 0.5, player.y + 12, 8, 0.9, 0, -1.5);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onReturnToBook();
        return;
      }

      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') keys.a = true;
      if (code === 'KeyD' || code === 'ArrowRight') keys.d = true;
      if (code === 'KeyW' || code === 'ArrowUp') keys.w = true;
      if (code === 'KeyS' || code === 'ArrowDown') keys.s = true;

      if (code === 'Space') {
        e.preventDefault();
        if (keys.space) return; // Ignore key repeat
        keys.space = true;

        if (player.isDead || player.completed) return;

        // 1. If already gripping a climbable wall (and Space was released previously while staying on wall):
        // "and if you are using WASD when you press space again you jump in that direction"
        if (player.isGrippingWall) {
          executeDirectionalWallLeap();
          return;
        }

        // 2. If on the ground (or within coyote time): Normal Jump
        if (player.onGround || player.coyoteTimer > 0) {
          player.vy = -11.6;
          player.onGround = false;
          player.coyoteTimer = 0;
          player.hasReleasedSpaceInAir = false;
          player.isFreeFalling = false;
          soundFX.playJump();
          spawnInkSplatter(player.x + player.w * 0.5, player.y + player.h, 10, 1.0, 0, -1);
          return;
        }

        // 3. In the air! Check if overlapping/touching a climbable wall:
        // "if pressed jump again and hold while in the air on a climbable wall you grip the wall and use WASD to move left right up and down the wall"
        const contact = findClimbableWallContact();
        if (contact.overlapping && contact.wall) {
          player.isGrippingWall = true;
          player.gripSpaceStillHeld = true;
          player.gripStartTime = performance.now();
          player.wallNormalX = contact.normalX;
          player.vx = 0;
          player.vy = 0;
          player.isFreeFalling = false;
          soundFX.playWallGrip();
          spawnInkSplatter(player.x + player.w * 0.5, player.y + player.h * 0.4, 8, 0.8);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') keys.a = false;
      if (code === 'KeyD' || code === 'ArrowRight') keys.d = false;
      if (code === 'KeyW' || code === 'ArrowUp') keys.w = false;
      if (code === 'KeyS' || code === 'ArrowDown') keys.s = false;

      if (code === 'Space') {
        keys.space = false;
        player.hasReleasedSpaceInAir = true;

        if (player.isGrippingWall && player.gripSpaceStillHeld) {
          player.gripSpaceStillHeld = false;
          const heldDuration = performance.now() - player.gripStartTime;

          // "and if you are holding S while you let go of the space bar you free fall onto ground below, or into a pit or some spikes"
          if (keys.s) {
            executeFreeFall();
            return;
          }

          // "When you tap but dont hold on a wall you do a wall jump."
          if (heldDuration < 220) {
            executeWallJump(player.wallNormalX);
            return;
          }
          // Otherwise, if they held Space >= 220ms and released Space without holding S,
          // they remain gripping the wall so they can climb with WASD and press Space again with WASD to jump in that direction!
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ================= PEN & INK PROCEDURAL DRAWING HELPERS =================
    // Deterministic pseudo-random offset for organic hand-drawn line imperfections
    const inkJitter = (seed: number) => {
      const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };

    const drawSketchyInkLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      seed: number,
      lineWidth = 3,
      wobble = 2.4
    ) => {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.floor(dist / 22));
      ctx.beginPath();
      ctx.moveTo(x1 + inkJitter(seed) * 1.2, y1 + inkJitter(seed + 1) * 1.2);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = x1 + (x2 - x1) * t;
        const by = y1 + (y2 - y1) * t;
        const jx = inkJitter(seed + i * 3.1) * wobble;
        const jy = inkJitter(seed + i * 5.7) * wobble;
        ctx.lineTo(bx + jx, by + jy);
      }
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = '#0E0603';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Secondary thin quill double-stroke for hand-inked imperfection
      ctx.beginPath();
      ctx.moveTo(x1 + inkJitter(seed + 9) * 1.8, y1 + inkJitter(seed + 10) * 1.8);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = x1 + (x2 - x1) * t;
        const by = y1 + (y2 - y1) * t;
        const jx = inkJitter(seed + i * 7.3 + 20) * (wobble * 1.15);
        const jy = inkJitter(seed + i * 4.1 + 30) * (wobble * 1.15);
        ctx.lineTo(bx + jx, by + jy);
      }
      ctx.lineWidth = lineWidth * 0.45;
      ctx.strokeStyle = 'rgba(18, 7, 3, 0.72)';
      ctx.stroke();
    };

    const drawInkBlot = (x: number, y: number, r: number, seed: number) => {
      ctx.save();
      ctx.fillStyle = '#0D0502';
      ctx.beginPath();
      const points = 12;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const rad = r * (0.72 + 0.42 * Math.abs(inkJitter(seed + i * 2.3)));
        const px = x + Math.cos(angle) * rad;
        const py = y + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Satellite tiny ink droplets around blotch
      for (let d = 0; d < 4; d++) {
        const ang = inkJitter(seed + d * 9.1) * Math.PI;
        const dist = r * (1.3 + Math.abs(inkJitter(seed + d * 4.7)) * 0.9);
        const dr = Math.max(1.2, r * 0.18 * Math.abs(inkJitter(seed + d * 6.3)));
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, dr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawClimbableInkWall = (rect: Rect, idx: number) => {
      const seed = (idx + 1) * 41.3;
      // Subtle sepia-ink wash behind climbable masonry/trellis
      ctx.fillStyle = 'rgba(22, 9, 4, 0.13)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      // Diagonal quill cross-hatching inside climbable wall
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();

      const spacing = 18;
      for (let offset = -rect.h; offset < rect.w + rect.h; offset += spacing) {
        drawSketchyInkLine(
          rect.x + offset,
          rect.y,
          rect.x + offset - rect.h * 0.7,
          rect.y + rect.h,
          seed + offset,
          1.7,
          1.5
        );
        drawSketchyInkLine(
          rect.x + offset - rect.h * 0.7,
          rect.y,
          rect.x + offset,
          rect.y + rect.h,
          seed + offset + 50,
          1.4,
          1.5
        );
      }
      ctx.restore();

      // Sketchy outer frame with protruding stone handholds on left & right edges
      drawSketchyInkLine(rect.x, rect.y, rect.x + rect.w, rect.y, seed + 1, 3.2, 2.2);
      drawSketchyInkLine(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h, seed + 2, 3.2, 2.2);
      drawSketchyInkLine(rect.x, rect.y, rect.x, rect.y + rect.h, seed + 3, 3.4, 2.5);
      drawSketchyInkLine(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, seed + 4, 3.4, 2.5);

      // Handhold notches along vertical sides
      for (let y = rect.y + 16; y < rect.y + rect.h - 14; y += 26) {
        ctx.fillStyle = '#0E0603';
        ctx.fillRect(rect.x - 5, y, 8, 9);
        ctx.fillRect(rect.x + rect.w - 3, y + 10, 8, 9);
      }

      drawInkBlot(rect.x + 12, rect.y + 14, 7, seed + 11);
      drawInkBlot(rect.x + rect.w - 14, rect.y + rect.h - 16, 8, seed + 19);
    };

    const drawSolidInkPlatform = (rect: Rect, idx: number) => {
      if (rect.x < 0) return; // Don't draw invisible left boundary
      const seed = (idx + 1) * 19.7;

      // Solid black ink crust along the top & edges, fading into dense pen cross-hatching below
      ctx.fillStyle = '#110703';
      ctx.fillRect(rect.x, rect.y, rect.w, Math.min(rect.h, 24));

      ctx.fillStyle = 'rgba(17, 7, 3, 0.88)';
      ctx.fillRect(rect.x + 2, rect.y + 20, rect.w - 4, rect.h - 20);

      // Parchment cut-out hatching lines near the top edge for woodcut/engraving look
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 211, 167, 0.28)';
      ctx.lineWidth = 1.6;
      for (let x = rect.x + 10; x < rect.x + rect.w - 10; x += 14) {
        const len = 12 + Math.abs(inkJitter(seed + x)) * 28;
        ctx.beginPath();
        ctx.moveTo(x, rect.y + 22);
        ctx.lineTo(x - 6, rect.y + 22 + len);
        ctx.stroke();
      }
      ctx.restore();

      // Imperfect wobbly top & side ink borders
      drawSketchyInkLine(rect.x - 2, rect.y, rect.x + rect.w + 2, rect.y, seed + 1, 4.5, 2.8);
      drawSketchyInkLine(rect.x, rect.y, rect.x, rect.y + rect.h, seed + 2, 4.0, 2.4);
      drawSketchyInkLine(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, seed + 3, 4.0, 2.4);
    };

    const drawInkSpikes = (sp: SpikeHazard, idx: number) => {
      const spikeWidth = 18;
      const count = Math.max(2, Math.floor(sp.w / spikeWidth));
      ctx.save();
      ctx.fillStyle = '#0D0502';
      ctx.strokeStyle = '#0D0502';
      ctx.lineWidth = 2.2;

      for (let i = 0; i < count; i++) {
        const sx = sp.x + i * spikeWidth;
        const jx = inkJitter(idx * 31 + i) * 2.2;
        const jy = inkJitter(idx * 17 + i) * 2.5;
        ctx.beginPath();
        if (sp.orientation === 'up') {
          ctx.moveTo(sx, sp.y + sp.h);
          ctx.lineTo(sx + spikeWidth * 0.5 + jx, sp.y + jy);
          ctx.lineTo(sx + spikeWidth, sp.y + sp.h);
        } else {
          ctx.moveTo(sx, sp.y);
          ctx.lineTo(sx + spikeWidth * 0.5 + jx, sp.y + sp.h + jy);
          ctx.lineTo(sx + spikeWidth, sp.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };

    // ================= DRAW CHRISTIAN (BLACK SILHOUETTE, NO HAT, NORMAL PANTS, OLD-TIMEY COAT, BIG BACKPACK BURDEN) =================
    const drawChristian = (time: number) => {
      if (player.isDead) return;

      const cx = player.x + player.w * 0.5;
      const bottomY = player.y + player.h;
      const dir = player.facing;

      ctx.save();
      ctx.translate(cx, bottomY);

      // Slight body lean based on movement state
      let leanAngle = 0;
      if (player.isGrippingWall) {
        leanAngle = dir * -0.06;
      } else if (!player.onGround) {
        leanAngle = Math.max(-0.22, Math.min(0.22, player.vx * 0.025));
      } else {
        leanAngle = player.vx * 0.018;
      }
      ctx.rotate(leanAngle);
      ctx.scale(dir, 1);

      const inkColor = '#0B0402';
      ctx.fillStyle = inkColor;
      ctx.strokeStyle = inkColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Compute leg & arm stride angles
      let legSwing = 0;
      let kneeBendL = 0;
      let kneeBendR = 0;
      let bodyBob = 0;

      if (player.isGrippingWall) {
        legSwing = Math.sin(player.climbCycle) * 7;
        kneeBendL = 6 + Math.sin(player.climbCycle) * 4;
        kneeBendR = 6 - Math.sin(player.climbCycle) * 4;
        bodyBob = Math.cos(player.climbCycle * 2) * 1.5;
      } else if (!player.onGround) {
        if (player.isFreeFalling) {
          legSwing = 4;
          kneeBendL = 8;
          kneeBendR = 10;
        } else {
          legSwing = 10;
          kneeBendL = player.vy < 0 ? 8 : 3;
          kneeBendR = player.vy < 0 ? 12 : 5;
        }
      } else if (Math.abs(player.vx) > 0.3) {
        legSwing = Math.sin(player.runCycle) * 11;
        kneeBendL = Math.max(0, -Math.cos(player.runCycle) * 7);
        kneeBendR = Math.max(0, Math.cos(player.runCycle) * 7);
        bodyBob = Math.abs(Math.sin(player.runCycle)) * -3.2;
      } else {
        bodyBob = Math.sin(time * 2.6) * 0.8;
      }

      // 1. BIG BACKPACK BURDEN / LOAD ON HIS BACK (Just like The Pilgrim's Progress)
      // Positioned behind his upper back/shoulders (-X side in local facing coordinates)
      ctx.save();
      const burdenBob = bodyBob * 1.15 - Math.abs(player.vx) * 0.25;
      ctx.translate(-11, -35 + burdenBob);
      ctx.rotate(-0.22 - Math.min(0.18, Math.abs(player.vx) * 0.02));

      // Bulging heavy sack silhouette
      ctx.beginPath();
      ctx.moveTo(-14, -15);
      ctx.bezierCurveTo(-24, -12, -26, 8, -16, 17);
      ctx.bezierCurveTo(-8, 22, 6, 20, 10, 12);
      ctx.bezierCurveTo(13, 2, 11, -14, -2, -17);
      ctx.closePath();
      ctx.fill();

      // Tied sack knot & protruding cloth ears at top of the burden
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.lineTo(-12, -24);
      ctx.lineTo(-3, -20);
      ctx.lineTo(3, -25);
      ctx.lineTo(2, -16);
      ctx.closePath();
      ctx.fill();

      // Faint parchment-toned rope bindings across the black burden so its volume reads clearly
      ctx.strokeStyle = 'rgba(230, 208, 165, 0.38)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-19, -4);
      ctx.quadraticCurveTo(-4, 2, 9, -3);
      ctx.moveTo(-17, 7);
      ctx.quadraticCurveTo(-3, 11, 8, 6);
      ctx.moveTo(-7, -15);
      ctx.quadraticCurveTo(-9, 2, -5, 18);
      ctx.stroke();
      ctx.restore();

      // Shoulder straps holding the heavy burden to Christian's chest
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = 2.8;

      // 2. NORMAL PANTS (Two articulated legs in black ink silhouette)
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = 5.5;

      // Back leg
      ctx.beginPath();
      ctx.moveTo(-2, -21 + bodyBob);
      ctx.lineTo(-2 - legSwing * 0.55 - kneeBendL * 0.3, -10 + bodyBob * 0.5);
      ctx.lineTo(-3 - legSwing, 0 - kneeBendL * 0.4);
      ctx.stroke();

      // Front leg
      ctx.beginPath();
      ctx.moveTo(2, -21 + bodyBob);
      ctx.lineTo(2 + legSwing * 0.6 + kneeBendR * 0.2, -10 + bodyBob * 0.5);
      ctx.lineTo(3 + legSwing, 0 - kneeBendR * 0.4);
      ctx.stroke();

      // 3. TORSO & OLD-TIMEY 17TH-CENTURY FROCK COAT (With flaring coat-tails trailing behind)
      const tailFlutter =
        Math.sin(time * 9 + player.x * 0.08) * (1.5 + Math.abs(player.vx) * 0.6) +
        Math.max(-8, Math.min(10, -player.vx * 1.1)) +
        Math.max(-6, Math.min(10, player.vy * 0.7));

      ctx.fillStyle = inkColor;
      ctx.beginPath();
      // Neck / high coat collar
      ctx.moveTo(-5, -40 + bodyBob);
      ctx.lineTo(6, -40 + bodyBob);
      // Chest front
      ctx.lineTo(8, -24 + bodyBob);
      // Front coat hem
      ctx.lineTo(9, -15 + bodyBob);
      // Split front-to-back coat cut
      ctx.lineTo(1, -18 + bodyBob);
      // Flowing old-timey coat-tail trailing behind
      ctx.quadraticCurveTo(
        -9 - Math.abs(tailFlutter) * 0.4,
        -13 + bodyBob + tailFlutter * 0.4,
        -17 - Math.abs(tailFlutter) * 0.6,
        -11 + bodyBob + tailFlutter * 0.5
      );
      ctx.quadraticCurveTo(
        -13 - Math.abs(tailFlutter) * 0.3,
        -22 + bodyBob,
        -7,
        -32 + bodyBob
      );
      ctx.closePath();
      ctx.fill();

      // Upturned 17th-century coat collar & lapel notch
      ctx.beginPath();
      ctx.moveTo(4, -40 + bodyBob);
      ctx.lineTo(9, -43 + bodyBob);
      ctx.lineTo(7, -36 + bodyBob);
      ctx.closePath();
      ctx.fill();

      // 4. ARMS (Swinging while running or reaching up/out while climbing a wall)
      ctx.lineWidth = 4.4;
      ctx.strokeStyle = inkColor;
      if (player.isGrippingWall) {
        const reachY = -44 + Math.sin(player.climbCycle) * 7 + bodyBob;
        const reachY2 = -44 - Math.sin(player.climbCycle) * 7 + bodyBob;
        ctx.beginPath();
        ctx.moveTo(3, -36 + bodyBob);
        ctx.lineTo(11, reachY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-2, -36 + bodyBob);
        ctx.lineTo(9, reachY2);
        ctx.stroke();
      } else {
        const armSwing = -legSwing * 0.65;
        ctx.beginPath();
        ctx.moveTo(2, -36 + bodyBob);
        ctx.lineTo(4 + armSwing * 0.5, -24 + bodyBob);
        ctx.lineTo(7 + armSwing, -18 + bodyBob);
        ctx.stroke();
      }

      // 5. HEAD (Pure Black Ink Silhouette with Tousled Hair — NO HAT!)
      ctx.save();
      ctx.translate(2, -48 + bodyBob);
      // Head silhouette oval
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
      ctx.fill();

      // Expressive ink-drawn windblown hair locks (strictly no hat)
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.quadraticCurveTo(-11, -7, -9, -2);
      ctx.quadraticCurveTo(-12, 0, -7, 2);
      ctx.moveTo(-3, -6.5);
      ctx.quadraticCurveTo(-7, -10, -2, -7.5);
      ctx.moveTo(1, -7);
      ctx.quadraticCurveTo(-2, -11, 4, -6.5);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    };

    // ================= CAMERA STATE =================
    const camera = {
      x: 0,
      y: 120,
    };

    // ================= MAIN GAME LOOP =================
    let lastFootstepSplatter = 0;
    const startTime = performance.now();

    const updateAndRender = (now: number) => {
      const elapsed = (now - startTime) * 0.001;

      // 1. UPDATE PHYSICS
      if (player.isDead) {
        player.respawnTimer--;
        if (player.respawnTimer <= 0) {
          const cp = checkpoints[player.activeCheckpoint];
          player.x = cp.x;
          player.y = cp.y - player.h;
          player.vx = 0;
          player.vy = 0;
          player.isGrippingWall = false;
          player.gripSpaceStillHeld = false;
          player.isFreeFalling = false;
          player.isDead = false;
          spawnInkSplatter(player.x + player.w * 0.5, player.y + player.h * 0.5, 16, 1.1);
        }
      } else if (!player.completed) {
        if (player.wallJumpCooldown > 0) {
          player.wallJumpCooldown--;
        }

        if (player.isGrippingWall) {
          // Verify player is still overlapping a climbable wall
          const contact = findClimbableWallContact();
          if (!contact.overlapping) {
            player.isGrippingWall = false;
            player.gripSpaceStillHeld = false;
          } else {
            player.wallNormalX = contact.normalX;
            // Climb Left, Right, Up, Down on the wall using WASD!
            const climbSpeedX = 3.4;
            const climbSpeedY = 3.6;
            player.vx = ((keys.d ? 1 : 0) - (keys.a ? 1 : 0)) * climbSpeedX;
            player.vy = ((keys.s ? 1 : 0) - (keys.w ? 1 : 0)) * climbSpeedY;

            if (player.vx > 0.1) player.facing = 1;
            else if (player.vx < -0.1) player.facing = -1;

            if (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) {
              player.climbCycle += 0.22;
              if (now - lastFootstepSplatter > 180) {
                lastFootstepSplatter = now;
                spawnInkSplatter(
                  player.x + player.w * 0.5,
                  player.y + player.h * 0.5,
                  2,
                  0.45
                );
              }
            }
          }
        } else {
          // Normal horizontal movement (A and D)
          const moveInput = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
          if (player.wallJumpCooldown === 0) {
            const targetVx = moveInput * 5.6;
            const accel = player.onGround ? 0.35 : 0.18;
            player.vx += (targetVx - player.vx) * accel;
            if (moveInput !== 0) {
              player.facing = moveInput > 0 ? 1 : -1;
            }
          }

          // Gravity
          const gravity = player.isFreeFalling ? 0.68 : 0.52;
          player.vy = Math.min(15.5, player.vy + gravity);
        }

        // Apply Horizontal Velocity & Resolve Solid Collisions
        player.x += player.vx;
        for (const plat of solidPlatforms) {
          if (
            player.x + player.w > plat.x &&
            player.x < plat.x + plat.w &&
            player.y + player.h > plat.y + 4 &&
            player.y < plat.y + plat.h - 4
          ) {
            if (player.vx > 0) {
              player.x = plat.x - player.w;
              player.vx = 0;
            } else if (player.vx < 0) {
              player.x = plat.x + plat.w;
              player.vx = 0;
            }
          }
        }

        // Apply Vertical Velocity & Resolve Solid Collisions
        const wasOnGround = player.onGround;
        player.onGround = false;
        player.y += player.vy;

        for (const plat of solidPlatforms) {
          if (
            player.x + player.w > plat.x + 3 &&
            player.x < plat.x + plat.w - 3 &&
            player.y + player.h > plat.y &&
            player.y < plat.y + plat.h
          ) {
            if (player.vy >= 0 && player.y + player.h - player.vy <= plat.y + 14) {
              player.y = plat.y - player.h;
              if (player.vy > 7) {
                spawnInkSplatter(player.x + player.w * 0.5, player.y + player.h, 9, 0.9);
              }
              player.vy = 0;
              player.onGround = true;
              player.isFreeFalling = false;
              player.isGrippingWall = false;
              player.gripSpaceStillHeld = false;
            } else if (player.vy < 0 && player.y - player.vy >= plat.y + plat.h - 14) {
              player.y = plat.y + plat.h;
              player.vy = 0;
            }
          }
        }

        if (player.onGround) {
          player.coyoteTimer = 7;
          if (Math.abs(player.vx) > 0.6) {
            player.runCycle += Math.abs(player.vx) * 0.065;
            if (now - lastFootstepSplatter > 150) {
              lastFootstepSplatter = now;
              spawnInkSplatter(
                player.x + player.w * 0.5,
                player.y + player.h,
                2,
                0.4,
                -player.vx * 0.2,
                -0.6
              );
            }
          } else {
            player.runCycle = 0;
          }
        } else {
          if (wasOnGround) {
            player.coyoteTimer = 7;
          } else if (player.coyoteTimer > 0) {
            player.coyoteTimer--;
          }
        }

        // Update Checkpoints
        for (let i = checkpoints.length - 1; i >= 0; i--) {
          if (player.x >= checkpoints[i].x - 20 && i > player.activeCheckpoint) {
            player.activeCheckpoint = i;
            spawnInkSplatter(checkpoints[i].x, checkpoints[i].y - 30, 12, 1.0);
          }
        }

        // Check Spike Collisions & Bottomless Pit Fall
        let hitHazard = false;
        if (player.y > 900) {
          hitHazard = true;
        } else {
          for (const sp of spikes) {
            if (
              player.x + player.w - 5 > sp.x &&
              player.x + 5 < sp.x + sp.w &&
              player.y + player.h - 3 > sp.y &&
              player.y + 4 < sp.y + sp.h
            ) {
              hitHazard = true;
              break;
            }
          }
        }

        if (hitHazard) {
          player.isDead = true;
          player.respawnTimer = 42;
          soundFX.playInkDeath();
          setDeathCount((c) => c + 1);
          spawnInkSplatter(
            player.x + player.w * 0.5,
            Math.min(820, player.y + player.h * 0.5),
            34,
            1.8
          );
        }

        // Check Goal Arch Completion
        if (
          player.x + player.w > goalPortal.x &&
          player.x < goalPortal.x + goalPortal.w &&
          player.y + player.h > goalPortal.y - 160 &&
          player.y < goalPortal.y + 40
        ) {
          player.completed = true;
          soundFX.playChapterComplete();
          setIsCompleted(true);
        }
      }

      // Smooth Camera Follow
      const targetCamX = Math.max(0, Math.min(4600 - width, player.x - width * 0.36));
      const targetCamY = Math.max(
        -120,
        Math.min(340, player.y - height * 0.52)
      );
      camera.x += (targetCamX - camera.x) * 0.1;
      camera.y += (targetCamY - camera.y) * 0.08;

      // ================= 2. RENDER PARCHMENT BACKGROUND & BLEMISHES =================
      const bgGrad = ctx.createRadialGradient(
        width * 0.45,
        height * 0.45,
        width * 0.08,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      bgGrad.addColorStop(0, '#EFE0BE');
      bgGrad.addColorStop(0.45, '#E2CAA0');
      bgGrad.addColorStop(0.8, '#CCA972');
      bgGrad.addColorStop(1, '#9E7742');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle horizontal laid-parchment grain lines
      ctx.fillStyle = 'rgba(120, 82, 36, 0.045)';
      for (let y = 0; y < height; y += 6) {
        ctx.fillRect(0, y, width, 1.5);
      }

      // Parallax Parchment Stains, Water Rings & Color Inconsistencies
      ctx.save();
      for (const st of parchmentStains) {
        const sx = st.x - camera.x * 0.45;
        const sy = st.y - camera.y * 0.35;
        if (sx + st.rx < -100 || sx - st.rx > width + 100) continue;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(st.rotation);
        const stGrad = ctx.createRadialGradient(0, 0, st.rx * 0.15, 0, 0, st.rx);
        stGrad.addColorStop(0, `rgba(166, 115, 56, ${st.alpha * 0.5})`);
        stGrad.addColorStop(0.65, `rgba(148, 98, 42, ${st.alpha})`);
        stGrad.addColorStop(0.88, `rgba(115, 72, 26, ${st.alpha * 1.35})`); // Darker water-stain rim
        stGrad.addColorStop(1, 'rgba(115, 72, 26, 0)');
        ctx.fillStyle = stGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, st.rx, st.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Parallax Distant Pen-and-Ink Silhouettes of the Crumbling City of Destruction
      ctx.save();
      ctx.translate(-camera.x * 0.25, -camera.y * 0.15);
      ctx.strokeStyle = 'rgba(28, 12, 5, 0.16)';
      ctx.fillStyle = 'rgba(28, 12, 5, 0.06)';
      ctx.lineWidth = 2;
      for (let bx = 80; bx < 3400; bx += 260) {
        const bh = 180 + Math.abs(inkJitter(bx)) * 220;
        const bw = 95 + Math.abs(inkJitter(bx + 7)) * 85;
        const by = 640 - bh;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        // Jagged ruined roof spires
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw * 0.5, by - 45);
        ctx.lineTo(bx + bw, by);
        ctx.stroke();
      }
      ctx.restore();

      // ================= 3. RENDER WORLD PLATFORMS, CLIMBABLE WALLS, SPIKES & CHRISTIAN =================
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      // Parchment Marginalia Ink Notes (Tutorial & Lore inscriptions)
      ctx.save();
      ctx.fillStyle = 'rgba(26, 10, 4, 0.78)';
      ctx.font = "italic 20px 'IM Fell English', serif";
      ctx.textAlign = 'center';
      for (const note of parchmentNotes) {
        note.lines.forEach((line, idx) => {
          ctx.fillText(line, note.x, note.y + idx * 25);
        });
      }
      ctx.restore();

      // Static decorative ink blotches on the parchment
      for (const blot of worldInkBlots) {
        drawInkBlot(blot.x, blot.y, blot.r, blot.seed);
      }

      // Climbable Walls (hatched masonry & timber)
      climbableWalls.forEach((cw, idx) => {
        drawClimbableInkWall(cw, idx);
      });

      // Solid Pen-and-Ink Platforms
      solidPlatforms.forEach((plat, idx) => {
        drawSolidInkPlatform(plat, idx);
      });

      // Spikes
      spikes.forEach((sp, idx) => {
        drawInkSpikes(sp, idx);
      });

      // Checkpoints (17th-century ink-drawn waymarkers)
      checkpoints.forEach((cp, idx) => {
        if (idx === 0) return;
        const isPassed = player.activeCheckpoint >= idx;
        drawSketchyInkLine(cp.x, cp.y, cp.x, cp.y - 52, idx * 13, 3.2, 1.5);
        drawSketchyInkLine(cp.x - 12, cp.y - 38, cp.x + 12, cp.y - 38, idx * 17, 2.8, 1.2);
        if (isPassed) {
          drawInkBlot(cp.x, cp.y - 38, 6.5, idx * 23);
        }
      });

      // Exit Gate at the End of Chapter 1 (The Way Out of the City of Destruction)
      ctx.save();
      const gx = goalPortal.x;
      const gy = goalPortal.y;
      drawSketchyInkLine(gx, gy, gx, gy - 135, 901, 5, 2.2);
      drawSketchyInkLine(gx + 96, gy, gx + 96, gy - 135, 902, 5, 2.2);
      drawSketchyInkLine(gx - 12, gy - 135, gx + 108, gy - 135, 903, 5.5, 2.2);
      drawSketchyInkLine(gx + 8, gy - 135, gx + 48, gy - 175, 904, 4.5, 2.0);
      drawSketchyInkLine(gx + 88, gy - 135, gx + 48, gy - 175, 905, 4.5, 2.0);
      ctx.font = "22px 'IM Fell English SC', serif";
      ctx.fillStyle = '#120602';
      ctx.textAlign = 'center';
      ctx.fillText('BEYOND THE CITY', gx + 48, gy - 190);
      ctx.restore();

      // Dynamic Ink Splatter Particles
      for (let i = inkParticles.length - 1; i >= 0; i--) {
        const p = inkParticles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        if (p.life >= p.maxLife) {
          inkParticles.splice(i, 1);
          continue;
        }
        const ratio = 1 - p.life / p.maxLife;
        ctx.fillStyle = `rgba(12, 5, 2, ${p.alpha * ratio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + 0.5 * ratio), 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Christian
      drawChristian(elapsed);

      ctx.restore();

      // ================= 4. SMALL AMBIENT PARCHMENT PARTICLES & AGED VIGNETTE =================
      for (const sp of ambientSpecks) {
        sp.phase += 0.02;
        sp.x += sp.vx + Math.sin(sp.phase) * 0.15;
        sp.y += sp.vy + Math.cos(sp.phase) * 0.1;
        if (sp.x < -10) sp.x = width + 10;
        if (sp.x > width + 10) sp.x = -10;
        if (sp.y < -10) sp.y = height + 10;
        if (sp.y > height + 10) sp.y = -10;

        ctx.fillStyle = `rgba(42, 18, 7, ${sp.alpha})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Deckled Aged Parchment Edge Vignette
      const vig = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.36,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.72
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(0.75, 'rgba(68, 38, 14, 0.18)');
      vig.addColorStop(1, 'rgba(28, 12, 4, 0.62)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);

      animationFrameId = requestAnimationFrame(updateAndRender);
    };

    animationFrameId = requestAnimationFrame(updateAndRender);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onReturnToBook]);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden select-none bg-[#DEC492]">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Top Header Overlay in 17th-Century Ink Typography */}
      <div
        className="fixed top-5 left-7 right-7 flex items-center justify-between pointer-events-none z-50 text-[#120602]"
        style={{
          fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
        }}
      >
        <button
          type="button"
          onClick={onReturnToBook}
          className="pointer-events-auto cursor-pointer text-[21px] tracking-wide border-t-2 border-b-2 border-[#160703]/80 hover:border-[#6B1A0E] hover:text-[#6B1A0E] px-3 py-0.5 transition-all duration-150 bg-transparent"
        >
          Return to Book
        </button>

        <div className="text-center">
          <div className="text-[28px] tracking-wider leading-tight">
            Chapter I &middot; The City Of Destruction
          </div>
        </div>

        <div className="text-[19px] tracking-wide opacity-80 tabular-nums">
          Falls: {deathCount}
        </div>
      </div>

      {/* Chapter 1 Completion Parchment Overlay */}
      {isCompleted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A0B04]/65 backdrop-blur-[2px]"
          style={{
            fontFamily: "'IM Fell English', serif",
          }}
        >
          <div
            className="relative max-w-lg w-full mx-6 p-10 text-center text-[#120602] rounded-md shadow-2xl border-4 border-[#140603]"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, #F6E6B8 0%, #E6CE94 70%, #C8A96E 100%)',
            }}
          >
            <h2
              className="text-[42px] leading-tight tracking-wide"
              style={{
                fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
              }}
            >
              Chapter I Completed
            </h2>
            <p className="mt-3 text-[21px] italic leading-relaxed text-[#1A0803]">
              Christian has fled the City of Destruction, bearing his heavy burden toward the Wicket Gate.
            </p>

            <div className="mt-8 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={onReturnToBook}
                className="cursor-pointer py-1 px-4 border-t-2 border-b-2 border-[#160703]/85 hover:border-[#6B1A0E] text-[24px] text-[#120602] hover:text-[#6B1A0E] hover:scale-[1.04] transition-all duration-150 bg-transparent"
                style={{
                  fontFamily: "'IM Fell English SC', 'IM Fell English', serif",
                }}
              >
                Return to Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
