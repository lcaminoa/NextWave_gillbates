"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, LayoutDashboard, SearchCheck } from "lucide-react";
import { PharosBrand } from "./pharos-brand";
import { RuntimeIndicator } from "./status";
import { useIncidentReports } from "@/lib/api/use-control-tower";

const navigationItems = [
  {
    href: "/control-room",
    label: "Overview",
    icon: LayoutDashboard,
    matches: (pathname: string) => pathname === "/control-room",
  },
  {
    href: "/investigations",
    label: "Investigations",
    icon: SearchCheck,
    matches: (pathname: string) =>
      pathname.startsWith("/investigations") || pathname.startsWith("/incidents"),
  },
  {
    href: "/chaos",
    label: "Chaos Lab",
    icon: FlaskConical,
    matches: (pathname: string) => pathname.startsWith("/chaos"),
  },
];

export function AppNavigation() {
  const pathname = usePathname();
  const { reports, status } = useIncidentReports();

  if (pathname === "/") return null;

  return (
    <header className="app-navigation">
      <div className="app-navigation-frame">
        <PharosBrand href="/control-room" className="app-nav-brand" label="PHAROS — open Control Room" />

        <nav className="app-nav-links" aria-label="Product navigation">
          {navigationItems.map((item) => {
            const active = item.matches(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "app-nav-link app-nav-link-active" : "app-nav-link"}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span>{item.label}</span>
                {/* The open-case count belongs to Investigations; a separate bell
                    duplicated the same number in the same header. */}
                {item.label === "Investigations" && reports.length ? <em>{reports.length}</em> : null}
              </Link>
            );
          })}
        </nav>

        <div className="app-nav-utilities">
          <RuntimeIndicator status={status} className="app-nav-runtime" />
        </div>
      </div>
    </header>
  );
}
