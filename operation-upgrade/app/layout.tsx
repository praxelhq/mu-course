import type { Metadata } from "next";
import { Instrument_Serif, Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Three voices: a serif for the people who talk to you, a grotesque for the
// interface, and a humanist sans for anything long enough to read properly.
const serif = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Ninety Days at Bharat Bites",
  description: "A ninety-day AI transformation, run by you, for a food business that has grown faster than the way it works.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
