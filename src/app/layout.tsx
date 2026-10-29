import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpendPilot AI — Budget-Aware Shopping Partner",
  description:
    "Turn natural-language requests into source-backed product recommendations, enforced spending rules, and verified PayPal checkout.",
  keywords: [
    "AI shopping",
    "budget assistant",
    "PayPal hackathon",
    "SpendPilot",
    "smart shopping",
  ],
  authors: [{ name: "SpendPilot Team" }],
};

export const viewport: Viewport = {
  themeColor: "#080808",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#080808] text-[#D4D4D4] antialiased flex flex-col selection:bg-[#FF6A00] selection:text-white">
        {children}
      </body>
    </html>
  );
}
