import type { Metadata } from "next";
import "./globals.css";
import { themeScript } from "@/lib/theme";
import { claroSans } from "./fonts/claro-sans/claro-sans";

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
        url: "/og/claro-student-og.png",
        width: 1200,
        height: 630,
        alt: "Claro: HSC Economics, marked in seconds.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [
      {
        url: "/og/claro-student-og.png",
        width: 1200,
        height: 630,
        alt: "Claro: HSC Economics, marked in seconds.",
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
      className={`${claroSans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
