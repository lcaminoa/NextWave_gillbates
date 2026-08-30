"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, FlaskConical, LayoutDashboard, SearchCheck } from "lucide-react";
import { PharosBrand } from "./pharos-brand";
import { RuntimeIndicator } from "./status";
import { useIncidentReports } from "@/lib/api/use-control-tower";

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

/** True once the page has left the very top, so the bar can condense. */
function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);

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
  const { reports, status } = useIncidentReports();

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
              {item.label === "Investigations" && reports.length ? <em>{reports.length}</em> : null}
            </Link>
          );
        })}
      </nav>
      <div className="site-nav-utilities">
        {/* The runtime signal is present at every width — it is what says whether
            anything else on screen can be trusted. */}
        <RuntimeIndicator status={status} className="site-nav-runtime" />
      </div>
    </>
  );
}
