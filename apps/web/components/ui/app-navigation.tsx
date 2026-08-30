"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FlaskConical, LayoutDashboard, Radio, SearchCheck } from "lucide-react";
import { PharosBrand } from "./pharos-brand";
import { useIncidentReports } from "@/lib/api/use-control-tower";

const navigationItems = [
  { href: "/control-room", label: "Overview", icon: LayoutDashboard, matches: (pathname: string) => pathname === "/control-room" },
  { href: "/investigations", label: "Investigations", icon: SearchCheck, matches: (pathname: string) => pathname.startsWith("/investigations") || pathname.startsWith("/incidents") },
  { href: "/chaos", label: "Chaos Lab", icon: FlaskConical, matches: (pathname: string) => pathname.startsWith("/chaos") },
];

export function AppNavigation() {
  const pathname = usePathname();
  const { reports, status } = useIncidentReports();
  const runtimeLabel = status === "live" ? "Live" : status === "loading" ? "Connecting" : "Unavailable";

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
            const content = (
              <>
                <Icon className="size-3.5" />
                <span>{item.label}</span>
                {item.label === "Investigations" ? <em>{reports.length}</em> : null}
              </>
            );
            const className = active ? "app-nav-link app-nav-link-active" : "app-nav-link";
            if (item.href === "/chaos") {
              // Basic Auth needs a document navigation so the browser can show its native prompt.
              return <a key={item.href} href={item.href} className={className}>{content}</a>;
            }

            return <Link key={item.href} href={item.href} className={className}>{content}</Link>;
          })}
        </nav>

        <div className="app-nav-utilities">
          <span className={status === "unavailable" ? "app-nav-live opacity-60" : "app-nav-live"}>
            <Radio className={status === "live" ? "size-3 animate-pulse" : "size-3"} /> {runtimeLabel}
          </span>
          <Link href="/investigations" className="app-nav-notifications" aria-label={`${reports.length} runtime investigations`}>
            <Bell className="size-4" />
            <span>{reports.length}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
