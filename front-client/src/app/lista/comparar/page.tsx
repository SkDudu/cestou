"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowLeft, Scales, Storefront, Trophy } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Money, Panel, Skeleton } from "@/components/ui";

function CompareInner() {
  const { isAuthenticated } = useConvexAuth();
  const params = useSearchParams();
  const listId = params.get("listId") as Id<"shoppingLists"> | null;

  const result = useQuery(
    api.clientLists.compareShoppingList,
    isAuthenticated && listId ? { listId } : "skip",
  );

  return (
    <AppShell
      title="Melhor compra"
      subtitle="Otimização pelo custo da lista nos mercados da sua região."
      actions={
        <Link
          href="/lista"
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar à lista
        </Link>
      }
    >
      {!listId ? (
        <EmptyState
          title="Lista não informada"
          body="Abra a comparação a partir da tela da lista."
        />
      ) : !result ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : result.error ? (
        <EmptyState title="Não foi possível comparar" body={result.error} />
      ) : result.itemCount === 0 ? (
        <EmptyState
          title="Lista vazia"
          body="Adicione itens antes de comparar preços."
        />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 stagger-in">
            {result.bestSingle ? (
              <Panel accent className="p-6">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                  <Trophy size={14} weight="fill" aria-hidden />
                  Melhor opção
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tighter">
                  {result.bestSingle.supermarketName}
                </p>
                <p className="mt-2">
                  <Money
                    value={result.bestSingle.total}
                    className="text-3xl text-[var(--moss)]"
                  />
                </p>
                {result.bestSingle.savingsVsWorst > 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Economia vs mercado mais caro completo:{" "}
                    <Money value={result.bestSingle.savingsVsWorst} />
                  </p>
                ) : null}
                {!result.bestSingle.complete ? (
                  <p className="mt-3 text-xs text-[var(--alert)]">
                    {result.bestSingle.missing} item(ns) indisponível(is) nas
                    ofertas deste mercado.
                  </p>
                ) : null}
              </Panel>
            ) : null}

            {result.split && result.split.stores.length > 1 ? (
              <Panel className="p-6">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--moss)]">
                  <Scales size={14} weight="bold" aria-hidden />
                  Melhor combinação (até 2 mercados)
                </p>
                <ul className="mt-4 space-y-4">
                  {result.split.stores.map((s) => (
                    <li
                      key={s.supermarketId}
                      className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium tracking-tight">
                          {s.supermarketName}
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {s.itemCount} produtos
                        </p>
                      </div>
                      <Money value={s.total} />
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-lg">
                  Total: <Money value={result.split.total} />
                </p>
                {result.split.savingsVsBestSingle > 0 ? (
                  <p className="mt-1 text-sm text-[var(--moss)]">
                    Economia vs 1 mercado:{" "}
                    <Money value={result.split.savingsVsBestSingle} />
                  </p>
                ) : null}
              </Panel>
            ) : null}
          </div>

          <section>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              <Storefront size={14} aria-hidden />
              Todos os mercados
            </h2>
            <ul className="mt-4 divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--bg-elev)]">
              {result.markets.map((m) => (
                <li
                  key={m.supermarketId}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium tracking-tight">
                      {m.supermarketName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {m.coverage}/{result.itemCount} itens
                      {!m.complete ? " · incompleto" : ""}
                    </p>
                    {m.lines.some(
                      (l) => l.condition && l.condition.kind !== "none",
                    ) ? (
                      <p className="mt-1 text-[11px] text-[var(--amber)]">
                        Inclui preço condicionado
                      </p>
                    ) : null}
                  </div>
                  <Money value={m.total} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              {result.disclaimer}
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function CompararPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center">
          <Skeleton className="h-8 w-40" />
        </div>
      }
    >
      <CompareInner />
    </Suspense>
  );
}
