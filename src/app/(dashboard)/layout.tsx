import { AppShell } from "@/components/layout/AppShell";
import { getIsAdmin } from "@/lib/auth-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await getIsAdmin();
  return <AppShell isAdmin={isAdmin}>{children}</AppShell>;
}
