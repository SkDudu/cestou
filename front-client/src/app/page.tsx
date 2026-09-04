"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import {
  MagnifyingGlass,
  Newspaper,
  ShoppingCart,
  Storefront,
} from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { ClubPrice } from "@/components/ClubPrice";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PaymentNote } from "@/components/PaymentNote";
import { Button, EmptyState, ListSurface, Panel, Skeleton } from "@/components/ui";
import { formatDay } from "@/lib/format";

export default function HomePage() {
  const { isAuthenticated } = useConvexAuth();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    isAuthenticated ? {} : "skip",
  );
  const offers = useQuery(
    api.clientOffers.listHomeOffers,
    isAuthenticated ? { limit: 12 } : "skip",
  );
  const flyers = useQuery(
    api.clientOffers.listNearbyFlyers,
    isAuthenticated ? {} : "skip",
  );

  const locLabel = location
    ? `${location.neighborhood ? `${location.neighborhood}, ` : ""}${location.city} — ${location.state}`
    : null;

  return (
    <AppShell
      locationLabel={locLabel}
      title="Início"
      subtitle="Monte a lista, compare mercados e escolha a compra mais barata na sua região."
      actions={
        <Link href="/busca">
          <Button type="button">
            <MagnifyingGlass size={16} weight="bold" aria-hidden />
            Buscar produto
          </Button>
        </Link>
      }
    >
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3 stagger-in">
          <QuickLink
            href="/lista"
            icon={<ShoppingCart size={20} weight="regular" aria-hidden />}
            label="Minha lista"
            hint="Comparar custo total"
          />
          <QuickLink
            href="/busca"
            icon={<MagnifyingGlass size={20} weight="regular" aria-hidden />}
            label="Busca"
            hint="Preços por mercado"
          />
          <QuickLink
            href="/mercados"
            icon={<Storefront size={20} weight="regular" aria-hidden />}
            label="Mercados"
            hint="Filiais da região"
          />
        </div>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="ds-label-caps text-[var(--ds-color-primary)]">
              Encartes publicados
            </h2>
            <Link
              href="/encartes"
              className="text-xs text-[var(--ds-color-muted-foreground)] transition-colors hover:text-[var(--ds-color-foreground)]"
            >
              Ver todos
            </Link>
          </div>
          {!flyers ? (
            <Skeleton className="h-20 w-full" />
          ) : flyers.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Nenhum encarte publicado no momento.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 stagger-in">
              {flyers.slice(0, 4).map((f) => (
                <li key={f._id}>
                  <Link href={`/encartes/${f._id}`} className="block no-underline">
                    <Panel className="transition-colors hover:border-[var(--ds-color-primary)]">
                      <p className="inline-flex items-center gap-2 text-xs text-[var(--ds-color-primary)]">
                        <Newspaper size={14} aria-hidden />
                        {f.supermarketName}
                      </p>
                      <p className="mt-1 font-medium tracking-tight text-[var(--ds-color-foreground)]">
                        {f.title ?? "Encarte"}
                      </p>
                      <p className="text-xs text-[var(--ds-color-muted-foreground)]">
                        {formatDay(f.validFrom)} → {formatDay(f.validUntil)} ·{" "}
                        {f.offerCount} ofertas
                      </p>
                    </Panel>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="ds-label-caps text-[var(--ds-color-primary)]">
              Ofertas para você
            </h2>
            <Link
              href="/busca"
              className="text-xs text-[var(--ds-color-muted-foreground)] transition-colors hover:text-[var(--ds-color-foreground)]"
            >
              Abrir busca
            </Link>
          </div>
          {!offers ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              title="Nenhuma oferta validada"
              body="Quando o pipeline validar ofertas na sua região, elas aparecem aqui."
            />
          ) : (
            <ListSurface className="stagger-in">
              {offers.map((o) => (
                <li
                  key={o._id}
                  className="flex items-start justify-between gap-6 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium tracking-tight">
                      {o.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                      {o.supermarketName}
                      {o.brand ? ` · ${o.brand}` : ""}
                    </p>
                    <PaymentNote
                      installmentCount={o.installmentCount}
                      installmentAmount={o.installmentAmount}
                      installmentInterestFree={o.installmentInterestFree}
                    />
                    <ConditionBadge condition={o.condition} />
                  </div>
                  <ClubPrice
                    publicPrice={o.publicPrice}
                    memberPrice={o.memberPrice}
                    membershipName={o.membershipName}
                  />
                </li>
              ))}
            </ListSurface>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link href={href} className="block no-underline">
      <Panel className="h-full transition-colors hover:border-[var(--ds-color-primary)]">
        <div className="text-[var(--ds-color-primary)]">{icon}</div>
        <p className="mt-2 font-medium tracking-tight text-[var(--ds-color-foreground)]">
          {label}
        </p>
        <p className="text-xs text-[var(--ds-color-muted-foreground)]">{hint}</p>
      </Panel>
    </Link>
  );
}
