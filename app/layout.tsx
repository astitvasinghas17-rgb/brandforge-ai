import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrandForge AI — Turn any website into a brand system",
  description:
    "BrandForge AI uses TinyFish to inspect live websites and transform them into structured, reusable brand intelligence for marketers, designers, developers, and AI systems.",
};

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#fafaf8]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center bg-black font-mono text-sm font-bold text-white">
            B
          </span>
          <span className="text-[17px] font-semibold tracking-tight">BrandForge</span>
          <span className="hidden rounded-full border border-black/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-black/60 sm:inline">
            TinyFish-powered
          </span>
        </a>
        <nav className="flex items-center gap-1 text-sm">
          <a href="/" className="rounded-md px-3 py-2 font-medium hover:bg-black/5">Generator</a>
          <a href="/examples" className="rounded-md px-3 py-2 font-medium text-black/70 hover:bg-black/5 hover:text-black">Examples</a>
          <a href="/api-docs" className="rounded-md px-3 py-2 font-medium text-black/70 hover:bg-black/5 hover:text-black">API</a>
          <a href="/#how" className="hidden rounded-md px-3 py-2 font-medium text-black/70 hover:bg-black/5 hover:text-black md:inline">How it works</a>
          <a href="/#generate" className="ml-2 bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/80">
            Generate guide
          </a>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-black/10 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-black/60 md:flex-row md:items-center md:justify-between">
            <p>
              <span className="font-semibold text-black">BrandForge AI</span> · Brand intelligence from the live web via{" "}
              <span className="font-medium text-black">TinyFish Fetch + Search</span>.
            </p>
            <p className="font-mono text-xs">
              POST /api/brand/extract · /voice · /benchmark
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
