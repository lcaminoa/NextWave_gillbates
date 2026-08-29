"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FlaskConical, LayoutDashboard, Radio, SearchCheck } from "lucide-react";
import { reports } from "@/lib/fixtures/control-tower";
import { PharosBrand } from "./pharos-brand";

const navigationItems = [
  { href: "/control-room", label: "Overview", icon: LayoutDashboard, matches: (pathname: string) => pathname === "/control-room" },
  { href: "/investigations", label: "Investigations", icon: SearchCheck, matches: (pathname: string) => pathname.startsWith("/investigations") || pathname.startsWith("/incidents") },
  { href: "/chaos", label: "Chaos Lab", icon: FlaskConical, matches: (pathname: string) => pathname.startsWith("/chaos") },
];

export function AppNavigation() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <header className="app-navigation">
      <div className="app-navigation-frame">
        <PharosBrand
          href="/control-room"
          className="app-nav-brand"
          label="PHAROS — open Control Room"
        />

        <nav className="app-nav-links" aria-label="Product navigation">
          {navigationItems.map((item) => {
            const active = item.matches(pathname);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active ? "app-nav-link app-nav-link-active" : "app-nav-link"}>
                <Icon className="size-3.5" />
                <span>{item.label}</span>
                {item.label === "Investigations" ? <em>{reports.length}</em> : null}
              </Link>
            );
          })}
        </nav>

        <div className="app-nav-utilities">
          <span className="app-nav-live"><Radio className="size-3 animate-pulse" /> Live</span>
          <Link href="/investigations" className="app-nav-notifications" aria-label={`${reports.length} active investigations`}>
            <Bell className="size-4" />
            <span>{reports.length}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
