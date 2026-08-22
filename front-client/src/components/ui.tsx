import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[var(--amber)] text-[var(--on-accent)] hover:bg-[var(--amber-dim)]"
      : variant === "danger"
        ? "border border-[var(--alert)]/40 text-[var(--alert)] hover:bg-[var(--alert)]/10"
        : "border border-[var(--line)] text-[var(--fg)] hover:border-[var(--amber)]/50 hover:bg-[var(--bg-elev)]";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border border-[var(--line)] bg-[var(--bg-elev)] px-3 py-3 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--muted)] focus:border-[var(--amber)] ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full border border-[var(--line)] bg-[var(--bg-elev)] px-3 py-3 text-sm outline-none transition-colors duration-200 focus:border-[var(--amber)] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function Panel({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border bg-[var(--bg-elev)] ${
        accent ? "border-[var(--amber)]/50" : "border-[var(--line)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--line)] bg-[var(--bg-elev)]/40 px-6 py-12 text-center">
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-relaxed text-[var(--muted)]">
        {body}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Money({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value)}
    </span>
  );
}
