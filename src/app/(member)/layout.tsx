import { AppShell } from "@/components/layout";
import "./member.css";

export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>{children}</AppShell>
  );
}
