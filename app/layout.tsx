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

const description =
  "A patient billing assistant that checks a bill is owed before it asks for money, with the staff queue its handoffs land in and a go-live check for the practice.";

export const metadata: Metadata = {
  metadataBase: new URL("https://paystate.vercel.app"),
  title: "Paystate",
  description,
  openGraph: {
    title: "Paystate",
    description,
    siteName: "Paystate",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Paystate",
    description,
  },
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
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-6 text-[13px] text-ink-2 flex flex-col gap-y-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <span>Built by Khursheed Khan.</span>
            <span>An independent project.</span>
            <span>Every patient, account and amount here is synthetic.</span>
            <a
              href="https://github.com/khurshhh1999/paystate"
              className="self-start underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink"
            >
              Source
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
