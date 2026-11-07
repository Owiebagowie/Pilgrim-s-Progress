import React from 'react';

interface WoodenTableBackgroundProps {
  /** Normalized flame X offset (-1 to 1) from flicker */
  flickerX: number;
  /** Normalized flame Y offset (-1 to 1) from flicker */
  flickerY: number;
  /** Candlelight intensity multiplier (0.85 to 1.15) */
  intensity: number;
}

export const WoodenTableBackground: React.FC<WoodenTableBackgroundProps> = ({
  flickerX,
  flickerY,
  intensity,
}) => {
  // Light source anchored in the top-left corner, moving and flickering organically
  const lightCenterX = 7 + flickerX * 2.2;
  const lightCenterY = 8 + flickerY * 2.0;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Base Cartoon Wood Tabletop SVG - Rogue Prince of Persia inspired bold ink & vibrant cel-shading */}
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full block"
      >
        <defs>
          {/* Rich vibrant cel-shaded plank base gradients angled from bright top-left to deep bottom-right */}
          <linearGradient id="plank-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B85328" />
            <stop offset="32%" stopColor="#9A421E" />
            <stop offset="68%" stopColor="#7C2E14" />
            <stop offset="100%" stopColor="#48180B" />
          </linearGradient>

          <linearGradient id="plank-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#AD4A22" />
            <stop offset="28%" stopColor="#883617" />
            <stop offset="62%" stopColor="#6D2610" />
            <stop offset="100%" stopColor="#3B1308" />
          </linearGradient>

          <linearGradient id="plank-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A64B24" />
            <stop offset="28%" stopColor="#8C3818" />
            <stop offset="64%" stopColor="#6E2610" />
            <stop offset="100%" stopColor="#421509" />
          </linearGradient>

          <linearGradient id="plank-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8A3617" />
            <stop offset="30%" stopColor="#732910" />
            <stop offset="68%" stopColor="#561C0B" />
            <stop offset="100%" stopColor="#2E0D05" />
          </linearGradient>

          {/* Dynamic Top-Left Candlelight Highlight Gradient on Wood Grain */}
          <radialGradient
            id="candle-wood-sheen"
            cx={`${lightCenterX}%`}
            cy={`${lightCenterY}%`}
            r={`${68 * intensity}%`}
          >
            <stop offset="0%" stopColor="#FFF0A8" stopOpacity={0.68 * intensity} />
            <stop offset="18%" stopColor="#FFDF73" stopOpacity={0.48 * intensity} />
            <stop offset="42%" stopColor="#F59E0B" stopOpacity={0.25 * intensity} />
            <stop offset="72%" stopColor="#B45309" stopOpacity={0.08 * intensity} />
            <stop offset="100%" stopColor="#1A0905" stopOpacity="0" />
          </radialGradient>

          {/* Knot interior depth gradient */}
          <radialGradient id="knot-depth" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#1C0804" />
            <stop offset="45%" stopColor="#471609" />
            <stop offset="80%" stopColor="#6E2711" />
            <stop offset="100%" stopColor="#8F3819" />
          </radialGradient>
        </defs>

        {/* ================= PLANK 1 (TOP: Y 0 to 215) ================= */}
        <g>
          <rect x="0" y="0" width="1920" height="215" fill="url(#plank-1)" />
          {/* Cel-shaded warm highlight bands */}
          <path
            d="M0,45 Q380,15 760,55 T1520,40 L1920,55 L1920,115 Q1480,95 960,125 T0,105 Z"
            fill="#D96B34"
            opacity="0.36"
          />
          <path
            d="M0,155 Q420,185 880,145 T1920,175 L1920,215 L0,215 Z"
            fill="#4A170A"
            opacity="0.48"
          />

          {/* Wood Knot 1A (Upper Left - catches strong top-left candlelight) */}
          <g transform="translate(290, 108)">
            <ellipse cx="0" cy="0" rx="82" ry="36" fill="url(#knot-depth)" stroke="#1E0904" strokeWidth="3.5" />
            <ellipse cx="-4" cy="0" rx="58" ry="25" fill="none" stroke="#1A0703" strokeWidth="3" />
            <ellipse cx="-6" cy="0" rx="36" ry="15" fill="#2B0B04" stroke="#140502" strokeWidth="2.8" />
            <ellipse cx="-8" cy="0" rx="16" ry="7" fill="#120401" />
            {/* Candlelight warm rim on knot facing top-left */}
            <path d="M-74,-8 A78,32 0 0,1 55,-20" fill="none" stroke="#FDE047" strokeWidth="3" opacity={0.62 * intensity} strokeLinecap="round" />
            <path d="M-12,-3 L8,4 M-5,5 L6,-4" stroke="#120401" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* Wood Knot 1B (Upper Right) */}
          <g transform="translate(1590, 92)">
            <ellipse cx="0" cy="0" rx="68" ry="28" fill="url(#knot-depth)" stroke="#1A0703" strokeWidth="3.5" />
            <ellipse cx="3" cy="1" rx="44" ry="18" fill="none" stroke="#140502" strokeWidth="2.8" />
            <ellipse cx="4" cy="1" rx="20" ry="8" fill="#160502" />
          </g>

          {/* Flowing Wood Striations around Knots */}
          <path
            d="M0,32 Q150,36 210,65 Q290,42 375,68 Q620,98 980,72 T1510,58 Q1590,42 1670,62 T1920,48"
            fill="none"
            stroke="#240B04"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M0,74 Q140,80 198,98 Q290,52 385,96 Q580,128 920,104 T1500,88 Q1590,52 1680,90 T1920,84"
            fill="none"
            stroke="#2C0E05"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M0,138 Q145,132 202,120 Q290,164 382,122 Q640,95 1040,142 T1505,105 Q1590,140 1675,108 T1920,134"
            fill="none"
            stroke="#240B04"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0,182 Q290,204 540,168 T1180,185 T1680,162 L1920,178"
            fill="none"
            stroke="#1E0803"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Top-left golden woodgrain highlights */}
          <path
            d="M15,36 Q145,40 205,68 M22,78 Q135,84 195,102 M385,72 Q580,102 820,80 M40,144 Q155,138 205,125"
            fill="none"
            stroke="#FDE047"
            strokeWidth="2.4"
            opacity={0.55 * intensity}
            strokeLinecap="round"
          />
          {/* Fine ink hatch striations */}
          <path
            d="M620,38 Q780,22 940,42 M1120,118 Q1290,104 1430,122 M80,158 Q170,170 250,162"
            fill="none"
            stroke="#381207"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* ================= PLANK 2 (UPPER-MID: Y 215 to 495) ================= */}
        <g>
          <rect x="0" y="215" width="1920" height="280" fill="url(#plank-2)" />
          {/* Cel-shaded warm tone sweeps */}
          <path
            d="M0,250 Q480,220 920,268 T1920,245 L1920,350 Q1380,385 840,335 T0,365 Z"
            fill="#D96B34"
            opacity="0.3"
          />
          <path
            d="M0,425 Q540,465 1120,415 T1920,440 L1920,495 L0,495 Z"
            fill="#330F06"
            opacity="0.55"
          />

          {/* Large Expressive Knot 2A (Right of center) */}
          <g transform="translate(1395, 355)">
            <ellipse cx="0" cy="0" rx="95" ry="44" fill="url(#knot-depth)" stroke="#1A0703" strokeWidth="4" />
            <ellipse cx="-5" cy="2" rx="68" ry="30" fill="none" stroke="#140502" strokeWidth="3.2" />
            <ellipse cx="-8" cy="2" rx="42" ry="18" fill="#260A04" stroke="#140502" strokeWidth="2.8" />
            <ellipse cx="-10" cy="2" rx="18" ry="8" fill="#120401" />
            <path d="M-85,-10 A88,38 0 0,1 40,-34" fill="none" stroke="#F59E0B" strokeWidth="2.2" opacity={0.3 * intensity} strokeLinecap="round" />
          </g>

          {/* Small Knot 2B (Left) */}
          <g transform="translate(185, 325)">
            <ellipse cx="0" cy="0" rx="58" ry="25" fill="url(#knot-depth)" stroke="#1E0803" strokeWidth="3.2" />
            <ellipse cx="2" cy="0" rx="34" ry="14" fill="none" stroke="#140502" strokeWidth="2.6" />
            <ellipse cx="3" cy="0" rx="14" ry="6" fill="#120401" />
            <path d="M-48,-8 A52,20 0 0,1 42,-10" fill="none" stroke="#FDE047" strokeWidth="2.5" opacity={0.52 * intensity} strokeLinecap="round" />
          </g>

          {/* Bold Woodgrain Striations */}
          <path
            d="M0,255 Q95,262 132,292 Q185,274 240,294 Q510,312 860,275 T1290,315 Q1395,288 1500,320 T1920,285"
            fill="none"
            stroke="#220A04"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M0,335 Q90,328 124,328 Q185,364 246,330 Q520,288 890,342 T1285,345 Q1395,292 1508,348 T1920,338"
            fill="none"
            stroke="#2B0E05"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M0,395 Q360,425 740,382 T1288,372 Q1395,422 1505,375 T1920,405"
            fill="none"
            stroke="#220A04"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M0,452 Q420,478 830,438 T1420,455 T1920,448"
            fill="none"
            stroke="#1A0703"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Top-left golden woodgrain striations */}
          <path
            d="M25,259 Q140,248 255,284 Q420,295 620,272 M30,362 Q145,382 290,352 Q460,328 650,354"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="2.2"
            opacity={0.44 * intensity}
            strokeLinecap="round"
          />
        </g>

        {/* ================= PLANK 3 (LOWER-MID: Y 495 to 795) ================= */}
        <g>
          <rect x="0" y="495" width="1920" height="300" fill="url(#plank-3)" />
          {/* Vibrant cel-shaded grain bands */}
          <path
            d="M0,535 Q390,505 820,552 T1640,528 L1920,545 L1920,645 Q1420,615 880,665 T0,635 Z"
            fill="#DF7138"
            opacity="0.28"
          />
          <path
            d="M0,715 Q480,758 1020,708 T1920,735 L1920,795 L0,795 Z"
            fill="#3B1207"
            opacity="0.52"
          />

          {/* Expressive Wood Knot 3A (Lower Left) */}
          <g transform="translate(385, 635)">
            <ellipse cx="0" cy="0" rx="88" ry="38" fill="url(#knot-depth)" stroke="#1C0803" strokeWidth="3.8" />
            <ellipse cx="4" cy="-1" rx="62" ry="26" fill="none" stroke="#140502" strokeWidth="3" />
            <ellipse cx="6" cy="-1" rx="36" ry="15" fill="#280B04" stroke="#140502" strokeWidth="2.6" />
            <ellipse cx="8" cy="-1" rx="15" ry="6" fill="#120401" />
            {/* Warm candlelight rim on top-left of knot */}
            <path d="M-78,-10 A82,34 0 0,1 35,-30" fill="none" stroke="#FBBF24" strokeWidth="2.5" opacity={0.38 * intensity} strokeLinecap="round" />
          </g>

          {/* Wood Knot 3B (Far Right) */}
          <g transform="translate(1720, 615)">
            <ellipse cx="0" cy="0" rx="64" ry="27" fill="url(#knot-depth)" stroke="#1A0703" strokeWidth="3.4" />
            <ellipse cx="-3" cy="0" rx="38" ry="15" fill="none" stroke="#140502" strokeWidth="2.6" />
            <ellipse cx="-5" cy="0" rx="16" ry="6" fill="#120401" />
          </g>

          {/* Flowing Wood Striations */}
          <path
            d="M0,542 Q180,522 295,585 Q385,572 478,588 Q880,635 1260,578 T1650,588 Q1720,568 1790,590 L1920,575"
            fill="none"
            stroke="#240B04"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M0,618 Q190,602 288,622 Q385,576 485,624 Q890,672 1280,618 T1648,612 Q1720,576 1792,614 L1920,618"
            fill="none"
            stroke="#2B0E05"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M0,678 Q190,692 290,652 Q385,696 482,654 Q910,632 1310,685 T1652,632 Q1720,658 1788,634 L1920,668"
            fill="none"
            stroke="#240B04"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M0,742 Q380,775 760,728 T1480,752 L1920,732"
            fill="none"
            stroke="#1C0803"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Golden candlelight grain highlights */}
          <path
            d="M45,546 Q175,528 285,575 M55,622 Q180,612 280,628"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="2"
            opacity={0.32 * intensity}
            strokeLinecap="round"
          />
        </g>

        {/* ================= PLANK 4 (BOTTOM: Y 795 to 1080) ================= */}
        <g>
          <rect x="0" y="795" width="1920" height="285" fill="url(#plank-4)" />
          <path
            d="M0,835 Q460,805 940,852 T1920,830 L1920,925 Q1390,895 860,945 T0,915 Z"
            fill="#C85A2B"
            opacity="0.26"
          />
          <path
            d="M0,995 Q520,1035 1080,985 T1920,1015 L1920,1080 L0,1080 Z"
            fill="#260A04"
            opacity="0.65"
          />

          {/* Wood Knot 4A (Bottom Center-Right) */}
          <g transform="translate(1140, 935)">
            <ellipse cx="0" cy="0" rx="78" ry="34" fill="url(#knot-depth)" stroke="#1A0703" strokeWidth="3.6" />
            <ellipse cx="-4" cy="1" rx="52" ry="22" fill="none" stroke="#140502" strokeWidth="2.8" />
            <ellipse cx="-6" cy="1" rx="28" ry="12" fill="#230903" stroke="#140502" strokeWidth="2.4" />
            <ellipse cx="-8" cy="1" rx="12" ry="5" fill="#120401" />
          </g>

          {/* Wood Knot 4B (Bottom Left) */}
          <g transform="translate(215, 955)">
            <ellipse cx="0" cy="0" rx="60" ry="26" fill="url(#knot-depth)" stroke="#1A0703" strokeWidth="3.4" />
            <ellipse cx="2" cy="0" rx="36" ry="15" fill="none" stroke="#140502" strokeWidth="2.6" />
            <ellipse cx="4" cy="0" rx="15" ry="6" fill="#120401" />
          </g>

          {/* Flowing Wood Striations */}
          <path
            d="M0,848 Q260,822 580,865 T1050,905 Q1140,882 1230,908 T1920,862"
            fill="none"
            stroke="#210903"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M0,918 Q110,926 150,938 Q215,914 282,940 Q620,972 1045,928 Q1140,886 1235,930 T1920,924"
            fill="none"
            stroke="#260C04"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M0,978 Q115,972 152,965 Q215,996 280,966 Q640,938 1048,952 Q1140,986 1232,954 T1920,985"
            fill="none"
            stroke="#1E0803"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M0,1035 Q480,1062 960,1022 T1920,1042"
            fill="none"
            stroke="#160502"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* ================= BOLD INK PLANK SEAMS & NICS ================= */}
        {/* Seam 1 (Y = 215) */}
        <path
          d="M0,215 L620,213 L635,218 L1290,215 L1305,211 L1920,216"
          fill="none"
          stroke="#110401"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M0,219 L580,218 M680,220 L1450,219"
          fill="none"
          stroke="#FDE047"
          strokeWidth="2.2"
          opacity={0.48 * intensity}
        />

        {/* Seam 2 (Y = 495) */}
        <path
          d="M0,495 L410,497 L422,492 L1140,496 L1158,500 L1920,494"
          fill="none"
          stroke="#110401"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M20,499 L690,500 M780,499 L1280,500"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="2"
          opacity={0.36 * intensity}
        />

        {/* Seam 3 (Y = 795) */}
        <path
          d="M0,795 L530,793 L545,799 L1420,794 L1435,790 L1920,796"
          fill="none"
          stroke="#110401"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M40,799 L620,798"
          fill="none"
          stroke="#D97706"
          strokeWidth="1.6"
          opacity={0.24 * intensity}
        />

        {/* Vertical plank join lines & graphic novel cross-hatching */}
        <g stroke="#140502" strokeWidth="4.5" strokeLinecap="round">
          <path d="M1680,0 L1674,215" />
          <path d="M195,795 L189,1080" />
        </g>

        {/* Graphic-novel style ink crosshatching in deep corners */}
        <g stroke="#140502" strokeWidth="2.2" opacity="0.55" strokeLinecap="round">
          <path d="M1820,25 L1905,55 M1835,45 L1910,72 M1850,68 L1915,92 M1865,90 L1915,108" />
          <path d="M1810,980 L1900,1045 M1830,965 L1910,1025 M1790,1000 L1880,1065 M1770,1020 L1855,1075" />
          <path d="M15,990 L95,1065 M10,1015 L75,1075 M35,975 L115,1050" />
        </g>

        {/* Dynamic Top-Left Candlelight Warm Sheen on the Tabletop */}
        <rect x="0" y="0" width="1920" height="1080" fill="url(#candle-wood-sheen)" />
      </svg>

      {/* Dynamic Top-Left Candlelight Glow & Flickering Vignette Overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(
              circle at ${lightCenterX}% ${lightCenterY}%,
              rgba(255, 240, 165, ${0.42 * intensity}) 0%,
              rgba(251, 191, 36, ${0.24 * intensity}) 18%,
              rgba(234, 88, 12, ${0.1 * intensity}) 38%,
              rgba(28, 10, 18, 0.38) 66%,
              rgba(12, 5, 14, 0.85) 100%
            )
          `,
        }}
      />
    </div>
  );
};
