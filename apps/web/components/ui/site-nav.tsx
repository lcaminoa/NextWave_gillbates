"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, FlaskConical, LayoutDashboard, SearchCheck } from "lucide-react";
import { PharosBrand } from "./pharos-brand";
import { RuntimeIndicator } from "./status";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useNotifications } from "@/components/notifications/notifications-provider";

/**
 * One navigation for the whole site. The landing and the product used to ship
 * two different bars — different shape, different height, different behaviour —
 * so crossing from / to /control-room felt like leaving the product. This is the
 * same shell in two variants: what changes is the destinations and the right-hand
 * slot, never the geometry.
 */

const productLinks = [
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

/**
 * True once the page has left the very top, so the bar can condense.
 *
 * The two thresholds are hysteresis, not decoration. A single threshold flips on
 * every pixel of jitter around it, and the page has content that resizes on its
 * own — a metric card re-wrapping as streamed numbers change is enough to nudge
 * the scroll position across a bare boundary and set the bar flickering.
 */
function useScrolled(condenseAbove = 28, expandBelow = 10) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () =>
      setScrolled((current) => {
        const y = window.scrollY;
        if (y > condenseAbove) return true;
        if (y < expandBelow) return false;
        return current;
      });
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [condenseAbove, expandBelow]);

  return scrolled;
}

export function SiteNav() {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const isPublic = pathname === "/";

  return (
    <header className={scrolled ? "site-nav site-nav-condensed" : "site-nav"}>
      <div className="site-nav-frame">
        <PharosBrand
          href={isPublic ? "/" : "/control-room"}
          className="site-nav-brand"
          label={isPublic ? "PHAROS — home" : "PHAROS — open Control Room"}
          priority={isPublic}
        />
        {isPublic ? <PublicLinks /> : <ProductLinks pathname={pathname} />}
      </div>
    </header>
  );
}

function PublicLinks() {
  return (
    <>
      <nav className="site-nav-links" aria-label="PHAROS">
        <a href="#evidence">Evidence model</a>
        <a href="#pipeline">How it works</a>
        <Link href="/chaos">Chaos Lab</Link>
      </nav>
      <div className="site-nav-utilities">
        <Link href="/control-room" className="site-nav-cta">
          Open control room <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}

function ProductLinks({ pathname }: { pathname: string }) {
  const { openCaseCount, runtimeStatus } = useNotifications();

  return (
    <>
      <nav className="site-nav-links" aria-label="Product navigation">
        {productLinks.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active ? "site-nav-link site-nav-link-active" : "site-nav-link"}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span>{item.label}</span>
              {item.label === "Investigations" && openCaseCount ? <em>{openCaseCount}</em> : null}
            </Link>
          );
        })}
      </nav>
      <div className="site-nav-utilities">
        <NotificationBell />
        {/* The runtime signal is present at every width — it is what says whether
            anything else on screen can be trusted. */}
        <RuntimeIndicator status={runtimeStatus} className="site-nav-runtime" />
      </div>
    </>
  );
}
