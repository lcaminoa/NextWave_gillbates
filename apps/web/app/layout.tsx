import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNavigation } from "@/components/ui/app-navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
