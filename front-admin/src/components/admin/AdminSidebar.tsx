"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useAdminOverview } from "@/lib/use-admin-overview";

const operacao = [
  { href: "/admin", label: "Visão geral", icon: "overview" },
  { href: "/admin/scraper", label: "Workers", icon: "workers", badge: "workers" },
  { href: "/admin/extraction", label: "Extração", icon: "extract", alert: true },
] as const;

const catalogo = [
  { href: "/admin/flyers", label: "Encartes", icon: "flyers" },
  { href: "/admin/offers", label: "Ofertas", icon: "offers" },
  { href: "/admin/products", label: "Produtos", icon: "products" },
  { href: "/admin/brands", label: "Marcas", icon: "brands" },
  { href: "/admin/prices", label: "Preços", icon: "prices" },
  { href: "/admin/catalog/health", label: "Saúde", icon: "health" },
  { href: "/admin/supermarkets", label: "Lojas", icon: "stores" },
] as const;

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
  };
  if (name === "overview") {
    return (
      <svg {...common}>
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    );
  }
  if (name === "workers") {
    return (
      <svg {...common}>
        <circle cx="5" cy="6" r="2" />
        <circle cx="11" cy="6" r="2" />
        <path d="M2.5 13c.4-1.6 1.8-2.5 2.5-2.5S7.1 11.4 7.5 13" />
        <path d="M8.5 13c.4-1.6 1.8-2.5 2.5-2.5s2.1.9 2.5 2.5" />
      </svg>
    );
  }
  if (name === "extract") {
    return (
      <svg {...common}>
        <path d="M3 12.5V3.5h7l3 3v6H3z" />
        <path d="M10 3.5V7h3" />
      </svg>
    );
  }
  if (name === "flyers") {
    return (
      <svg {...common}>
        <rect x="3" y="2.5" width="10" height="11" rx="1" />
        <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
      </svg>
    );
  }
  if (name === "offers") {
    return (
      <svg {...common}>
        <path d="M3 8.5l5-5 5 5-5 5-5-5z" />
        <circle cx="8" cy="8.5" r="1" />
      </svg>
    );
  }
  if (name === "products") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="10" height="10" rx="1" />
        <path d="M3 7h10M7 3v10" />
      </svg>
    );
  }
  if (name === "brands") {
    return (
      <svg {...common}>
        <path d="M4 12.5V4.5h5.5L11 6v6.5H4z" />
        <path d="M6 8h3M6 10h2" />
      </svg>
    );
  }
  if (name === "prices") {
    return (
      <svg {...common}>
        <path d="M3 11.5L6.5 4.5h3L13 11.5" />
        <path d="M5.5 9h5" />
      </svg>
    );
  }
  if (name === "health") {
    return (
      <svg {...common}>
        <path d="M2.5 8.5h3l1.5-3.5 2 7 1.5-3.5h3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 13V7l5.5-4 5.5 4v6H9.5V9H6.5v4H2.5z" />
    </svg>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const { data: overview } = useAdminOverview();
  const query = q.trim().toLowerCase();

  const match = (label: string, href: string) =>
    !query ||
    label.toLowerCase().includes(query) ||
    href.toLowerCase().includes(query);

  const workerCount = overview?.runningRuns ?? 0;
  const extractAlert = (overview?.failedFlyers ?? 0) > 0;

  const items = useMemo(() => {
    const active = (href: string) =>
      href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
    return { active };
  }, [pathname]);

  return (
    <aside className="ds-sidebar h-dvh overflow-y-auto">
      <div className="flex h-11 shrink-0 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold text-white"
          style={{ background: "var(--ds-color-harbor)" }}
        >
          C
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--ds-color-foreground)" }}>
          Cestou Ops
        </span>
      </div>

      <label className="mt-4 flex h-9 shrink-0 items-center gap-2 rounded-[6px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-3">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="6" cy="6" r="4.2" stroke="var(--ds-color-muted-foreground)" strokeWidth="1.3" />
          <path d="M9.2 9.2L12 12" stroke="var(--ds-color-muted-foreground)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no ops"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--ds-color-muted-foreground)]"
        />
      </label>

      <nav className="mt-5 flex min-h-0 flex-1 flex-col">
        <p className="ds-label-caps px-0.5 pb-1.5">Operação</p>
        {operacao.filter((i) => match(i.label, i.href)).map((item) => {
          const on = items.active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ds-nav-item ${on ? "ds-nav-item--active" : ""}`}
            >
              <span className={on ? "ds-nav-rail" : "ds-nav-rail ds-nav-rail--idle"} />
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[var(--ds-color-foreground)]">
                <NavIcon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              {"badge" in item ? (
                <span className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
                  {workerCount}
                </span>
              ) : null}
              {"alert" in item && extractAlert ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--ds-color-buoy)" }}
                />
              ) : null}
            </Link>
          );
        })}

        <p className="ds-label-caps mt-5 px-0.5 pb-1.5">Catálogo</p>
        {catalogo.filter((i) => match(i.label, i.href)).map((item) => {
          const on = items.active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ds-nav-item ${on ? "ds-nav-item--active" : ""}`}
            >
              <span className={on ? "ds-nav-rail" : "ds-nav-rail ds-nav-rail--idle"} />
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                <NavIcon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--ds-color-border)] pt-3">
        <span
          className="h-8 w-8 shrink-0 rounded-full"
          style={{ background: "var(--ds-color-secondary)" }}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">Cestou</p>
          <p className="truncate text-xs text-[var(--ds-color-muted-foreground)]">
            Operações
          </p>
        </div>
      </div>
    </aside>
  );
}
