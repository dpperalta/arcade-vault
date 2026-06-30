import type { Metadata } from "next";
import { Press_Start_2P, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ArcadeProvider } from "./components/ArcadeProvider";
import Nav from "./components/Nav";
import Footer from "./components/Footer";

// Pixel display font (--pixel). Press Start 2P ships a single weight.
const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Body / monospace font (--mono). Variable font, so no explicit weight.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arcade Vault",
  description: "Play arcade games and compete for the highest score.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${pressStart.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <div className="av-bg" />
        <div className="av-noise" />
        <ArcadeProvider>
          <Nav />
          <main className="av-main">{children}</main>
          <Footer />
        </ArcadeProvider>
      </body>
    </html>
  );
}
