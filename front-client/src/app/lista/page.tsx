"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Plus, Scales, Trash } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/SessionProvider";
import {
  Button,
  EmptyState,
  Input,
  Money,
  Skeleton,
} from "@/components/ui";

export default function ListaPage() {
  const { userId, ready } = useSession();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    userId ? { userId } : "skip",
  );
  const ensureList = useMutation(api.clientLists.getOrCreateDefaultList);
  const addItem = useMutation(api.clientLists.addListItem);
  const removeItem = useMutation(api.clientLists.removeListItem);
  const [listId, setListId] = useState<Id<"shoppingLists"> | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!userId || listId) return;
    void ensureList({ userId }).then(setListId);
  }, [userId, listId, ensureList]);

  const list = useQuery(
    api.clientLists.getShoppingList,
    userId && listId ? { userId, listId } : "skip",
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!userId || !listId || !draft.trim()) return;
    await addItem({ userId, listId, queryText: draft.trim() });
    setDraft("");
  }

  const locLabel = location ? `${location.city} — ${location.state}` : null;

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <AppShell
      locationLabel={locLabel}
      title={list?.name ?? "Minha lista"}
      subtitle="Adicione itens e compare o custo total nos mercados da região."
      actions={
        listId ? (
          <Link href={`/lista/comparar?listId=${listId}`}>
            <Button type="button">
              <Scales size={16} weight="bold" aria-hidden />
              Comparar preços
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={onAdd} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Novo item
          </p>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ex.: leite 1L"
            aria-label="Item da lista"
          />
          <Button type="submit" className="w-full sm:w-auto">
            <Plus size={16} weight="bold" aria-hidden />
            Adicionar
          </Button>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Sem oferta fixada, a comparação faz match por texto nas ofertas
            validadas.
          </p>
        </form>

        <div>
          {!list ? (
            <Skeleton className="h-64 w-full" />
          ) : list.items.length === 0 ? (
            <EmptyState
              title="Lista vazia"
              body="Busque ofertas ou digite um item ao lado para começar a comparar."
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
              {list.items.map((item) => (
                <li
                  key={item._id}
                  className="flex items-start justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium tracking-tight">
                      {item.queryText}
                    </p>
                    {item.offer ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {item.offer.name} · {item.offer.supermarketName} ·{" "}
                        <Money value={item.offer.price} />
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Sem oferta fixada — match na comparação
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      userId && void removeItem({ userId, itemId: item._id })
                    }
                    className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--alert)] transition-opacity hover:opacity-80 active:scale-[0.98]"
                    aria-label={`Remover ${item.queryText}`}
                  >
                    <Trash size={14} aria-hidden />
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
