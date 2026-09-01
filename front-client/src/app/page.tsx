"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  MagnifyingGlass,
  ShoppingCart,
  Storefront,
} from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/SessionProvider";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PaymentNote } from "@/components/PaymentNote";

export default function HomePage() {
  const { userId, ready } = useSession();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    userId ? { userId } : "skip",
  );
  const offers = useQuery(
    api.clientOffers.listHomeOffers,
    userId ? { userId, limit: 12 } : "skip",
  );

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (userId && location === null) {
    return (
      <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-center px-8 py-16 lg:px-16">
          <p className="font-mono text-[11px] font-bold tracking-[0.28em] text-[var(--amber)]">
            CESTOU
          </p>
          <h1 className="mt-6 max-w-[14ch] text-4xl font-semibold tracking-tighter md:text-6xl">
            Onde a lista inteira fica mais barata
          </h1>
          <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-[var(--muted)]">
            Informe sua região para cruzar ofertas validadas dos supermercados
            perto de você.
          </p>
          <Link href="/onboarding" className="mt-10 inline-flex w-fit">
            <Button type="button">
              Informar minha região
              <ArrowRight size={16} weight="bold" aria-hidden />
            </Button>
          </Link>
        </section>
        <aside className="relative hidden overflow-hidden border-l border-[var(--line)] bg-[var(--bg-elev)] md:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2a2418,transparent_55%),radial-gradient(circle_at_80%_70%,#1a2a1e,transparent_50%)]" />
          <div className="relative flex h-full flex-col justify-end p-10">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--amber)]">
              Norte
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              Otimiza custo da cesta — não só preço unitário.
            </p>
          </div>
        </aside>
      </div>
    );
  }

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
            hint="Favoritos da região"
          />
        </div>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              Ofertas para você
            </h2>
            <Link
              href="/busca"
              className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
            >
              Abrir busca
            </Link>
          </div>
          {!offers ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              title="Nenhuma oferta validada"
              body="Quando o pipeline validar ofertas na sua região, elas aparecem aqui."
              action={
                <Link href="/busca">
                  <Button variant="ghost" type="button">
                    Ir para busca
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--bg-elev)] stagger-in">
              {offers.map((o) => (
                <li
                  key={o._id}
                  className="flex items-start justify-between gap-6 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium tracking-tight">
                      {o.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {o.supermarketName}
                      {o.brand ? ` · ${o.brand}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={o.price} className="text-[var(--moss)]" />
                    {o.originalPrice ? (
                      <p className="mt-0.5 font-mono text-xs text-[var(--muted)] line-through">
                        <Money value={o.originalPrice} />
                      </p>
                    ) : null}
                    <PaymentNote
                      installmentCount={o.installmentCount}
                      installmentAmount={o.installmentAmount}
                      installmentInterestFree={o.installmentInterestFree}
                    />
                    <ConditionBadge condition={o.condition} />
                  </div>
                </li>
              ))}
            </ul>
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
    <Link href={href} className="block">
      <Panel className="h-full px-4 py-4 transition-colors duration-200 hover:border-[var(--amber)]/40">
        <div className="text-[var(--amber)]">{icon}</div>
        <p className="mt-3 font-medium tracking-tight">{label}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      </Panel>
    </Link>
  );
}
