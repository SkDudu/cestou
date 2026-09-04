"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader } from "@/components/admin/ops";
import { PACK_UNITS, formatCurrency, formatPack } from "@/lib/format";

type OfferFix = "brand" | "qty" | "unit";

const FIX_TITLE: Record<OfferFix, string> = {
  brand: "Corrigir marca ausente",
  qty: "Corrigir quantidade ausente",
  unit: "Normalizar unidade",
};

const FIX_ACTION: Record<OfferFix, string> = {
  brand: "Definir marca cadastrada",
  qty: "Definir quantidade",
  unit: "Normalizar unidade",
};

function isOfferFix(v: string | null): v is OfferFix {
  return v === "brand" || v === "qty" || v === "unit";
}

function CompareRow({
  label,
  status,
}: {
  label: string;
  status: "ok" | "fix" | "review";
}) {
  const text =
    status === "ok" ? "ok" : status === "fix" ? "corrigir" : "revisar";
  const className =
    status === "ok"
      ? "text-[var(--ds-color-success)]"
      : status === "fix"
        ? "text-[var(--ds-color-danger)]"
        : "text-[var(--ds-color-warning, #b45309)]";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[var(--ds-color-muted-foreground)]">{label}</span>
      <span className={`font-medium ${className}`}>{text}</span>
    </div>
  );
}

