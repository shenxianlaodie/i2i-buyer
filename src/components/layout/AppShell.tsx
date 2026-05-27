import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";

export function AppShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Topbar />
      <main className="flex-1 overflow-auto pb-14 lg:pb-16">
        {children}
      </main>
      <Sidebar isAdmin={isAdmin} />
      <MobileNav isAdmin={isAdmin} />
    </div>
  );
}
