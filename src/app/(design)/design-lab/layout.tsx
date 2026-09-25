import type { Metadata } from "next";
import "../../(member)/member.css";
import "./design-lab.css";

export const metadata: Metadata = {
  title: "DESIGN LAB",
  robots: { index: false, follow: false },
};

export default function DesignLabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
