"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Image,
  Play,
  Shield,
  MessageSquare,
  Settings,
  Layers,
  Users,
} from "lucide-react";
const baseNavItems = [
  { href: "/studio", label: "画板", icon: Play },
  { href: "/fusion", label: "融合图", icon: Layers },
  { href: "/pose", label: "多姿势", icon: Users },
  { href: "/assets", label: "素材库", icon: Image },
  { href: "/agent", label: "AI 助手", icon: MessageSquare },
  { href: "/settings", label: "设置", icon: Settings },
];

const adminNavItem = {
  href: "/workflows",
  label: "管理",
  icon: Shield,
};

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const navItems = isAdmin
    ? [
        ...baseNavItems.slice(0, 4),
        adminNavItem,
        ...baseNavItems.slice(4),
      ]
    : baseNavItems;

  return (
    <aside className="hidden lg:block fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="p-2">
        <div className="flex items-stretch justify-center gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
        </div>
      </nav>
    </aside>
  );
}
