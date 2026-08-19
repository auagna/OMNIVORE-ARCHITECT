import type { Metadata, Viewport } from "next";
import { AppStateProvider } from "@/features/app-state/app-state-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OMNIVORE ARCHITECT",
    template: "%s — OMNIVORE ARCHITECT",
  },
  description: "Discover, join, operate, and record OMNIVORE ARCHITECT programs.",
};

export const viewport: Viewport = {
  themeColor: "#151515",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><AppStateProvider>{children}</AppStateProvider></body>
    </html>
  );
}
