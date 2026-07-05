import type { ReactNode } from 'react';
import type { Army, Color, Slot } from '../engine/types';

// ─── Inline SVG piece art ─────────────────────────────────────────────────────
//
// Every shape is authored in a 100×100 viewBox, standing on a ground line at
// y≈88. Fills inherit `currentColor` (the army W/B color set by the caller);
// outlines and interior detail use the CSS variable `--po` (piece outline),
// which is dark for White pieces and light for Black pieces so the two sides
// stay distinguishable even when armies share similar hues.
//
// Armies without a custom shape for a slot fall back to the standard set.
// Promoted pieces always use the standard set (they move as FIDE pieces).

const detail = { fill: 'var(--po)', stroke: 'none' } as const;
const line = { fill: 'none', stroke: 'var(--po)' } as const;

// ── Standard set ──

const STANDARD: Record<Slot, ReactNode> = {
  P: (
    <>
      <circle cx="50" cy="27" r="12" />
      <path d="M50 37 C41 39 36 46 38 54 L43 68 L57 68 L62 54 C64 46 59 39 50 37 Z" />
      <path d="M31 88 C31 78 40 72 50 72 C60 72 69 78 69 88 Z" />
    </>
  ),
  R: (
    <path d="M30 20 L38 20 L38 28 L46 28 L46 20 L54 20 L54 28 L62 28 L62 20 L70 20 L70 36 L64 42 L64 68 L70 76 L70 88 L30 88 L30 76 L36 68 L36 42 L30 36 Z" />
  ),
  N: (
    <>
      <path d="M34 88 C34 74 36 64 44 56 C36 58 29 52 31 44 C33 36 43 29 51 26 L53 17 L59 25 C71 30 78 42 78 59 C78 73 73 81 69 88 Z" />
      <circle cx="55" cy="39" r="3" {...detail} />
    </>
  ),
  B: (
    <>
      <circle cx="50" cy="16" r="6" />
      <path d="M50 25 C60 33 66 43 66 53 C66 63 59 70 50 70 C41 70 34 63 34 53 C34 43 40 33 50 25 Z" />
      <path d="M50 34 L50 52" {...line} strokeWidth="5" />
      <path d="M31 88 C31 80 39 74 50 74 C61 74 69 80 69 88 Z" />
    </>
  ),
  Q: (
    <>
      <circle cx="26" cy="16" r="5" />
      <circle cx="50" cy="11" r="5" />
      <circle cx="74" cy="16" r="5" />
      <path d="M26 22 L34 38 L43 19 L50 33 L57 19 L66 38 L74 22 L70 52 L64 72 L36 72 L30 52 Z" />
      <path d="M31 88 C31 80 40 76 50 76 C60 76 69 80 69 88 Z" />
    </>
  ),
  K: (
    <>
      <path d="M46 6 L54 6 L54 14 L62 14 L62 22 L54 22 L54 30 L46 30 L46 22 L38 22 L38 14 L46 14 Z" />
      <path d="M34 88 L32 58 C32 45 40 36 50 36 C60 36 68 45 68 58 L66 88 Z" />
      <path d="M38 70 L62 70" {...line} strokeWidth="4" />
    </>
  ),
};

// ── Army-specific shapes ──

const shade = (
  <>
    {/* Ghost: dome with wavy hem */}
    <path d="M28 88 C26 58 31 33 50 29 C69 33 74 58 72 88 L64 78 L57 88 L50 78 L43 88 L36 78 Z" />
    <circle cx="42" cy="51" r="4.5" {...detail} />
    <circle cx="58" cy="51" r="4.5" {...detail} />
  </>
);

const thrall = (
  <>
    {/* Hooded minion */}
    <path d="M53 16 C40 23 34 36 34 50 L32 88 L68 88 L66 50 C66 38 62 26 57 21 C58 16 56 13 53 16 Z" />
    <ellipse cx="50" cy="49" rx="9" ry="11" {...detail} />
  </>
);

const herald = (
  <>
    {/* Banner standard */}
    <circle cx="50" cy="11" r="5" />
    <path d="M47 18 L53 18 L53 82 L47 82 Z" />
    <path d="M53 20 L84 27 L72 34 L84 41 L53 48 Z" />
    <path d="M34 88 C34 81 41 77 50 77 C59 77 66 81 66 88 Z" />
  </>
);

const warlord = (
  <>
    {/* Horned war-helm */}
    <path d="M31 42 C21 33 20 20 27 10 C29 21 34 28 42 32 Z" />
    <path d="M69 42 C79 33 80 20 73 10 C71 21 66 28 58 32 Z" />
    <path d="M50 22 C63 22 71 33 71 46 L71 58 L29 58 L29 46 C29 33 37 22 50 22 Z" />
    <path d="M37 43 L63 43 L63 50 L37 50 Z" {...detail} />
    <path d="M31 88 L34 62 L66 62 L69 88 Z" />
  </>
);

