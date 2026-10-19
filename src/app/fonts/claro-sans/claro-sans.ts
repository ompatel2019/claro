import localFont from "next/font/local";

// Claro Sans v4.1 — variable weight 300–800. Modified from Onest, extra maths glyphs from Inter (both SIL OFL 1.1).
// Keep OFL.txt alongside the font file.
export const claroSans = localFont({
  src: "./ClaroSans[wght].woff2",
  weight: "300 800",
  style: "normal",
  variable: "--font-claro-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