export default function HealthFixWorkbenchPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const offerId = params.id as Id<"offers">;
  const fixParam = search.get("fix");
  const fix: OfferFix = isOfferFix(fixParam) ? fixParam : "brand";

  const queue = useQuery(api.catalog.healthFixQueue, { fix });
  const ctx = useQuery(api.catalog.healthFixContext, { fix, offerId });
  const brands = useQuery(
    api.brands.list,
    fix === "brand" ? {} : "skip",
  );
  const apply = useMutation(api.catalog.applyOfferHealthFix);
  const createBrand = useMutation(api.brands.create);

  const [brandQuery, setBrandQuery] = useState("");
  const [brandId, setBrandId] = useState<Id<"brands"> | null | undefined>(
    undefined,
  );
  const [createdBrandName, setCreatedBrandName] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hydratedKey = useMemo(() => `${fix}:${offerId}`, [fix, offerId]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || ctx.offer._id !== offerId) return;
    if (loadedKey === hydratedKey) return;
    setLoadedKey(hydratedKey);
    setBrandId(undefined);
    setCreatedBrandName(null);
    setBrandQuery(ctx.offer.brand?.trim() || "");
    setQty(ctx.offer.quantity ?? "");
    setUnit(ctx.offer.unitNormalized ?? ctx.offer.unit ?? "");
    setReason("");
    setMsg(null);
  }, [ctx, offerId, hydratedKey, loadedKey]);

  const index = useMemo(() => {
    if (!queue) return -1;
    return queue.items.findIndex((i) => i._id === offerId);
  }, [queue, offerId]);

  const strip = useMemo(() => {
    if (!queue || index < 0) return [];
    const start = Math.max(0, index - 1);
    return queue.items.slice(start, start + 4);
  }, [queue, index]);

  function normBrand(s: string) {
    return s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
  }

  const brandOptions = brands ?? [];

  const filteredBrands = useMemo(() => {
    const q = normBrand(brandQuery);
    if (!q) return brandOptions.slice(0, 12);
    return brandOptions
      .filter((b) => normBrand(b.name).includes(q))
      .slice(0, 12);
  }, [brandOptions, brandQuery]);

  const exactBrand = useMemo(() => {
    const q = normBrand(brandQuery);
    if (!q) return null;
    return brandOptions.find((b) => normBrand(b.name) === q) ?? null;
  }, [brandOptions, brandQuery]);

  const suggestions = useMemo(() => {
    if (fix !== "brand" || !ctx) return [];
    const nameTokens = new Set(
      ctx.offer.name
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(" ")
        .filter((t) => t.length > 2),
    );
    return brandOptions
      .map((b) => {
        const tokens = normBrand(b.name).split(" ").filter(Boolean);
        const hit = tokens.filter((t) => nameTokens.has(t)).length;
        return { ...b, score: hit };
      })
      .filter((b) => b.score > 0)
      .sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, 5);
  }, [fix, ctx, brandOptions]);

  const canCreateBrand =
    fix === "brand" && brandQuery.trim().length > 0 && !exactBrand;

  const selectedBrandName =
    brandId === null
      ? "Sem marca aplicável"
      : brandId
        ? (createdBrandName ??
          brandOptions.find((b) => b._id === brandId)?.name ??
          null)
        : null;

  function goTo(id: Id<"offers">) {
    router.push(`/admin/catalog/health/fix/${id}?fix=${fix}`);
  }

  function goPrev() {
    if (!queue || index <= 0) return;
    goTo(queue.items[index - 1]!._id);
  }

  function goNext() {
    if (!queue || index < 0 || index >= queue.items.length - 1) return;
    goTo(queue.items[index + 1]!._id);
  }

  async function createAndSelectBrand() {
    const name = brandQuery.trim();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      if (exactBrand) {
        setBrandId(exactBrand._id);
        setCreatedBrandName(exactBrand.name);
        setBrandQuery(exactBrand.name);
        return;
      }
      const id = await createBrand({ name });
      setBrandId(id);
      setCreatedBrandName(name);
      setBrandQuery(name);
      setMsg(`Marca “${name}” criada`);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erro ao criar marca";
      const existing = brandOptions.find(
        (b) => normBrand(b.name) === normBrand(name),
      );
      if (existing) {
        setBrandId(existing._id);
        setCreatedBrandName(existing.name);
        setBrandQuery(existing.name);
        setMsg("Marca já existia — selecionada");
      } else {
        setMsg(err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function save(opts: { andNext: boolean; skip?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await apply({
        fix,
        offerId,
        skip: opts.skip,
        brandId: fix === "brand" ? (brandId ?? null) : undefined,
        quantity: fix === "qty" || fix === "unit" ? qty || null : undefined,
        unit: fix === "qty" || fix === "unit" ? unit || null : undefined,
        reason: reason || undefined,
      });
      if (opts.andNext) {
        if (result.nextId) {
          goTo(result.nextId);
        } else {
          router.push("/admin/catalog/health");
        }
      } else {
        setMsg(opts.skip ? "Pulado" : "Salvo");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (ctx === undefined || queue === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!ctx) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">
        Oferta não encontrada.{" "}
        <Link href="/admin/catalog/health" className="underline">
          Voltar à fila
        </Link>
      </p>
    );
  }

  const { offer, canonical, metrics, compare } = ctx;

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/catalog/health" className="hover:underline">
              Catálogo
            </Link>
            {" / "}
            <Link href="/admin/catalog/health" className="hover:underline">
              Saúde
            </Link>
            {" / Fila de correção"}
          </>
        }
        title={FIX_TITLE[fix]}
        stamp={`${queue.pendingCount} pendentes`}
        primary={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/catalog/health"
              className="ds-btn ds-btn--outline"
            >
              Voltar à fila
            </Link>
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              disabled={busy || (fix === "brand" && brandId === undefined)}
              onClick={() => void save({ andNext: true })}
            >
              Salvar e próxima
            </button>
          </div>
        }
      />

      <section className="mb-4 overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--ds-color-border)] px-4 py-2">
          <p className="text-[12px] font-medium text-[var(--ds-color-muted-foreground)]">
            Mini-fila · {ctx.reason}
            {index >= 0 ? ` · ${index + 1}/${queue.pendingCount}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ds-btn ds-btn--ghost"
              disabled={index <= 0}
              onClick={goPrev}
            >
              Anterior
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--ghost"
              disabled={index < 0 || index >= queue.pendingCount - 1}
              onClick={goNext}
            >
              Próxima
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 py-3">
          {strip.map((item) => {
            const current = item._id === offerId;
            return (
              <button
                key={item._id}
                type="button"
                onClick={() => goTo(item._id)}
                className={`min-w-[180px] max-w-[220px] shrink-0 rounded-lg border px-3 py-2 text-left ${
                  current
                    ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                    : "border-[var(--ds-color-border)] hover:bg-[var(--ds-color-muted)]"
                }`}
              >
                <p className="truncate text-[13px] font-medium">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--ds-color-muted-foreground)]">
                  {item.reason} · {formatCurrency(item.price)}
                </p>
              </button>
            );
          })}
          {!strip.length ? (
            <p className="px-1 py-2 text-sm text-[var(--ds-color-muted-foreground)]">
              Item fora da fila atual (já corrigido ou filtro diferente).
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Evidência */}
        <section className="ds-card space-y-3 p-4">
          <h2 className="text-[15px] font-semibold">Evidência da oferta</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="ds-label-caps">Nome</dt>
              <dd className="font-medium">{offer.name}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="ds-label-caps">Preço</dt>
                <dd className="font-mono">{formatCurrency(offer.price)}</dd>
              </div>
              <div>
                <dt className="ds-label-caps">Qtd</dt>
                <dd>{formatPack(offer.quantity, offer.unit) ?? "—"}</dd>
              </div>
            </div>
            <div>
              <dt className="ds-label-caps">Supermercado</dt>
              <dd>{offer.supermarketName}</dd>
            </div>
            <div>
              <dt className="ds-label-caps">Página</dt>
              <dd>
                {offer.pageNumber ?? "—"}
                {offer.flyerId ? (
                  <>
                    {" · "}
                    <Link
                      href={`/admin/flyers/${offer.flyerId}`}
                      className="hover:underline"
                    >
                      {offer.flyerTitle ?? "encarte"}
                    </Link>
                  </>
                ) : null}
              </dd>
            </div>
          </dl>
          {offer.pageUrl ? (
            <a href={offer.pageUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={offer.pageUrl}
                alt="Página do encarte"
                className="max-h-[280px] w-full rounded-lg border border-[var(--ds-color-border)] object-contain"
              />
            </a>
          ) : (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Sem preview de página.
            </p>
          )}
          {offer.rawText ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--ds-color-muted-foreground)]">
                Raw text
              </summary>
              <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[12px] text-[var(--ds-color-muted-foreground)]">
                {offer.rawText}
              </p>
            </details>
          ) : null}
        </section>

        {/* Canônico */}
        <section className="ds-card space-y-3 p-4">
          <h2 className="text-[15px] font-semibold">Produto canônico</h2>
          {canonical ? (
            <>
              <div>
                <p className="text-[18px] font-semibold leading-6">
                  {canonical.canonicalName}
                </p>
                <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
                  {formatPack(canonical.quantity, canonical.unit) ?? "—"}
                  {" · "}
                  {canonical.brandName ?? "Sem marca"}
                </p>
                <p className="mt-2">
                  <span className="ds-pill ds-pill--fail">{ctx.reason}</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                    Mercados
                  </p>
                  <p className="font-semibold">{metrics.activeMarkets}</p>
                </div>
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                    Preço
                  </p>
                  <p className="font-mono text-[13px] font-semibold">
                    {metrics.minPrice != null
                      ? formatCurrency(metrics.minPrice)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                    Ofertas
                  </p>
                  <p className="font-semibold">{metrics.offerCount}</p>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-[var(--ds-color-border)] pt-3">
                <p className="ds-label-caps mb-1">Oferta vs canônico</p>
                <CompareRow label="Nome" status={compare.name} />
                <CompareRow label="Unidade" status={compare.unit} />
                <CompareRow label="Marca" status={compare.brand} />
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Sem produto canônico vinculado. A correção vale na oferta; o match
              pode ser refeito depois.
            </p>
          )}
        </section>

        {/* Resolução */}
        <section className="ds-card space-y-4 p-4">
          <h2 className="text-[15px] font-semibold">{FIX_ACTION[fix]}</h2>

          {fix === "brand" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="ds-label-caps">Buscar ou criar marca</span>
                <input
                  value={brandQuery}
                  onChange={(e) => {
                    setBrandQuery(e.target.value);
                    setBrandId(undefined);
                    setCreatedBrandName(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreateBrand) {
                      e.preventDefault();
                      void createAndSelectBrand();
                    }
                  }}
                  placeholder="Digite o nome da marca…"
                  className="ds-search mt-1 w-full"
                />
              </label>
              {selectedBrandName ? (
                <p className="text-sm">
                  Selecionado:{" "}
                  <span className="font-medium">{selectedBrandName}</span>
                </p>
              ) : null}
              {canCreateBrand ? (
                <button
                  type="button"
                  className="ds-btn ds-btn--outline w-full"
                  disabled={busy}
                  onClick={() => void createAndSelectBrand()}
                >
                  Criar marca “{brandQuery.trim()}”
                </button>
              ) : null}
              {suggestions.length ? (
                <div>
                  <p className="ds-label-caps mb-1.5">Sugestões</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        className={`rounded-md border px-2.5 py-1 text-[12px] ${
                          brandId === s._id
                            ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                            : "border-[var(--ds-color-border)]"
                        }`}
                        onClick={() => {
                          setBrandId(s._id);
                          setCreatedBrandName(s.name);
                          setBrandQuery(s.name);
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <ul className="max-h-[200px] overflow-y-auto rounded-lg border border-[var(--ds-color-border)]">
                {filteredBrands.map((b) => (
                  <li key={b._id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--ds-color-muted)] ${
                        brandId === b._id ? "bg-[var(--ds-color-muted)]" : ""
                      }`}
                      onClick={() => {
                        setBrandId(b._id);
                        setCreatedBrandName(b.name);
                        setBrandQuery(b.name);
                      }}
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
                {!filteredBrands.length ? (
                  <li className="px-3 py-3 text-sm text-[var(--ds-color-muted-foreground)]">
                    Nenhuma marca cadastrada com esse nome.
                    {canCreateBrand
                      ? " Use o botão acima para criar."
                      : null}
                  </li>
                ) : null}
              </ul>
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  brandId === null
                    ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                    : "border-[var(--ds-color-border)]"
                }`}
                onClick={() => {
                  setBrandId(null);
                  setCreatedBrandName(null);
                  setBrandQuery("");
                }}
              >
                Sem marca aplicável
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="ds-label-caps">Quantidade</span>
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Ex.: 1, 500, 2"
                  className="ds-search mt-1 w-full"
                />
              </label>
              <label className="block text-sm">
                <span className="ds-label-caps">Unidade</span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="ds-search mt-1 w-full"
                >
                  <option value="">Selecionar…</option>
                  {PACK_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block text-sm">
            <span className="ds-label-caps">Motivo da auditoria</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Opcional"
              className="ds-search mt-1 w-full"
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="ds-btn ds-btn--primary w-full"
              disabled={busy || (fix === "brand" && brandId === undefined)}
              onClick={() => void save({ andNext: true })}
            >
              Salvar e próxima
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--outline w-full"
              disabled={busy || (fix === "brand" && brandId === undefined)}
              onClick={() => void save({ andNext: false })}
            >
              Salvar
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--ghost w-full"
              disabled={busy}
              onClick={() => void save({ andNext: true, skip: true })}
            >
              Não foi possível determinar
            </button>
          </div>
          {msg ? (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">{msg}</p>
          ) : null}
        </section>
      </div>

      <details className="mt-4 rounded-[14px] border border-[var(--ds-color-border)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--ds-color-muted-foreground)]">
          Ações secundárias
        </summary>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {offer.canonicalProductId ? (
            <Link
              href={`/admin/products/${offer.canonicalProductId}`}
              className="hover:underline"
            >
              Abrir hub completo
            </Link>
          ) : null}
          <Link href={`/admin/offers/${offer._id}`} className="hover:underline">
            Editar condição do preço
          </Link>
          <Link href={`/admin/offers/${offer._id}`} className="hover:underline">
            Ver oferta completa / raw
          </Link>
        </div>
      </details>
    </div>
  );
}