const wraith = (
  <>
    {/* Tall specter: peaked hood, flaring sleeves, wavy hem */}
    <path d="M50 10 C40 14 35 24 38 33 C31 39 28 49 30 59 C24 64 21 72 23 81 L34 73 C36 82 42 88 50 88 C58 88 64 82 66 73 L77 81 C79 72 76 64 70 59 C72 49 69 39 62 33 C65 24 60 14 50 10 Z" />
    <ellipse cx="50" cy="29" rx="7.5" ry="9" {...detail} />
  </>
);

const wisp = (
  <>
    {/* Floating flame-orb */}
    <path d="M50 10 C59 22 67 31 67 45 C67 58 59 66 50 66 C41 66 33 58 33 45 C33 31 41 22 50 10 Z" />
    <circle cx="50" cy="46" r="6" {...detail} />
    <ellipse cx="50" cy="84" rx="17" ry="5" />
  </>
);

const apex = (
  <>
    {/* Chancellor: horse head rising between castle merlons */}
    <path d="M32 88 L32 66 L25 58 L25 41 L34 41 L34 48 L66 48 L66 41 L75 41 L75 58 L68 66 L68 88 Z" />
    <path d="M37 48 C37 33 42 23 50 19 L52 9 L58 17 L66 15 L64 23 C67 30 68 39 67 48 Z" />
    <circle cx="57" cy="27" r="2.8" {...detail} />
  </>
);

const behemoth = (
  <>
    {/* Massive tusked beast */}
    <path d="M20 88 L20 68 C20 49 33 37 52 37 C70 37 80 48 80 61 L80 88 L67 88 L67 79 L57 79 L57 88 L39 88 L39 79 L31 79 L31 88 Z" />
    <path d="M77 62 C86 64 90 71 87 80 C83 73 79 70 73 68 Z" />
    <path d="M58 38 L63 27 L70 36 Z" />
    <circle cx="68" cy="52" r="3" {...detail} />
  </>
);

const stalker = (
  <>
    {/* Prowling cat: low body, eared head right, tail curled over the back */}
    <path d="M18 66 C8 62 4 50 10 40 C10 50 15 58 24 61 Z" />
    <path d="M20 88 L20 74 C16 66 17 57 23 51 C31 43 45 40 56 42 L59 30 L66 39 L74 33 L74 43 C82 47 86 56 86 65 C86 72 82 76 76 77 L76 88 L64 88 L64 79 L52 79 L52 88 L32 88 L32 79 L26 79 L26 88 Z" />
    <circle cx="71" cy="50" r="2.8" {...detail} />
  </>
);

const bronco = (
  <>
    {/* Rearing horse: chest up, head high, foreleg pawing */}
    <path d="M34 88 L30 88 C26 76 28 64 36 57 C30 52 28 43 32 36 C37 27 47 22 56 24 L58 13 L64 22 L73 20 L70 29 C74 34 75 41 72 46 L62 44 C63 39 61 35 57 34 C60 43 59 53 53 60 C60 66 63 76 60 88 L48 88 C51 78 49 70 43 67 C38 72 35 79 37 88 Z" />
    <circle cx="52" cy="32" r="2.8" {...detail} />
  </>
);

const ARMY_SHAPES: Partial<Record<Army, Partial<Record<Slot, ReactNode>>>> = {
  Phantom: { Q: shade, P: thrall },
  Accord:  { Q: herald },
  Twins:   { K: warlord },
  Veil:    { Q: wraith, R: wisp },
  Wild:    { Q: apex, R: behemoth, B: stalker, N: bronco },
};

// ── Renderer ──

const OUTLINE: Record<Color, string> = {
  W: '#141924',
  B: '#dee3ef',
};

interface PieceIconProps {
  slot: Slot;
  color: Color;
  army: Army;
  promoted?: boolean;
}

/** Inline SVG piece image. Sized via font-size (1em × 1em); fill = currentColor. */
export function PieceIcon({ slot, color, army, promoted }: PieceIconProps) {
  const shape = (!promoted && ARMY_SHAPES[army]?.[slot]) || STANDARD[slot];
  return (
    <svg
      className="piece-svg"
      viewBox="0 0 100 100"
      style={{ ['--po' as string]: OUTLINE[color] }}
      aria-hidden
      focusable="false"
    >
      <g
        fill="currentColor"
        stroke="var(--po)"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shape}
      </g>
    </svg>
  );
}
