import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Payable as Stated",
  description:
    "A test bench for patient billing agents: twelve patient situations, a scripted patient, and a judge that checks whether the agent should have asked for money at all.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <SiteNav />
        <main className="flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-rule">
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-6 text-[13px] text-ink-3 flex flex-wrap gap-x-6 gap-y-1">
            <span>Built by Khursheed Khan.</span>
            <span>An independent project. Not affiliated with Collectly.</span>
            <span>Every patient, account and amount here is synthetic.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
