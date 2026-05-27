import { ShieldAlert } from "lucide-react";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { getIsAdmin } from "@/lib/auth-user";

export default async function AdminPage() {
  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldAlert className="size-10" />
        <p className="text-sm">需要管理员权限才能访问</p>
        <p className="text-xs">
          请确认数据库 role 为 ADMIN，并使用对应账号重新登录
        </p>
      </div>
    );
  }

  return <AdminPanel />;
}
