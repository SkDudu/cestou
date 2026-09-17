"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { ProductPriceChart } from "@/components/admin/ProductPriceChart";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { formatCurrency, formatDateTime, formatPack, formatRange } from "@/lib/format";
import { DAY_MS, ms } from "@/lib/workers";

type Product = Awaited<ReturnType<typeof adminApi.product>>;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function series30d(history: Product["priceHistory"], days = 30) {
  const now = Date.now();
  const start = now - days * DAY_MS;
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const marketsMap = new Map<string, { key: string; name: string }>();
  const latest = new Map<string, number>();
  for (const row of history) {
    const t = ms(row.createdAt) ?? 0;
    if (t < start) continue;
    const key = row.supermarket.name;
    marketsMap.set(key, { key, name: key });
    const stamp = `${dayStart(t)}|${key}`;
    if (!latest.has(stamp)) latest.set(stamp, money(row.price) ?? 0);
  }
  const markets = [...marketsMap.values()].map((m, i) => ({
    ...m,
    color: CHART_COLORS[i % CHART_COLORS.length]!,
  }));
  const points: Array<Record<string, number>> = [];
  for (let i = 0; i < days; i++) {
    const day = dayStart(start + i * DAY_MS);
    const point: Record<string, number> = { date: day };
    for (const m of markets) {
      const v = latest.get(`${day}|${m.key}`);
      if (v != null) point[m.key] = v;
    }
    points.push(point);
  }
  return { days, markets, points };
}

export default function ProductHubPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void adminApi.product(id).then(
      (row) => alive && setProduct(row),
      (cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setProduct(null);
          setError("Produto não encontrado");
          return;
        }
        setProduct(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar o produto.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const board = useMemo(() => {
    if (!product) return [];
    const now = Date.now();
    const seen = new Set<string>();
    const rows = [];
    for (const o of product.offers) {
      if (seen.has(o.supermarket.name)) continue;
      seen.add(o.supermarket.name);
      const until = ms(o.validUntil);
      rows.push({
        supermarketName: o.supermarket.name,
        offerId: o.id,
        price: money(o.price) ?? 0,
        memberPrice: money(o.memberPrice),
        requiresMembership: Boolean(o.requiresMembership),
        discountPercentage: money(o.discountPercentage),
        validFrom: ms(o.validFrom),
        validUntil: until,
        active:
          o.validationStatus.toUpperCase() !== "REJECTED" &&
          (until == null || until >= now),
      });
    }
    return rows;
  }, [product]);

  const historyByMarket = useMemo(() => {
    const history = product?.priceHistory ?? [];
    const map = new Map<string, typeof history>();
    for (const row of history) {
      const list = map.get(row.supermarket.name) ?? [];
      list.push(row);
      map.set(row.supermarket.name, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [product]);

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!product) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const activeBoard = board.filter((b) => b.active);
  const min = activeBoard.length ? Math.min(...activeBoard.map((b) => b.price)) : null;
  const max = activeBoard.length ? Math.max(...activeBoard.map((b) => b.price)) : null;
  const chart = series30d(product.priceHistory);

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
          product.category,
          product.brand?.name,
          formatPack(product.quantity, product.unit),
          product.matchKey,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Categoria"
          value={product.category ?? "—"}
          foot={product.brand?.name ? `marca ${product.brand.name}` : "sem marca"}
        />
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
          value={product.offers.length}
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
          <div key={row.supermarketName} className="ds-table-row">
            <span className="min-w-0 flex-[2] truncate font-medium">
              {row.supermarketName}
              <Link
                href={`/admin/offers/${row.offerId}`}
                className="ml-2 text-[12px] font-normal text-[var(--ds-color-muted-foreground)] hover:underline"
              >
                oferta
              </Link>
            </span>
            <span className="w-[88px] shrink-0 font-mono">{formatCurrency(row.price)}</span>
            <span className="w-[88px] shrink-0 font-mono text-[12px]">
              {row.memberPrice != null
                ? formatCurrency(row.memberPrice)
                : row.requiresMembership
                  ? "sim"
                  : "—"}
            </span>
            <span className="w-[64px] shrink-0 font-mono text-[12px]">
              {row.discountPercentage != null ? `${row.discountPercentage}%` : "—"}
            </span>
            <span className="w-[120px] shrink-0 text-[12px]">
              {formatRange(row.validFrom, row.validUntil)}
            </span>
            <span className="w-[64px] shrink-0">
              <span className={row.active ? "ds-pill ds-pill--review" : "ds-pill ds-pill--fail"}>
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
        <ProductPriceChart data={chart} />
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
                    <li key={r.id} className="flex justify-between gap-2 font-mono text-[12px]">
                      <span>{formatCurrency(money(r.price) ?? 0)}</span>
                      <span className="text-[var(--ds-color-muted-foreground)]">
                        {formatDateTime(ms(r.createdAt))}
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
          <h2 className="text-[15px] font-semibold">Canônico</h2>
          <p className="text-sm">
            Marca: {product.brand?.name ?? "Sem marca"}
          </p>
          <p className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
            slug: {product.slug}
          </p>
          <p className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
            match: {product.matchKey}
          </p>
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
        </div>
        {product.offers.map((o) => (
          <div key={o.id} className="ds-table-row">
            <Link
              href={`/admin/offers/${o.id}`}
              className="min-w-0 flex-[2] truncate font-medium hover:underline"
            >
              {o.name}
            </Link>
            <span className="w-[140px] shrink-0 truncate">{o.supermarket.name}</span>
            <span className="w-[88px] shrink-0 font-mono">
              {formatCurrency(money(o.price) ?? 0)}
            </span>
            <span className="w-[88px] shrink-0">
              <StatusBadge status={o.validationStatus.toLowerCase()} />
            </span>
          </div>
        ))}
        {!product.offers.length ? (
          <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma oferta ligada.
          </p>
        ) : null}
      </section>
    </div>
  );
}
