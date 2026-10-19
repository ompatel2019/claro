import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/lib/theme";

const sans = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

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
      { url: "/og/claro-og.png", width: 1200, height: 630, alt: "Claro" },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/og/claro-og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
      className={`${sans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
