import type { SVGProps } from "react";

/**
 * Claro's own icon set (no stock library). One style, from the marketing site:
 * 24 viewBox, 1.75 stroke, round caps and joins, currentColor. Only icons in use live here.
 */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
export type Icon = (props: IconProps) => React.ReactElement;

function icon(name: string, paths: React.ReactNode): Icon {
  function Glyph({ size = 24, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        data-icon={name}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Glyph.displayName = name;
  return Glyph;
}
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

// Navigation
export const Dashboard = icon(
  "dashboard",
  <>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
  </>,
);
export const Sprint = icon(
  "sprint",
  <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />,
);
export const Cards = icon(
  "cards",
  <>
    <rect x="3" y="7.5" width="14" height="13" rx="2" />
    <path d="M7 4.5h11a3 3 0 0 1 3 3v10" />
  </>,
);
export const History = icon(
  "history",
  <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 3.5v5h5M12 7.5V12l3 2" />,
);
export const Users = icon(
  "users",
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
  </>,
);
export const User = icon(
  "user",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" />
  </>,
);
export const QuestionFile = icon(
  "question-file",
  <path
    d={`M14 3H6v18h13V8l-5-5Zm0 0v5h5M10 11.5a2.2 2.2 0 1 1 3 2c-.6.3-1 .8-1 1.5v.3${dot(12, 18)}`}
  />,
);
export const Pen = icon(
  "pen",
  <path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5ZM14 20h6" />,
);
export const Wallet = icon(
  "wallet",
  <path
    d={`M20 8H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4m3 0v12H5a2 2 0 0 1-2-2V6${dot(16, 14)}`}
  />,
);
export const SignOut = icon(
  "sign-out",
  <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />,
);
export const PanelLeft = icon(
  "panel-left",
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);

// Actions and controls
export const Close = icon("close", <path d="m6 6 12 12M18 6 6 18" />);
export const Check = icon("check", <path d="m5 12 4 4L19 6" />);
export const ChevronDown = icon("chevron-down", <path d="m6 9 6 6 6-6" />);
export const ChevronUp = icon("chevron-up", <path d="m6 15 6-6 6 6" />);
export const Minus = icon("minus", <path d="M5 12h14" />);
export const Plus = icon("plus", <path d="M5 12h14M12 5v14" />);
export const ArrowUp = icon("arrow-up", <path d="M12 19V5m-6 6 6-6 6 6" />);
export const ArrowDown = icon("arrow-down", <path d="M12 5v14m-6-6 6 6 6-6" />);
export const Flag = icon("flag", <path d="M5 21V4h11l-2 4 2 4H5" />);
export const ImagePlus = icon(
  "image-plus",
  <path
    d={`M21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8M3 16l5-5 5 5 2-2 6 6M18 3v6M15 6h6${dot(8.5, 8)}`}
  />,
);
export const Paperclip = icon(
  "paperclip",
  <path d="m20 11-8.6 8.6a5 5 0 0 1-7-7l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7l-8.9 8.9a1.7 1.7 0 0 1-2.4-2.4l8-8" />,
);
export const Message = icon(
  "message",
  <path d="M20 4H4a1 1 0 0 0-1 1v15l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1ZM8 9h8M8 12.5h5" />,
);
export const More = icon("more", <path d="M5 12h.01M12 12h.01M19 12h.01" />);
export const Book = icon(
  "book",
  <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1ZM5 7h3M16 7h3" />,
);
export const SearchOff = icon(
  "search-off",
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.8-4.8M8.5 8.5l4 4m0-4-4 4" />
  </>,
);
export const Target = icon(
  "target",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <path d="m12 12 9-9M17 3h4v4" />
  </>,
);

// Status
export const Alert = icon(
  "alert",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d={`M12 7.5V13${dot(12, 16.5)}`} />
  </>,
);
export const CheckCircle = icon(
  "check-circle",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16 9.5" />
  </>,
);
export const Pending = icon(
  "pending",
  <circle cx="12" cy="12" r="9" strokeDasharray="3.2 3.2" />,
);
export const Dot = icon(
  "dot",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </>,
);
export const Help = icon(
  "help",
  <>
    <circle cx="12" cy="12" r="9" />
    <path
      d={`M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4${dot(12, 17)}`}
    />
  </>,
);
export const Clock = icon(
  "clock",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const EyeOff = icon(
  "eye-off",
  <path d="m3 3 18 18M10.6 5.1Q11.3 5 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
);
export const Spinner = icon("spinner", <path d="M12 3a9 9 0 1 0 9 9" />);
export const Shield = icon(
  "shield",
  <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6" />,
);

export const Microphone = icon(
  "microphone",
  <>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" />
  </>,
);

export const Sun = icon(
  "sun",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
  </>,
);
export const Moon = icon(
  "moon",
  <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />,
);

// Home streak, drawn with the same 24px stroke set as the four launch tiles.
export const Flame = icon(
  "flame",
  <path d="M13 2.5c1 4-3 5-3 8 0 1.5 1 2.5 2 3 0-2 1-3 2-4 2 2 4.5 4.5 4.5 7A6.5 6.5 0 0 1 5.5 16c0-4 3-6 3-9 1 1 1.5 2 1.5 3 0-3 3-4 3-7.5Z" />,
);

// Template glyph vocabulary, redrawn in Claro’s 24px stroke style.
const portalPaths = {
  activity: "M3 12h4l3-8 4 16 3-8h4",
  "arrow-down-right": "M5 5l14 14M9 19h10V9",
  "arrow-left": "M20 12H4m6-6-6 6 6 6",
  "arrow-right": "M4 12h16m-6-6 6 6-6 6",
  "arrow-up": "M12 20V4m-6 6 6-6 6 6",
  "arrow-up-right": "M5 19 19 5M9 5h10v10",
  badge: "m12 3 3 2 4 1 1 4-1 4-3 2-4 3-3-2-4-1-1-4 1-4 3-2Z",
  "book-open":
    "M12 5v16M3 4c4-1 6-1 9 1 3-2 5-2 9-1v15c-4-1-6-1-9 2-3-3-5-3-9-2Z",
  calculator: "M5 3h14v18H5ZM8 7h8M8 12h1m6 0h1m-8 5h1m6 0h1",
  camera: "M3 7h4l2-3h6l2 3h4v13H3ZM16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
  "chart-line": "M3 3v18h18M6 15l5-6 4 3 6-7",
  check: "m5 12 4 4L19 6",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-left": "m15 5-7 7 7 7",
  "chevron-right": "m9 5 7 7-7 7",
  "chevrons-up-down": "m8 8 4-4 4 4m-8 8 4 4 4-4",
  circle: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
  "circle-alert": "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 7v6m0 4h.01",
  "circle-check": "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0m-14 0 3 3 7-7",
  "circle-dashed":
    "M12 3h1m5 2 1 1m2 5v2m-2 5-1 1m-5 2h-2m-5-2-1-1m-2-5v-2m2-5 1-1",
  "circle-dot":
    "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0m-7 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0",
  clock: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 7v5l3 2",
  copy: "M8 8h13v13H8ZM16 4V3H3v13h1",
  "corner-down-left": "M20 4v9H4m5-5-5 5 5 5",
  ellipsis: "M5 12h.01M12 12h.01M19 12h.01",
  flag: "M5 21V3h14l-3 5 3 5H5",
  flame:
    "M13 3c1 5-4 5-3 10 2-1 3-3 3-5 4 3 6 6 5 10-2 6-12 5-13-1-1-4 3-7 3-10 2 1 2 3 2 4 0-4 2-5 3-8Z",
  ghost: "M4 21V10a8 8 0 0 1 16 0v11l-4-3-4 3-4-3ZM9 10h.01M15 10h.01",
  "graduation-cap": "m2 9 10-5 10 5-10 5Zm4 3v5q6 5 12 0v-5m4-3v8",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  history: "M3 4v5h5M3 9a9 9 0 1 1 0 5M12 7v5l4 2",
  home: "m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10",
  hourglass: "M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4",
  keyboard:
    "M2 5h20v14H2ZM5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10",
  layers: "m3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5",
  "layout-grid": "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  link: "m9 15 6-6M8 16l-1 1a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m0 8a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-1 1",
  list: "M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13",
  "list-checks": "m3 6 2 2 4-4m-6 13 2 2 4-4M13 6h8M13 12h8M13 18h8",
  lock: "M4 10h16v11H4ZM8 10V6a4 4 0 0 1 8 0v4",
  "log-out": "M10 3H4v18h6M9 12h12m-5-5 5 5-5 5",
  menu: "M4 5h16M4 12h16M4 19h16",
  "message-circle": "M5 18 3 21l5-1a9 9 0 1 0-3-2Z",
  mic: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3",
  minus: "M5 12h14",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  "panel-left": "M3 4h18v16H3ZM9 4v16",
  "pen-line": "m4 16 12-12a3 3 0 0 1 4 4L8 20l-5 1Zm10-10 4 4M13 21h8",
  play: "m6 3 15 9-15 9Z",
  plus: "M5 12h14M12 5v14",
  "refresh-cw":
    "M3 10a9 9 0 0 1 15-5l3 3m0-5v5h-5M21 14a9 9 0 0 1-15 5l-3-3m0 5v-5h5",
  "rotate-ccw": "M3 3v5h5M3 8a9 9 0 1 1 0 7",
  search: "M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0m-2 5 6 6",
  sparkles: "m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2ZM20 2v4m-2-2h4",
  sun: "M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  "swatch-book":
    "M3 3h7v14a4 4 0 0 1-8 0V3Zm7 5 4-4 6 6-11 11m5-8h7v8H7M6 17h.01",
  table: "M3 3h18v18H3ZM3 9h18M3 15h18M12 3v18",
  "table-2": "M3 3h18v18H3ZM3 9h18M9 3v18",
  target:
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0m-4 0a6 6 0 1 0-12 0 6 6 0 0 0 12 0m-4 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0",
  timer: "M9 2h6M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 8 3-3",
  "trending-up": "m3 17 6-6 5 4 7-9m-6 0h6v6",
  type: "M3 7V3h18v4M12 3v18M8 21h8",
  user: "M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2",
  volume: "M3 8h4l5-5v18l-5-5H3ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  x: "m6 6 12 12M6 18 18 6",
  zap: "m13 2-9 12h7l-1 8 10-12h-7Z",
} as const;

const portalGlyphs = Object.fromEntries(
  Object.entries(portalPaths).map(([name, path]) => [
    name,
    icon(name, <path d={path} />),
  ]),
);

export function PortalIcon({
  name = "sparkles",
  ...props
}: IconProps & { name?: keyof typeof portalPaths }) {
  const Glyph = portalGlyphs[name];
  return <Glyph {...props} />;
}
