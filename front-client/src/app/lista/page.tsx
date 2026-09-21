"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Plus, Trash } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, ListSurface, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type ListSummary = {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
  needsResolve: boolean;
  bestSingle: {
    supermarketName: string;
    total: number;
    coverage: number;
  } | null;
};

export default function ListasPage() {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    clientApi<ListSummary[]>("/lists")
      .then(setLists)
      .catch(() => setLists([]));

  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Apagar esta lista?")) return;
    setBusyId(id);
    await clientApi(`/lists/${id}`, { method: "DELETE" }).catch(() => undefined);
    await load();
    setBusyId(null);
  }

  async function duplicate(id: string) {
    setBusyId(id);
    await clientApi(`/lists/${id}/duplicate`, { method: "POST" }).catch(
      () => undefined,
    );
    await load();
    setBusyId(null);
  }

  return (
    <AppShell
      title="Listas de compras"
      subtitle="Crie listas com produtos escolhidos e compare preços nos mercados."
      actions={
        <Link href="/lista/nova">
          <Button>
            <Plus size={16} />
            Nova lista
          </Button>
        </Link>
      }
    >
      {!lists ? (
        <Skeleton className="h-64 w-full" />
      ) : lists.length === 0 ? (
        <EmptyState
          title="Nenhuma lista ainda"
          body="Crie a primeira lista, escolha os produtos e acompanhe a melhor compra."
        />
      ) : (
        <ListSurface>
          {lists.map((list) => (
            <li key={list.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/lista/${list.id}`} className="min-w-0 flex-1">
                  <p className="font-medium">{list.name}</p>
                  <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                    {list.itemCount}{" "}
                    {list.itemCount === 1 ? "produto" : "produtos"}
                    {list.bestSingle
                      ? ` · melhor: ${list.bestSingle.supermarketName} · ${formatCurrency(list.bestSingle.total)}`
                      : list.needsResolve
                        ? " · falta escolher produtos"
                        : " · sem cobertura completa"}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === list.id}
                    onClick={() => void duplicate(list.id)}
                    className="text-[var(--ds-color-muted-foreground)]"
                    aria-label="Duplicar lista"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === list.id}
                    onClick={() => void remove(list.id)}
                    className="text-[var(--ds-color-danger)]"
                    aria-label="Apagar lista"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ListSurface>
      )}
    </AppShell>
  );
}
