import { useId, type ReactElement } from "react";

/**
 * Custom illustrations for the onboarding sections. One palette (blue and white, with a warm gold and a fresh green
 * accent) and one technique — layered shapes, soft gradients and blurred floor shadows — but a different composition
 * and background shape for every section. Decorative only (aria-hidden); each instance gets unique gradient IDs.
 */

export type IllustrationName = "welcome" | "documentation" | "payroll" | "benefits" | "training" | "ready" | "helpdesk" | "progress" | "rest";

const NAVY = "#1C2F55";
const B7 = "#1A49AD";
const B5 = "#2F6FED";
const B3 = "#93B8FD";
const B2 = "#BFD5FE";
const B1 = "#DBE8FE";
const WHITE = "#FFFFFF";
const GOLD = "#F59E0B";
const GREEN = "#10B981";
const SKIN = "#F2C4A0";
const HAIR = "#2B2140";
const FONT = "Inter, system-ui, sans-serif";

type Ids = (name: string) => string;
type Scene = (id: Ids) => ReactElement;

/** Shared gradients, filters and shapes, namespaced per SVG instance. */
function Defs({ id }: { id: Ids }) {
  const lin = (name: string, from: string, to: string, x2 = "0", y2 = "1") => (
    <linearGradient id={id(name)} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
  return (
    <defs>
      {lin("blue", "#5B93FF", "#1F5AD6", "1", "1")}
      {lin("deep", "#2F6FED", "#16367F", "1", "1")}
      {lin("sky", "#E6F0FF", "#FFFFFF")}
      {lin("skyR", "#FFFFFF", "#DCE9FF", "1", "1")}
      {lin("glass", "#F4F8FF", "#C9DCFF", "1", "1")}
      {lin("gold", "#FDE68A", "#F59E0B", "1", "1")}
      {lin("green", "#6EE7B7", "#059669", "1", "1")}
      {lin("rose", "#FDA4AF", "#E11D48", "1", "1")}
      {lin("warm", "#FFF7E0", "#FFFFFF")}
      {lin("blush", "#FFF0F3", "#FFFFFF")}
      <filter id={id("shadow")} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1B3F8C" floodOpacity="0.18" />
      </filter>
      <filter id={id("blur")} x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </defs>
  );
}

const url = (id: Ids, name: string) => `url(#${id(name)})`;

function Floor({ id, cx = 100, cy = 136, rx = 62 }: { id: Ids; cx?: number; cy?: number; rx?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry="5" fill="#1B3F8C" opacity="0.14" filter={url(id, "blur")} />;
}

function Sparkle({ x, y, color = B5, size = 5 }: { x: number; y: number; color?: string; size?: number }) {
  const s = size;
  return <path d={`M${x} ${y - s}q${s * 0.15} ${s * 0.85} ${s} ${s}q-${s * 0.85} ${s * 0.15}-${s} ${s}q-${s * 0.15}-${s * 0.85}-${s}-${s}q${s * 0.85}-${s * 0.15} ${s}-${s}z`} fill={color} />;
}

function Check({ x, y, s = 1, color = WHITE, w = 2.6 }: { x: number; y: number; s?: number; color?: string; w?: number }) {
  return <path d={`M${x - 5 * s} ${y}l${3.5 * s} ${3.5 * s} ${6.5 * s}-${7 * s}`} stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

function Confetti({ items }: { items: [number, number, string, number][] }) {
  return (
    <>
      {items.map(([x, y, c, r]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="5" height="2.6" rx="1.3" fill={c} transform={`rotate(${r} ${x + 2.5} ${y + 1.3})`} />
      ))}
    </>
  );
}

const scenes: Record<IllustrationName, Scene> = {
  // Welcome & IT setup: a workstation whose screen greets you with a sign-in, floating Wi-Fi and security badges.
  welcome: (id) => (
    <>
      <rect x="16" y="12" width="168" height="124" rx="30" fill={url(id, "sky")} />
      <circle cx="156" cy="34" r="30" fill={B1} opacity="0.7" />
      <Floor id={id} cy={130} rx={58} />
      <rect x="44" y="30" width="96" height="66" rx="9" fill={url(id, "deep")} filter={url(id, "shadow")} />
      <rect x="50" y="36" width="84" height="52" rx="5" fill={WHITE} />
      <rect x="50" y="36" width="84" height="10" rx="5" fill={B1} />
      <circle cx="56" cy="41" r="1.6" fill={B3} />
      <circle cx="61" cy="41" r="1.6" fill={B3} />
      <circle cx="92" cy="58" r="7.5" fill={url(id, "blue")} />
      <circle cx="92" cy="56" r="2.8" fill={WHITE} />
      <path d="M86.5 62.5c1.4-2.6 3.3-3.6 5.5-3.6s4.1 1 5.5 3.6" fill={WHITE} />
      {[82, 88, 94, 100].map((x) => (
        <circle key={x} cx={x + 1} cy="72" r="1.8" fill={B3} />
      ))}
      <rect x="78" y="77" width="28" height="6" rx="3" fill={GREEN} />
      <path d="M84 96h16l4 12H80z" fill={url(id, "deep")} />
      <rect x="70" y="107" width="44" height="5" rx="2.5" fill={B7} />
      <rect x="40" y="114" width="74" height="7" rx="3.5" fill={WHITE} stroke={B2} strokeWidth="1.5" />
      <g filter={url(id, "shadow")}>
        <circle cx="34" cy="40" r="13" fill={WHITE} />
        <path d="M26 39a11 11 0 0 1 16 0M29 42.5a6.5 6.5 0 0 1 10 0" stroke={B5} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="34" cy="46" r="1.8" fill={B5} />
      </g>
      <g filter={url(id, "shadow")}>
        <rect x="140" y="70" width="36" height="36" rx="11" fill={url(id, "blue")} />
        <rect x="149" y="86" width="18" height="13" rx="3" fill={WHITE} />
        <path d="M152 86v-4a6 6 0 0 1 11.5-2.3" stroke={WHITE} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="158" cy="92.5" r="2" fill={B5} />
      </g>
      <g transform="translate(118 110)">
        <rect x="0" y="0" width="12" height="13" rx="3" fill={url(id, "gold")} />
        <path d="M12 3.5c4 0 4 6 0 6" stroke={GOLD} strokeWidth="1.8" fill="none" />
      </g>
      <Sparkle x={150} y={26} color={GOLD} size={5} />
      <Sparkle x={24} y={100} color={B3} size={4} />
    </>
  ),
  // Documentation: a gradient folder of records, an employee ID card in front and a green verification seal.
  documentation: (id) => (
    <>
      <rect x="28" y="16" width="144" height="116" rx="30" fill={url(id, "sky")} transform="rotate(-6 100 74)" />
      <Floor id={id} />
      <path d="M58 34h30l8 9h56a7 7 0 0 1 7 7v62a7 7 0 0 1-7 7H58a7 7 0 0 1-7-7V41a7 7 0 0 1 7-7z" fill={url(id, "deep")} />
      <g transform="rotate(-5 100 60)">
        <rect x="66" y="28" width="58" height="70" rx="5" fill={WHITE} />
        <path d="M75 40h30M75 48h40M75 56h34" stroke={B1} strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <g transform="rotate(4 116 62)">
        <rect x="88" y="30" width="58" height="70" rx="5" fill={WHITE} filter={url(id, "shadow")} />
        <path d="M97 42h28M97 50h40M97 58h34M97 66h22" stroke={B1} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M124 82c3-6 7-6 9 0s6 4 8-1" stroke={B5} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
      <path d="M51 70h108a7 7 0 0 1 7 7.6l-3.3 34A7 7 0 0 1 155.7 118H58a7 7 0 0 1-7-7z" fill={url(id, "blue")} />
      <path d="M53 74h104" stroke={WHITE} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <g transform="rotate(-8 50 104)" filter={url(id, "shadow")}>
        <rect x="20" y="84" width="62" height="42" rx="7" fill={WHITE} />
        <rect x="20" y="84" width="62" height="10" rx="5" fill={url(id, "deep")} />
        <rect x="27" y="99" width="16" height="19" rx="3" fill={B1} />
        <circle cx="35" cy="106" r="4" fill={B3} />
        <path d="M28.5 117c1.3-4 4-5 6.5-5s5.2 1 6.5 5" fill={B3} />
        <path d="M48 101h26M48 108h18" stroke={B2} strokeWidth="3" strokeLinecap="round" />
        <path d="M48 115h2M52 115h1M55 115h3M60 115h1M63 115h2M67 115h1" stroke={NAVY} strokeWidth="3" />
      </g>
      <g filter={url(id, "shadow")}>
        <path d="M160 72l4.2 3 5.1-.4 1.6 4.9 4.3 2.8-1.6 4.9 1.6 4.9-4.3 2.8-1.6 4.9-5.1-.4-4.2 3-4.2-3-5.1.4-1.6-4.9-4.3-2.8 1.6-4.9-1.6-4.9 4.3-2.8 1.6-4.9 5.1.4z" fill={url(id, "green")} />
        <Check x={160} y={89} s={1.1} />
      </g>
      <Sparkle x={36} y={34} color={GOLD} size={5} />
    </>
  ),
  // Payroll: a payslip, a gradient salary card, a floating rupee coin and a coin stack.
  payroll: (id) => (
    <>
      <circle cx="100" cy="74" r="62" fill={url(id, "sky")} />
      <circle cx="100" cy="74" r="62" stroke={B2} strokeWidth="1.2" strokeDasharray="3 5" fill="none" />
      <Floor id={id} />
      <g filter={url(id, "shadow")}>
        <rect x="34" y="22" width="66" height="90" rx="8" fill={WHITE} />
        <path d="M34 30a8 8 0 0 1 8-8h50a8 8 0 0 1 8 8v8H34z" fill={url(id, "blue")} />
        <text x="67" y="33" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={WHITE} fontFamily={FONT} letterSpacing="1.2">PAYSLIP</text>
        <path d="M44 50h22M44 59h30M44 68h18" stroke={B1} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M80 50h10M84 59h6M82 68h8" stroke={B2} strokeWidth="3.5" strokeLinecap="round" />
        <rect x="42" y="82" width="50" height="16" rx="8" fill="#ECFDF5" />
        <text x="67" y="93" textAnchor="middle" fontSize="8" fontWeight="800" fill="#047857" fontFamily={FONT}>₹ CREDITED</text>
      </g>
      <g transform="rotate(-10 128 92)" filter={url(id, "shadow")}>
        <rect x="86" y="66" width="86" height="54" rx="10" fill={url(id, "deep")} />
        <circle cx="160" cy="78" r="16" fill={WHITE} opacity="0.08" />
        <rect x="96" y="80" width="14" height="11" rx="2.5" fill={url(id, "gold")} />
        <path d="M117 82a6 6 0 0 1 0 7M121 80a9 9 0 0 1 0 11" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3].map((g) => (
          <path key={g} d={`M${96 + g * 18} 104h12`} stroke={WHITE} strokeOpacity="0.75" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="2 2" />
        ))}
      </g>
      <g filter={url(id, "shadow")}>
        <circle cx="158" cy="38" r="15" fill={url(id, "gold")} />
        <circle cx="158" cy="38" r="11" stroke={WHITE} strokeOpacity="0.6" strokeWidth="1.4" fill="none" />
        <text x="158" y="43.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#92400E" fontFamily={FONT}>₹</text>
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx="34" cy={128 - i * 6} rx="13" ry="4.5" fill="#D97706" />
          <ellipse cx="34" cy={126 - i * 6} rx="13" ry="4.5" fill={url(id, "gold")} />
        </g>
      ))}
      <Sparkle x={128} y={20} color={B3} size={4} />
    </>
  ),
  // Benefits & wellbeing: a gradient shield holding a heartbeat, a health card and a fresh leaf.
  benefits: (id) => (
    <>
      <path d="M40 30c22-22 92-26 120 2 22 22 14 74-12 92-26 18-88 16-110-6C18 98 20 50 40 30z" fill={url(id, "blush")} />
      <Floor id={id} />
      <g filter={url(id, "shadow")}>
        <path d="M100 20l38 13v30c0 30-17 50-38 60-21-10-38-30-38-60V33z" fill={url(id, "blue")} />
        <path d="M100 28l30 10v25c0 24-13 41-30 50z" fill={WHITE} opacity="0.12" />
        <path d="M100 92c-15-9-24-17-24-27 0-7 5-11 11-11 5 0 10 3 13 8 3-5 8-8 13-8 6 0 11 4 11 11 0 10-9 18-24 27z" fill={url(id, "rose")} />
        <path d="M80 70h9l4-7 5 13 4-8h16" stroke={WHITE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g filter={url(id, "shadow")}>
        <rect x="22" y="76" width="40" height="30" rx="9" fill={WHITE} />
        <rect x="30" y="84" width="14" height="14" rx="4" fill="#ECFDF5" />
        <path d="M37 87v8M33 91h8" stroke={GREEN} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M48 87h8M48 94h6" stroke={B2} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g filter={url(id, "shadow")}>
        <circle cx="160" cy="48" r="14" fill={WHITE} />
        <path d="M166 54c-11 1-15-6-14-14 9 0 15 5 14 14z" fill={url(id, "green")} />
        <path d="M166 54c-4-5-8-8-12-11" stroke={WHITE} strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <g filter={url(id, "shadow")}>
        <rect x="140" y="92" width="38" height="18" rx="9" fill={url(id, "gold")} />
        <text x="159" y="104.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#78350F" fontFamily={FONT}>+ PERKS</text>
      </g>
      <Sparkle x={44} y={36} color={B5} size={4.5} />
      <Sparkle x={140} y={22} color={GOLD} size={4} />
    </>
  ),
  // Training: a tablet playing a video lesson, a stack of books, a floating graduation cap and a growth line.
  training: (id) => (
    <>
      <path d="M100 10l56 30v68l-56 30-56-30V40z" fill={url(id, "sky")} />
      <Floor id={id} />
      <g filter={url(id, "shadow")}>
        <rect x="72" y="34" width="90" height="64" rx="10" fill={url(id, "deep")} />
        <rect x="78" y="40" width="78" height="46" rx="5" fill={url(id, "glass")} />
        <path d="M78 74l18-14 14 10 16-12 30 22v1a5 5 0 0 1-5 5H83a5 5 0 0 1-5-5z" fill={B2} opacity="0.8" />
        <circle cx="117" cy="61" r="11" fill={WHITE} />
        <path d="M113.5 55v12l10-6z" fill={B5} />
        <rect x="78" y="90" width="78" height="3" rx="1.5" fill={WHITE} opacity="0.3" />
        <rect x="78" y="90" width="44" height="3" rx="1.5" fill={GOLD} />
      </g>
      <g filter={url(id, "shadow")}>
        <rect x="30" y="108" width="70" height="13" rx="3" fill={url(id, "deep")} />
        <rect x="36" y="95" width="60" height="13" rx="3" fill={url(id, "gold")} />
        <rect x="32" y="82" width="64" height="13" rx="3" fill={WHITE} stroke={B2} strokeWidth="1.5" />
        <path d="M40 88.5h40M42 101.5h34M36 114.5h44" stroke={WHITE} strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M40 88.5h40" stroke={B1} strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <g transform="rotate(-10 52 46)" filter={url(id, "shadow")}>
        <path d="M52 30l32 12-32 12-32-12z" fill={NAVY} />
        <path d="M36 48v10c8 6 24 6 32 0V48l-16 6z" fill={B7} />
        <path d="M82 43v14" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="82" cy="59" r="3" fill={GOLD} />
      </g>
      <path d="M128 128l12-12 9 5 18-20" stroke={url(id, "green")} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M159 101h8v8" stroke={GREEN} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={160} y={24} color={GOLD} size={5} />
    </>
  ),
  // Ready to Go: three rising podium steps with checks, a flag at the top and a rocket climbing away.
  ready: (id) => (
    <>
      <rect x="14" y="14" width="172" height="122" rx="28" fill={url(id, "sky")} />
      <path d="M30 52a10 10 0 0 1 18-6 8 8 0 0 1 12 7H30z" fill={WHITE} />
      <path d="M128 34a8 8 0 0 1 14-4 6 6 0 0 1 9 6h-23z" fill={WHITE} />
      <Floor id={id} cy={132} rx={70} />
      <g filter={url(id, "shadow")}>
        <rect x="34" y="96" width="38" height="34" rx="6" fill={B2} />
        <rect x="76" y="78" width="38" height="52" rx="6" fill={B3} />
        <rect x="118" y="58" width="38" height="72" rx="6" fill={url(id, "blue")} />
      </g>
      <circle cx="53" cy="112" r="8" fill={url(id, "green")} />
      <Check x={53} y={112} s={0.75} />
      <circle cx="95" cy="98" r="8" fill={url(id, "green")} />
      <Check x={95} y={98} s={0.75} />
      <text x="137" y="98" textAnchor="middle" fontSize="16" fontWeight="800" fill={WHITE} fontFamily={FONT}>3</text>
      <path d="M137 58V30" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M137 31h22l-5 7 5 7h-22z" fill={url(id, "gold")} />
      <path d="M40 88c10-22 22-40 40-52" stroke={B3} strokeWidth="2.4" strokeDasharray="3 5" fill="none" strokeLinecap="round" />
      <g transform="translate(84 32) rotate(45)" filter={url(id, "shadow")}>
        <path d="M0-20c8 5 10 15 8 27H-8c-2-12 0-22 8-27z" fill={WHITE} />
        <path d="M0-20c8 5 10 15 8 27H2c1-12 0-20-2-27z" fill={B1} />
        <circle cy="-5" r="4" fill={url(id, "blue")} stroke={NAVY} strokeWidth="1.2" />
        <path d="M-8 0l-6 10h7zM8 0l6 10H7z" fill={url(id, "deep")} />
        <path d="M-4 8q4 14 4 14t4-14z" fill={url(id, "gold")} />
      </g>
      <Sparkle x={168} y={52} color={GOLD} size={5} />
      <Sparkle x={112} y={24} color={B5} size={3.5} />
    </>
  ),
  // Help Desk: a gradient headset, a typing chat bubble, a resolved reply and a ticket card.
  helpdesk: (id) => (
    <>
      <path d="M36 34c24-24 104-22 124 6 18 26 8 70-22 86-30 16-86 10-104-12-16-20-18-58 2-80z" fill={url(id, "sky")} />
      <Floor id={id} cx={88} rx={52} />
      <path d="M50 82v-8a30 30 0 0 1 60 0v8" stroke={NAVY} strokeWidth="5" fill="none" strokeLinecap="round" />
      <g filter={url(id, "shadow")}>
        <rect x="40" y="74" width="18" height="30" rx="8" fill={url(id, "blue")} />
        <rect x="102" y="74" width="18" height="30" rx="8" fill={url(id, "blue")} />
      </g>
      <path d="M112 102c0 12-9 18-22 18" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <rect x="80" y="115" width="12" height="8" rx="4" fill={NAVY} />
      <g filter={url(id, "shadow")}>
        <rect x="112" y="22" width="62" height="36" rx="14" fill={url(id, "blue")} />
        <path d="M124 57l-5 11 15-11z" fill="#3F7BF2" />
        <circle cx="130" cy="40" r="3.3" fill={WHITE} />
        <circle cx="143" cy="40" r="3.3" fill={WHITE} opacity="0.85" />
        <circle cx="156" cy="40" r="3.3" fill={WHITE} opacity="0.7" />
      </g>
      <g filter={url(id, "shadow")}>
        <rect x="126" y="76" width="52" height="40" rx="9" fill={WHITE} />
        <text x="134" y="90" fontSize="8" fontWeight="800" fill={B7} fontFamily={FONT}>#HD-27</text>
        <path d="M134 98h28" stroke={B1} strokeWidth="3" strokeLinecap="round" />
        <rect x="134" y="104" width="34" height="7" rx="3.5" fill="#ECFDF5" />
        <circle cx="139" cy="107.5" r="2" fill={GREEN} />
      </g>
      <g filter={url(id, "shadow")}>
        <circle cx="34" cy="44" r="12" fill={url(id, "gold")} />
        <text x="34" y="49" textAnchor="middle" fontSize="13" fontWeight="800" fill="#78350F" fontFamily={FONT}>?</text>
      </g>
      <Sparkle x={70} y={28} color={B3} size={4} />
    </>
  ),
  // A day off: a warm sky with a sun, a holiday calendar page with a celebration mark, bunting and a cup of tea.
  rest: (id) => (
    <>
      <rect x="14" y="12" width="172" height="124" rx="30" fill={url(id, "warm")} />
      <circle cx="150" cy="40" r="24" fill={url(id, "gold")} opacity="0.9" />
      <circle cx="150" cy="40" r="32" fill={GOLD} opacity="0.12" />
      <path d="M22 22q60 22 120 0" stroke={B3} strokeWidth="1.2" fill="none" />
      {[0.12, 0.3, 0.5, 0.7, 0.88].map((t, i) => {
        const x = 22 + 120 * t;
        const y = 22 + 44 * t * (1 - t);
        return <path key={t} d={`M${x - 5} ${y}h10l-5 9z`} fill={[B5, GOLD, B3, GREEN, B5][i]} />;
      })}
      <Floor id={id} cy={130} rx={56} />
      <g filter={url(id, "shadow")}>
        <rect x="44" y="40" width="74" height="84" rx="10" fill={WHITE} />
        <path d="M44 50a10 10 0 0 1 10-10h54a10 10 0 0 1 10 10v12H44z" fill={url(id, "blue")} />
        <path d="M60 34v12M102 34v12" stroke={NAVY} strokeWidth="3.2" strokeLinecap="round" />
        {[0, 1, 2, 3].map((c) =>
          [0, 1, 2].map((r) => (
            <rect key={`${c}-${r}`} x={53 + c * 15} y={70 + r * 15} width="10" height="10" rx="3" fill={c === 2 && r === 1 ? url(id, "gold") : B1} />
          )),
        )}
        <Sparkle x={88} y={89} color={WHITE} size={3} />
      </g>
      <g filter={url(id, "shadow")}>
        <path d="M128 100h30v11a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z" fill={url(id, "deep")} />
        <path d="M158 104c8 0 8 11 0 11" stroke={B7} strokeWidth="2.4" fill="none" />
      </g>
      <path d="M137 94c0-4 3-4 3-8M147 94c0-4 3-4 3-8" stroke={B3} strokeWidth="2" strokeLinecap="round" />
      <Confetti items={[[30, 70, GOLD, 30], [34, 104, B5, -20], [168, 82, GREEN, 45], [124, 70, B3, -35]]} />
    </>
  ),
  // Progress: a gradient ring with a check beside rising bars.
  progress: (id) => (
    <>
      <circle cx="100" cy="74" r="60" fill={url(id, "sky")} />
      <Floor id={id} />
      <circle cx="80" cy="74" r="30" fill={WHITE} stroke={B1} strokeWidth="10" filter={url(id, "shadow")} />
      <circle cx="80" cy="74" r="30" fill="none" stroke={url(id, "blue")} strokeWidth="10" strokeLinecap="round" strokeDasharray="140 189" transform="rotate(-90 80 74)" />
      <Check x={80} y={74} s={1.3} color={GREEN} w={3} />
      <rect x="124" y="84" width="10" height="26" rx="3" fill={B3} />
      <rect x="138" y="68" width="10" height="42" rx="3" fill={B5} />
      <rect x="152" y="50" width="10" height="60" rx="3" fill={url(id, "deep")} />
      <Sparkle x={160} y={32} color={GOLD} />
    </>
  ),
};

