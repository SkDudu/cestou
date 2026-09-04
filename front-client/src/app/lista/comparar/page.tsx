"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowLeft, Scales, Storefront, Trophy } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ListSurface, Money, Panel, Skeleton } from "@/components/ui";

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
          className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)] transition-colors hover:text-[var(--ds-color-foreground)]"
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
                <p className="ds-label-caps inline-flex items-center gap-2 text-[var(--ds-color-accent)]">
                  <Trophy size={14} weight="fill" aria-hidden />
                  Melhor opção
                </p>
                <p className="mt-3 text-[28px] font-bold tracking-[-0.04em]">
                  {result.bestSingle.supermarketName}
                </p>
                <p className="mt-2">
                  <Money
                    value={result.bestSingle.total}
                    className="text-[28px] text-[var(--ds-color-success)]"
                  />
                </p>
                {result.bestSingle.savingsVsWorst > 0 ? (
                  <p className="mt-3 text-sm text-[var(--ds-color-muted-foreground)]">
                    Economia vs mercado mais caro completo:{" "}
                    <Money value={result.bestSingle.savingsVsWorst} />
                  </p>
                ) : null}
                {!result.bestSingle.complete ? (
                  <p className="mt-3 text-xs text-[var(--ds-color-danger)]">
                    {result.bestSingle.missing} item(ns) indisponível(is) nas
                    ofertas deste mercado.
                  </p>
                ) : null}
              </Panel>
            ) : null}

            {result.split && result.split.stores.length > 1 ? (
              <Panel className="p-6">
                <p className="ds-label-caps inline-flex items-center gap-2 text-[var(--ds-color-success)]">
                  <Scales size={14} weight="bold" aria-hidden />
                  Melhor combinação (até 2 mercados)
                </p>
                <ul className="mt-4 space-y-4">
                  {result.split.stores.map((s) => (
                    <li
                      key={s.supermarketId}
                      className="flex items-start justify-between gap-4 border-b border-[var(--ds-color-border)] pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium tracking-tight">
                          {s.supermarketName}
                        </p>
                        <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
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
                  <p className="mt-1 text-sm text-[var(--ds-color-success)]">
                    Economia vs 1 mercado:{" "}
                    <Money value={result.split.savingsVsBestSingle} />
                  </p>
                ) : null}
              </Panel>
            ) : null}
          </div>

          <section>
            <h2 className="ds-label-caps inline-flex items-center gap-2">
              <Storefront size={14} aria-hidden />
              Todos os mercados
            </h2>
            <ListSurface className="mt-4">
              {result.markets.map((m) => (
                <li
                  key={m.supermarketId}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium tracking-tight">
                      {m.supermarketName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                      {m.coverage}/{result.itemCount} itens
                      {!m.complete ? " · incompleto" : ""}
                    </p>
                    {m.lines.some(
                      (l) => l.condition && l.condition.kind !== "none",
                    ) ? (
                      <p className="mt-1 text-[11px] text-[var(--ds-color-accent)]">
                        Inclui preço condicionado
                      </p>
                    ) : null}
                  </div>
                  <Money value={m.total} />
                </li>
              ))}
            </ListSurface>
            <p className="mt-4 text-xs leading-relaxed text-[var(--ds-color-muted-foreground)]">
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
