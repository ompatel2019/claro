import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeScript } from "@/lib/theme";
import localFont from "next/font/local";

const claroSans = localFont({
  src: "./fonts/claro-sans/ClaroSans[wght].woff2",
  weight: "300 800",
  style: "normal",
  variable: "--font-claro-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const instrumentSerif = localFont({
  src: "./fonts/InstrumentSerif-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-instrument-serif",
  display: "swap",
  preload: false,
});
const caveat = localFont({
  src: "./fonts/Caveat-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F3" },
    { media: "(prefers-color-scheme: dark)", color: "#13152B" },
  ],
};

const description = "HSC Economics practice with instant AI marking.";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: { default: "Claro", template: "%s · Claro" },
  description,
  openGraph: {
    siteName: "Claro",
    title: "Claro",
    description,
    images: [
      {
        url: "/og/claro-portal-og.png",
        width: 1200,
        height: 630,
        alt: "Claro: Write it. Get it marked in seconds.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [
      {
        url: "/og/claro-portal-og.png",
        width: 1200,
        height: 630,
        alt: "Claro: Write it. Get it marked in seconds.",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
      className={`${claroSans.variable} ${instrumentSerif.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
