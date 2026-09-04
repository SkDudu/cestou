"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Icon } from "@phosphor-icons/react";
import {
  House,
  MagnifyingGlass,
  ShoppingCart,
  Storefront,
  MapPin,
  Newspaper,
  Heart,
  SignOut,
  DotsThreeOutline,
  X,
} from "@phosphor-icons/react";

const primaryLinks: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/busca", label: "Busca", icon: MagnifyingGlass },
  { href: "/lista", label: "Lista", icon: ShoppingCart },
  { href: "/encartes", label: "Encartes", icon: Newspaper },
];

const moreLinks: { href: string; label: string; icon: Icon }[] = [
  { href: "/mercados", label: "Mercados", icon: Storefront },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
];

const allSidebarLinks = [
  ...primaryLinks,
  ...moreLinks,
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
  const { signOut } = useAuthActions();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  return (
    <div className="flex min-h-[100dvh] bg-[var(--ds-color-muted)] text-[var(--ds-color-foreground)] lg:h-dvh lg:overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--ds-radius-md)] focus:bg-[var(--ds-color-primary)] focus:px-3 focus:py-2 focus:text-[var(--ds-color-primary-foreground)]"
      >
        Ir para conteúdo
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-[var(--ds-color-border)] bg-[var(--ds-color-background)] lg:flex lg:h-dvh lg:w-[var(--ds-sidebar-width)] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:px-4 lg:pb-4 lg:pt-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold text-white"
            style={{ background: "var(--ds-color-harbor)" }}
          >
            C
          </span>
          <div>
            <p className="text-sm font-medium">Cestou</p>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              Menor custo da lista
            </p>
          </div>
        </div>
        {locationLabel ? (
          <Link
            href="/onboarding"
            className="mt-5 inline-flex items-center gap-1.5 text-xs text-[var(--ds-color-muted-foreground)] transition-colors hover:text-[var(--ds-color-foreground)]"
          >
            <MapPin size={14} weight="bold" aria-hidden />
            <span>{locationLabel}</span>
          </Link>
        ) : null}

        <nav
          className="mt-5 flex flex-1 flex-col gap-0.5"
          aria-label="Principal"
        >
          {allSidebarLinks.map((l) => {
            const active = isActive(pathname, l.href);
            const IconCmp = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`ds-nav-item no-underline ${
                  active ? "ds-nav-item--active" : ""
                }`}
              >
                <span
                  className={`ds-nav-rail ${active ? "" : "ds-nav-rail--idle"}`}
                  aria-hidden
                />
                <IconCmp
                  size={16}
                  weight={active ? "fill" : "regular"}
                  className={
                    active
                      ? "text-[var(--ds-color-primary)]"
                      : "text-[var(--ds-color-muted-foreground)]"
                  }
                  aria-hidden
                />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="ds-nav-item text-[var(--ds-color-muted-foreground)]"
        >
          <span className="ds-nav-rail ds-nav-rail--idle" aria-hidden />
          <SignOut size={16} aria-hidden />
          Sair
        </button>
        <p className="mt-3 px-2.5 text-[11px] leading-relaxed text-[var(--ds-color-muted-foreground)]">
          Ofertas validadas — não é catálogo completo de prateleira.
        </p>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--ds-color-border)] bg-[var(--ds-color-background)]/95 backdrop-blur-md lg:hidden pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold text-white"
                style={{ background: "var(--ds-color-harbor)" }}
              >
                C
              </span>
              <p className="truncate text-sm font-semibold tracking-tight">
                Cestou
              </p>
            </div>
            {locationLabel ? (
              <Link
                href="/onboarding"
                className="inline-flex max-w-[45%] items-center gap-1 truncate text-xs text-[var(--ds-color-muted-foreground)]"
              >
                <MapPin size={14} weight="bold" className="shrink-0" aria-hidden />
                <span className="truncate">{locationLabel}</span>
              </Link>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
          {(title || actions) && (
            <div className="flex flex-col gap-3 px-4 pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 lg:px-8 lg:pt-7">
              <div className="min-w-0">
                {title ? (
                  <h1 className="text-[24px] font-bold leading-7 tracking-[-0.04em] text-[var(--ds-color-foreground)] sm:text-[28px] sm:leading-8">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="mt-1 max-w-[65ch] text-sm text-[var(--ds-color-muted-foreground)]">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                  {actions}
                </div>
              ) : null}
            </div>
          )}
          <main
            id="main"
            className="flex-1 px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-8 lg:pt-6"
          >
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ds-color-border)] bg-[var(--ds-color-background)]/95 backdrop-blur-md lg:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {primaryLinks.map((l) => {
            const active = isActive(pathname, l.href);
            const IconCmp = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center justify-center gap-0.5 no-underline transition-colors ${
                  active
                    ? "text-[var(--ds-color-primary)]"
                    : "text-[var(--ds-color-muted-foreground)]"
                }`}
              >
                <IconCmp
                  size={22}
                  weight={active ? "fill" : "regular"}
                  aria-hidden
                />
                <span className="text-[10px] font-medium leading-none">
                  {l.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
              moreActive || moreOpen
                ? "text-[var(--ds-color-primary)]"
                : "text-[var(--ds-color-muted-foreground)]"
            }`}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-sheet"
          >
            <DotsThreeOutline
              size={22}
              weight={moreActive || moreOpen ? "fill" : "regular"}
              aria-hidden
            />
            <span className="text-[10px] font-medium leading-none">Mais</span>
          </button>
        </div>
      </nav>

      {/* Mobile "Mais" sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ds-color-scrim)]"
            aria-label="Fechar menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="absolute inset-x-0 bottom-0 rounded-t-[var(--ds-radius-xl)] border border-[var(--ds-color-border)] bg-[var(--ds-color-background)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-lg"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--ds-color-border)]" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold tracking-tight">Mais</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--ds-radius-md)] text-[var(--ds-color-muted-foreground)]"
                aria-label="Fechar"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="space-y-1">
              {moreLinks.map((l) => {
                const active = isActive(pathname, l.href);
                const IconCmp = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex min-h-12 items-center gap-3 rounded-[var(--ds-radius-md)] px-3 no-underline ${
                      active
                        ? "bg-[var(--ds-color-muted)] text-[var(--ds-color-foreground)]"
                        : "text-[var(--ds-color-foreground)]"
                    }`}
                  >
                    <IconCmp
                      size={20}
                      weight={active ? "fill" : "regular"}
                      className="text-[var(--ds-color-primary)]"
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{l.label}</span>
                  </Link>
                );
              })}
              {locationLabel ? (
                <Link
                  href="/onboarding"
                  className="flex min-h-12 items-center gap-3 rounded-[var(--ds-radius-md)] px-3 no-underline text-[var(--ds-color-foreground)]"
                >
                  <MapPin
                    size={20}
                    weight="bold"
                    className="text-[var(--ds-color-primary)]"
                    aria-hidden
                  />
                  <span className="min-w-0 truncate text-sm font-medium">
                    Região: {locationLabel}
                  </span>
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex min-h-12 w-full items-center gap-3 rounded-[var(--ds-radius-md)] px-3 text-left text-[var(--ds-color-danger)]"
              >
                <SignOut size={20} aria-hidden />
                <span className="text-sm font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
