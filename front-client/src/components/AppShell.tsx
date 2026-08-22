"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import {
  House,
  MagnifyingGlass,
  ShoppingCart,
  Storefront,
  MapPin,
} from "@phosphor-icons/react";

const links: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/busca", label: "Busca", icon: MagnifyingGlass },
  { href: "/lista", label: "Lista", icon: ShoppingCart },
  { href: "/mercados", label: "Mercados", icon: Storefront },
];

export function AppShell({
  children,
  locationLabel,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  locationLabel?: string | null;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1400px] grid-cols-1 lg:grid-cols-[var(--rail)_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--amber)] focus:px-3 focus:py-2 focus:text-[var(--on-accent)]"
      >
        Ir para conteúdo
      </a>

      <aside className="border-b border-[var(--line)] lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col lg:border-b-0 lg:border-r lg:border-[var(--line)] lg:bg-[var(--bg)]/80 lg:backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-5 py-5 lg:block lg:px-6 lg:py-8">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.28em] text-[var(--amber)]">
              CESTOU
            </p>
            <p className="mt-1 hidden text-xs text-[var(--muted)] lg:block">
              Menor custo da lista
            </p>
          </div>
          {locationLabel ? (
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors duration-200 hover:text-[var(--fg)] lg:mt-6"
            >
              <MapPin size={14} weight="bold" aria-hidden />
              <span className="max-w-[16ch] truncate lg:max-w-none">
                {locationLabel}
              </span>
            </Link>
          ) : null}
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-6"
          aria-label="Principal"
        >
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            const IconCmp = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`group flex shrink-0 cursor-pointer items-center gap-3 rounded-none border px-3 py-2.5 text-sm transition-all duration-200 active:scale-[0.98] lg:w-full ${
                  active
                    ? "border-[var(--amber)]/40 bg-[var(--bg-elev)] text-[var(--fg)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--bg-elev)]/60 hover:text-[var(--fg)]"
                }`}
              >
                <IconCmp
                  size={18}
                  weight={active ? "fill" : "regular"}
                  className={
                    active ? "text-[var(--amber)]" : "text-[var(--muted)]"
                  }
                  aria-hidden
                />
                <span className="font-medium tracking-tight">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <p className="hidden px-6 pb-6 text-[11px] leading-relaxed text-[var(--muted)] lg:block">
          Ofertas validadas da região — não é catálogo completo de prateleira.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        {(title || actions) && (
          <header className="flex flex-col gap-4 border-b border-[var(--line)] px-6 py-6 sm:flex-row sm:items-end sm:justify-between lg:px-10 lg:py-8">
            <div className="min-w-0">
              {title ? (
                <h1 className="text-3xl font-semibold tracking-tighter text-[var(--fg)] md:text-4xl">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-[var(--muted)]">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </header>
        )}
        <main id="main" className="flex-1 px-6 py-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
