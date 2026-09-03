"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { ProductPriceChart } from "@/components/admin/ProductPriceChart";
import {
  formatCurrency,
  formatDateTime,
  formatPack,
  formatRange,
} from "@/lib/format";

export default function ProductHubPage() {
  const params = useParams();
  const id = params.id as Id<"canonicalProducts">;
  const data = useQuery(api.catalog.getProductPriceBoard, { canonicalId: id });
  const setBrand = useMutation(api.catalog.setCanonicalBrand);
  const unlink = useMutation(api.catalog.unlinkOffer);
  const merge = useMutation(api.catalog.mergeCanonical);

  const [brandDraft, setBrandDraft] = useState<string>("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const candidates = useQuery(
    api.catalog.listProducts,
    data?.product
      ? {
          brandId: data.product.brandId,
          search: data.product.canonicalName.split(" ")[0],
          limit: 30,
        }
      : "skip",
  );

  const mergeOptions = useMemo(
    () => (candidates ?? []).filter((p) => p._id !== id),
    [candidates, id],
  );

  const historyByMarket = useMemo(() => {
    const history = data?.history ?? [];
    const map = new Map<string, typeof history>();
    for (const row of history) {
      const key = row.supermarketName;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [data?.history]);

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">
        Produto não encontrado
      </p>
    );
  }

  const { product, board, offers, brandOptions } = data;
  const activeBoard = board.filter((b) => b.active);
  const min = activeBoard.length
    ? Math.min(...activeBoard.map((b) => b.price))
    : null;
  const max = activeBoard.length
    ? Math.max(...activeBoard.map((b) => b.price))
    : null;

  async function saveBrand() {
    setBusy(true);
    setMsg(null);
    try {
      await setBrand({
        canonicalId: id,
        brandId: brandDraft ? (brandDraft as Id<"brands">) : null,
      });
      setMsg("Marca atualizada");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function doMerge() {
    if (!mergeTarget) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await merge({
        sourceId: id,
        targetId: mergeTarget as Id<"canonicalProducts">,
      });
      setMsg(
        `Merge ok: ${r.offersReassigned} ofertas, ${r.pricesReassigned} preços → destino`,
      );
      window.location.href = `/admin/products/${mergeTarget}`;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
      setBusy(false);
    }
  }

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/products" className="hover:underline">
              Produtos
            </Link>
            {" / hub"}
          </>
        }
        title={product.canonicalName}
        subtitle={[
          product.brand?.name,
          formatPack(product.quantity, product.unit),
          product.matchKey,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Mercados vigentes"
          value={activeBoard.length}
          foot={`${board.length} no histórico`}
        />
        <OpsKpi
          label="Preço min"
          value={min != null ? formatCurrency(min) : "—"}
          foot={max != null ? `max ${formatCurrency(max)}` : undefined}
        />
        <OpsKpi
          label="Ofertas ligadas"
          value={offers.length}
          foot="antes/depois da normalização"
        />
      </section>

      <section className="ds-table-card mb-6">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Preço vigente por rede</h2>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Supermercado</span>
          <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
          <span className="ds-label-caps w-[88px] shrink-0">Clube</span>
          <span className="ds-label-caps w-[64px] shrink-0">Desc.</span>
          <span className="ds-label-caps w-[120px] shrink-0">Validade</span>
          <span className="ds-label-caps w-[64px] shrink-0">Status</span>
        </div>
        {board.map((row) => (
          <div key={row.supermarketId} className="ds-table-row">
            <span className="min-w-0 flex-[2] truncate font-medium">
              {row.supermarketName}
              {row.offerId ? (
                <Link
                  href={`/admin/offers/${row.offerId}`}
                  className="ml-2 text-[12px] font-normal text-[var(--ds-color-muted-foreground)] hover:underline"
                >
                  oferta
                </Link>
              ) : null}
            </span>
            <span className="w-[88px] shrink-0 font-mono">
              {formatCurrency(row.price)}
            </span>
            <span className="w-[88px] shrink-0 font-mono text-[12px]">
              {row.memberPrice != null
                ? formatCurrency(row.memberPrice)
                : row.requiresMembership
                  ? "sim"
                  : "—"}
            </span>
            <span className="w-[64px] shrink-0 font-mono text-[12px]">
              {row.discountPercentage != null
                ? `${row.discountPercentage}%`
                : "—"}
            </span>
            <span className="w-[120px] shrink-0 text-[12px]">
              {formatRange(row.validFrom, row.validUntil)}
            </span>
            <span className="w-[64px] shrink-0">
              <span
                className={
                  row.active ? "ds-pill ds-pill--review" : "ds-pill ds-pill--fail"
                }
              >
                {row.active ? "vigente" : "expirado"}
              </span>
            </span>
          </div>
        ))}
        {!board.length ? (
          <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
            Sem histórico de preços.
          </p>
        ) : null}
      </section>

      <section className="mb-6">
        <ProductPriceChart data={data.series30d} />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="ds-card p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Histórico por rede</h2>
          <div className="max-h-[360px] space-y-4 overflow-y-auto">
            {historyByMarket.map(([name, rows]) => (
              <div key={name}>
                <p className="mb-1 text-[12px] font-medium text-[var(--ds-color-muted-foreground)]">
                  {name}
                </p>
                <ul className="space-y-1">
                  {rows.slice(0, 12).map((r) => (
                    <li
                      key={r._id}
                      className="flex justify-between gap-2 font-mono text-[12px]"
                    >
                      <span>{formatCurrency(r.price)}</span>
                      <span className="text-[var(--ds-color-muted-foreground)]">
                        {formatDateTime(r.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!historyByMarket.length ? (
              <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                Sem série temporal.
              </p>
            ) : null}
          </div>
        </div>

        <div className="ds-card space-y-4 p-4">
          <h2 className="text-[15px] font-semibold">Ações</h2>
          <div>
            <label className="ds-label-caps mb-1 block">Trocar marca</label>
            <div className="flex gap-2">
              <select
                className="ds-search flex-1"
                value={brandDraft || product.brandId || ""}
                onChange={(e) => setBrandDraft(e.target.value)}
              >
                <option value="">Sem marca</option>
                {brandOptions.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy}
                onClick={saveBrand}
              >
                Salvar
              </button>
            </div>
          </div>
          <div>
            <label className="ds-label-caps mb-1 block">
              Merge neste destino (apaga este canônico)
            </label>
            <div className="flex gap-2">
              <select
                className="ds-search flex-1"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
              >
                <option value="">Selecionar destino…</option>
                {mergeOptions.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.canonicalName}
                    {p.brandName ? ` · ${p.brandName}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy || !mergeTarget}
                onClick={doMerge}
              >
                Merge
              </button>
            </div>
          </div>
          <p className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
            slug: {product.slug}
          </p>
          {msg ? (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">{msg}</p>
          ) : null}
        </div>
      </section>

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Ofertas vinculadas</h2>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Nome fonte</span>
          <span className="ds-label-caps w-[140px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
          <span className="ds-label-caps w-[88px] shrink-0">Status</span>
          <span className="ds-label-caps w-[88px] shrink-0">Ação</span>
        </div>
        {offers.map((o) => (
          <div key={o._id} className="ds-table-row">
            <Link
              href={`/admin/offers/${o._id}`}
              className="min-w-0 flex-[2] truncate font-medium hover:underline"
            >
              {o.name}
            </Link>
            <span className="w-[140px] shrink-0 truncate">{o.supermarketName}</span>
            <span className="w-[88px] shrink-0 font-mono">
              {formatCurrency(o.price)}
            </span>
            <span className="w-[88px] shrink-0 text-[12px]">
              {o.validationStatus}
            </span>
            <span className="w-[88px] shrink-0">
              <button
                type="button"
                className="text-[12px] text-[var(--ds-color-danger)] hover:underline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await unlink({ offerId: o._id });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Desvincular
              </button>
            </span>
          </div>
        ))}
        {!offers.length ? (
          <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma oferta ligada.
          </p>
        ) : null}
      </section>
    </div>
  );
}
