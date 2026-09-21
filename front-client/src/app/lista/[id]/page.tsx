"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  DotsThreeVertical,
  PencilSimple,
  Star,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import {
  BottomSheet,
  Button,
  EmptyState,
  ListSurface,
  Modal,
  Panel,
  Skeleton,
} from "@/components/ui";
import { clientApi } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type ListItem = {
  id: string;
  queryText: string;
  quantity: number;
  offerId: string | null;
  canonicalProductId: string | null;
};

type ShoppingList = {
  id: string;
  name: string;
  items: ListItem[];
};

type Line = {
  itemId: string;
  queryText: string;
  offerId: string | null;
  offerName: string | null;
  price: number | null;
};

type Market = {
  supermarketId: string;
  supermarketName: string;
  coverage: number;
  complete: boolean;
  total: number;
  lines: Line[];
};

type Comparison = {
  itemCount: number;
  markets: Market[];
  bestSingle: Market | null;
  needsResolve?: boolean;
};

type Store = {
  id: string;
  name: string;
  isFavorite: boolean;
  supermarket: { name: string };
};

function ProductLines({ lines }: { lines: Line[] }) {
  return (
    <ul className="mt-3 space-y-1.5 border-t border-[var(--ds-color-border)] pt-3">
      {lines.map((line) => (
        <li
          key={line.itemId}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <span
            className={
              line.price === null
                ? "text-[var(--ds-color-muted-foreground)]"
                : undefined
            }
          >
            {line.offerName ?? line.queryText}
            {line.price === null ? " · sem oferta" : null}
          </span>
          <span className="shrink-0 tabular-nums">
            {line.price === null ? "—" : formatCurrency(line.price)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ListaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function reload() {
    const [listData, comparisonData, storesData] = await Promise.all([
      clientApi<ShoppingList>(`/lists/${id}`),
      clientApi<Comparison>(`/lists/${id}/comparison`),
      clientApi<{ stores: Store[] }>("/stores").catch(() => ({ stores: [] })),
    ]);
    setList(listData);
    setComparison(comparisonData);
    setStores(storesData.stores);
  }

  useEffect(() => {
    void reload().catch(() => {
      setList(null);
      setComparison({ itemCount: 0, markets: [], bestSingle: null });
    });
  }, [id]);

  async function duplicate() {
    setMenuOpen(false);
    setBusy(true);
    try {
      const copy = await clientApi<{ id: string }>(`/lists/${id}/duplicate`, {
        method: "POST",
      });
      router.push(`/lista/${copy.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await clientApi(`/lists/${id}`, { method: "DELETE" });
      router.push("/lista");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function toggleFavorite(store: Store) {
    const result = await clientApi<{ isFavorite: boolean }>(
      `/stores/${store.id}/favorite`,
      { method: "PUT" },
    );
    setStores(
      (current) =>
        current?.map((entry) =>
          entry.id === store.id
            ? { ...entry, isFavorite: result.isFavorite }
            : entry,
        ) ?? null,
    );
    const comparisonData = await clientApi<Comparison>(
      `/lists/${id}/comparison`,
    );
    setComparison(comparisonData);
  }

  if (!list || !comparison) {
    return (
      <AppShell title="Lista">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={list.name}
      subtitle="Itens escolhidos e análise por supermercado."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/lista"
            className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)]"
          >
            <ArrowLeft size={16} />
            Listas
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--ds-radius-md)] text-[var(--ds-color-foreground)]"
            aria-label="Opções da lista"
          >
            <DotsThreeVertical size={22} weight="bold" />
          </button>
        </div>
      }
    >
      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <section>
            <h2 className="ds-label-caps">Produtos</h2>
            {list.items.length === 0 ? (
              <EmptyState
                title="Lista vazia"
                body="Edite a lista para adicionar produtos."
              />
            ) : (
              <ListSurface className="mt-3">
                {list.items.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <p className="font-medium">{item.queryText}</p>
                  </li>
                ))}
              </ListSurface>
            )}
          </section>

          {stores && stores.some((store) => store.isFavorite) ? (
            <section>
              <h2 className="ds-label-caps">Mercados favoritos</h2>
              <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                Análise restrita a estes. Gerencie em{" "}
                <Link href="/mercados" className="underline">
                  Mercados
                </Link>
                .
              </p>
              <ul className="mt-3 space-y-2">
                {stores
                  .filter((store) => store.isFavorite)
                  .map((store) => (
                    <li key={store.id}>
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(store)}
                        className="flex w-full items-center justify-between gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-medium">
                            {store.supermarket.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                            {store.name === store.supermarket.name
                              ? "Rede"
                              : store.name}
                          </span>
                        </span>
                        <Star
                          size={18}
                          weight="fill"
                          className="text-[var(--ds-color-accent)]"
                        />
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>

        <section className="space-y-6">
          <h2 className="ds-label-caps">Análise de preços</h2>
          {comparison.itemCount === 0 ? (
            <EmptyState
              title="Sem itens"
              body="Adicione produtos para comparar mercados."
            />
          ) : comparison.markets.length === 0 ? (
            <EmptyState
              title="Sem ofertas compatíveis"
              body="Ainda não há ofertas validadas para estes produtos."
            />
          ) : (
            <>
              {comparison.bestSingle ? (
                <Panel accent className="p-6">
                  <p className="ds-label-caps inline-flex gap-2 text-[var(--ds-color-accent)]">
                    <Trophy size={15} weight="fill" />
                    Melhor opção
                  </p>
                  <p className="mt-3 text-2xl font-bold">
                    {comparison.bestSingle.supermarketName}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[var(--ds-color-success)]">
                    {formatCurrency(comparison.bestSingle.total)}
                  </p>
                  <ProductLines lines={comparison.bestSingle.lines ?? []} />
                </Panel>
              ) : (
                <Panel className="p-6">
                  Nenhum mercado cobre todos os itens desta lista.
                </Panel>
              )}
              <ListSurface>
                {comparison.markets.map((market) => (
                  <li key={market.supermarketId} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{market.supermarketName}</p>
                        <p className="text-xs text-[var(--ds-color-muted-foreground)]">
                          {market.coverage}/{comparison.itemCount} itens
                          {market.complete ? "" : " · incompleto"}
                        </p>
                      </div>
                      <strong className="tabular-nums">
                        {formatCurrency(market.total)}
                      </strong>
                    </div>
                    <ProductLines lines={market.lines ?? []} />
                  </li>
                ))}
              </ListSurface>
            </>
          )}
        </section>
      </div>

      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Opções"
      >
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-[var(--ds-radius-md)] px-3 py-3 text-left hover:bg-[var(--ds-color-muted)]/40"
            onClick={() => {
              setMenuOpen(false);
              router.push(`/lista/${id}/editar`);
            }}
          >
            <PencilSimple size={18} />
            Editar lista
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-[var(--ds-radius-md)] px-3 py-3 text-left hover:bg-[var(--ds-color-muted)]/40"
            onClick={() => void duplicate()}
          >
            <Copy size={18} />
            Duplicar lista
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-[var(--ds-radius-md)] px-3 py-3 text-left text-[var(--ds-color-danger)] hover:bg-[var(--ds-color-muted)]/40"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          >
            <Trash size={18} />
            Apagar lista
          </button>
        </div>
      </BottomSheet>

      <Modal
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        title="Apagar lista?"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Apagando…" : "Apagar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--ds-color-muted-foreground)]">
          A lista <strong className="text-[var(--ds-color-foreground)]">{list.name}</strong> e
          todos os itens serão removidos. Isso não pode ser desfeito.
        </p>
      </Modal>
    </AppShell>
  );
}
