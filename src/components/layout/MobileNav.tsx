"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Play,
  Image,
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
  { href: "/assets", label: "素材", icon: Image },
  { href: "/agent", label: "AI 助手", icon: MessageSquare },
  { href: "/settings", label: "设置", icon: Settings },
];

const adminNavItem = {
  href: "/workflows",
  label: "管理",
  icon: Shield,
};

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const navItems = isAdmin
    ? [
        ...baseNavItems.slice(0, 4),
        adminNavItem,
        ...baseNavItems.slice(4),
      ]
    : baseNavItems;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="flex items-center justify-around h-14">
        {navItems.slice(0, 5).map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
