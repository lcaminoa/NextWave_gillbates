import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import { AppNavigation } from "@/components/ui/app-navigation";
import "./globals.css";

/**
 * Instrument Sans carries every screen. Geist was the Next.js default, which is
 * exactly why it had to go: it is the face every other submission is set in.
 * Instrument Sans is warmer and slightly wider than Inter, so it reads as a
 * choice rather than a fallback.
 */
const sans = Instrument_Sans({
  variable: "--font-app-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Reserved for evidence ids, timestamps and dimension keys — never for prose. */
const mono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  display: "swap",
});

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;
const metadataBase = new URL(
  publicSiteUrl
    ? publicSiteUrl.startsWith("http")
      ? publicSiteUrl
      : `https://${publicSiteUrl}`
    : "http://localhost:3000",
);

export const metadata: Metadata = {
  applicationName: "PHAROS",
  metadataBase,
  title: {
    default: "PHAROS · Payment Incident Intelligence",
    template: "PHAROS · %s",
  },
  description: "Detect the drop. Prove the cause.",
  openGraph: {
    title: "PHAROS · Payment Incident Intelligence",
    description: "Detect the drop. Prove the cause.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PHAROS · Payment Incident Intelligence",
    description: "Detect the drop. Prove the cause.",
  },
  pinterest: {
    richPin: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0B0B12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