function useIds(): Ids {
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (name: string) => `${base}-${name}`;
}

export function SectionIllustration({ name, className = "h-24 w-32" }: { name: IllustrationName; className?: string }) {
  const id = useIds();
  return (
    <svg viewBox="10 8 180 134" className={className} fill="none" aria-hidden="true" focusable="false">
      <Defs id={id} />
      {scenes[name](id)}
    </svg>
  );
}

/**
 * The large Home welcome illustration: a new employee with a laptop bag walking along their onboarding path towards
 * the open doors of the office, under a WELCOME sign, with balloons, bunting, confetti and a Day 1 checklist card.
 */
export function WelcomeHeroIllustration({ className = "h-48 w-72" }: { className?: string }) {
  const id = useIds();
  const bunting = [0.06, 0.17, 0.28, 0.39, 0.5, 0.61, 0.72, 0.83, 0.94];
  const flagColors = [B5, GOLD, B3, WHITE];
  return (
    <svg viewBox="0 0 360 240" className={className} fill="none" aria-hidden="true" focusable="false">
      <Defs id={id} />
      {/* soft backdrop */}
      <path d="M40 60c30-44 230-56 290-10 36 28 30 120-6 150-40 32-250 30-288-6C2 162 14 98 40 60z" fill={url(id, "skyR")} />
      <ellipse cx="190" cy="214" rx="160" ry="10" fill="#1B3F8C" opacity="0.13" filter={url(id, "blur")} />

      {/* bunting */}
      <path d="M18 14Q180 46 342 14" stroke={B5} strokeWidth="1.4" />
      {bunting.map((t, i) => {
        const x = 18 + 324 * t;
        const y = 14 + 64 * t * (1 - t);
        return <path key={t} d={`M${x - 7} ${y}h14l-7 13z`} fill={flagColors[i % flagColors.length]} stroke={i % 4 === 3 ? B3 : "none"} strokeWidth="1" strokeLinejoin="round" />;
      })}

      {/* the office */}
      <g filter={url(id, "shadow")}>
        <rect x="184" y="58" width="152" height="152" rx="12" fill={WHITE} />
      </g>
      {[0, 1, 2, 3, 4].map((c) =>
        [0, 1].map((r) => <rect key={`${c}-${r}`} x={196 + c * 27} y={70 + r * 18} width="20" height="11" rx="3" fill={r === 0 && c % 2 === 0 ? B2 : B1} />),
      )}
      <rect x="212" y="108" width="96" height="20" rx="10" fill={url(id, "blue")} />
      <text x="260" y="122" textAnchor="middle" fontSize="10.5" fontWeight="800" fill={WHITE} fontFamily={FONT} letterSpacing="2.4">WELCOME</text>
      <rect x="220" y="134" width="80" height="76" rx="7" fill={url(id, "deep")} />
      <rect x="226" y="140" width="68" height="70" rx="3" fill={url(id, "warm")} />
      <rect x="226" y="140" width="34" height="70" rx="2" fill={url(id, "glass")} />
      <path d="M232 146l14-4M232 156l22-6" stroke={WHITE} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M262 140l30-6v82l-30-6z" fill={url(id, "glass")} opacity="0.95" />
      <path d="M266 150l20-4" stroke={WHITE} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <rect x="254" y="170" width="3" height="12" rx="1.5" fill={NAVY} />
      <rect x="267" y="172" width="3" height="12" rx="1.5" fill={NAVY} />
      <rect x="216" y="208" width="88" height="7" rx="3.5" fill={url(id, "gold")} />
      {/* door plants */}
      <path d="M196 186c-9-6-12-16-9-24 8 4 11 13 9 24zM199 186c3-12 11-17 19-15-2 9-9 14-19 15z" fill={GREEN} />
      <path d="M190 186h18l-3 24h-12z" fill={url(id, "deep")} />
      <path d="M318 186c-9-6-12-16-9-24 8 4 11 13 9 24zM321 186c3-12 11-17 19-15-2 9-9 14-19 15z" fill={GREEN} />
      <path d="M312 186h18l-3 24h-12z" fill={url(id, "deep")} />

      {/* balloons */}
      <path d="M312 92q-6 20 2 42M330 102q4 16-4 32" stroke={B3} strokeWidth="1.2" fill="none" />
      <ellipse cx="312" cy="80" rx="12" ry="14" fill={url(id, "blue")} />
      <ellipse cx="308" cy="74" rx="3" ry="4.5" fill={WHITE} opacity="0.45" />
      <ellipse cx="331" cy="90" rx="11" ry="13" fill={url(id, "gold")} />
      <ellipse cx="327" cy="85" rx="2.6" ry="4" fill={WHITE} opacity="0.5" />

      {/* onboarding path with milestones */}
      <path d="M18 222C60 214 70 196 112 206s80 4 104 4" stroke={B3} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <g filter={url(id, "shadow")}>
        <circle cx="36" cy="216" r="9" fill={url(id, "green")} />
        <Check x={36} y={216} s={0.75} />
        <circle cx="72" cy="203" r="9" fill={url(id, "green")} />
        <Check x={72} y={203} s={0.75} />
      </g>

      {/* Day 1 card */}
      <g filter={url(id, "shadow")}>
        <rect x="22" y="64" width="78" height="64" rx="11" fill={WHITE} />
        <text x="34" y="83" fontSize="10.5" fontWeight="800" fill={B7} fontFamily={FONT}>Day 1</text>
        <circle cx="38" cy="96" r="4.5" fill={GREEN} />
        <Check x={38} y={96} s={0.45} w={1.8} />
        <rect x="47" y="93.5" width="40" height="5" rx="2.5" fill={B1} />
        <circle cx="38" cy="111" r="4.5" fill={GREEN} />
        <Check x={38} y={111} s={0.45} w={1.8} />
        <rect x="47" y="108.5" width="32" height="5" rx="2.5" fill={B1} />
      </g>

      {/* speech bubble */}
      <g filter={url(id, "shadow")}>
        <rect x="140" y="30" width="62" height="26" rx="13" fill={WHITE} />
        <path d="M150 55l-4 9 12-9z" fill={WHITE} />
      </g>
      <text x="171" y="47" textAnchor="middle" fontSize="11.5" fontWeight="800" fill={B5} fontFamily={FONT}>Hello!</text>

      {/* the new employee, walking in and waving */}
      <path d="M118 160l-12 44" stroke={NAVY} strokeWidth="12" strokeLinecap="round" />
      <path d="M130 160l12 44" stroke="#24396A" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx="103" cy="208" rx="9" ry="4" fill={HAIR} />
      <ellipse cx="146" cy="208" rx="9" ry="4" fill={HAIR} />
      <path d="M110 108l-10 30" stroke="#2559C9" strokeWidth="9" strokeLinecap="round" />
      <rect x="86" y="136" width="26" height="20" rx="4" fill={NAVY} />
      <path d="M93 136v-4h12v4" stroke={NAVY} strokeWidth="2.4" fill="none" />
      <rect x="86" y="142" width="26" height="2.5" fill={B7} />
      <circle cx="100" cy="138" r="5" fill={SKIN} />
      <path d="M106 164c0-36 6-60 18-62 12 2 18 26 18 62z" fill={url(id, "blue")} />
      <path d="M118 103l6 14 6-14z" fill={WHITE} />
      <path d="M119 104l5 20 5-20" stroke={GOLD} strokeWidth="1.5" fill="none" />
      <rect x="120" y="123" width="9" height="12" rx="1.5" fill={WHITE} stroke={NAVY} strokeWidth="1.1" />
      <rect x="120" y="123" width="9" height="3.4" rx="1" fill={B5} />
      <path d="M138 112l13-18 4-18" stroke={B5} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="156" cy="71" r="6" fill={SKIN} />
      <path d="M164 62q5 6 1 13M170 58q7 10 1 20" stroke={B3} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="120" y="92" width="8" height="10" rx="2" fill={SKIN} />
      <circle cx="124" cy="82" r="15" fill={SKIN} />
      <path d="M109 81c0-12 7-19 16-19 10 0 16 7 16 16-6-4-12-6-18-5-6 1-10 4-14 8z" fill={HAIR} />
      <circle cx="139" cy="74" r="6.5" fill={HAIR} />
      <circle cx="119" cy="84" r="1.5" fill={HAIR} />
      <circle cx="130" cy="84" r="1.5" fill={HAIR} />
      <path d="M120 90q4.5 3.5 9 0" stroke={HAIR} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="115.5" cy="88.5" r="2.2" fill="#F9A8B8" opacity="0.7" />
      <circle cx="133.5" cy="88.5" r="2.2" fill="#F9A8B8" opacity="0.7" />

      <Confetti items={[[60, 40, GOLD, 25], [112, 30, B5, -30], [212, 40, GREEN, 40], [178, 84, GOLD, -15], [28, 150, B3, 60], [160, 140, B5, 20]]} />
      <Sparkle x={344} y={52} color={GOLD} size={6} />
      <Sparkle x={14} y={100} color={B5} size={4.5} />
    </svg>
  );
}
