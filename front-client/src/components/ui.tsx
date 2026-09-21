"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { useEffect } from "react";
import { X } from "@phosphor-icons/react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const styles =
    variant === "primary"
      ? "ds-btn ds-btn--primary"
      : variant === "danger"
        ? "ds-btn ds-btn--danger"
        : variant === "outline"
          ? "ds-btn ds-btn--outline"
          : "ds-btn ds-btn--ghost";
  return <button className={`${styles} ${className}`.trim()} {...props} />;
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ds-input ${className}`.trim()} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`ds-select ${className}`.trim()} {...props}>
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
    <label className="block">
      <span className="ds-field-label">{label}</span>
      {children}
      {hint ? <span className="ds-field-hint">{hint}</span> : null}
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
      className={`ds-card ${accent ? "border-[var(--ds-color-primary)]" : ""} ${className}`.trim()}
      style={
        accent
          ? {
              borderLeftWidth: "var(--ds-accent-width)",
              borderLeftColor: "var(--ds-color-focus)",
            }
          : undefined
      }
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
    <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-6 py-12 text-center">
      <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--ds-color-foreground)]">
        {title}
      </p>
      <p className="ds-meta mx-auto mt-2 max-w-[48ch] font-normal leading-relaxed">
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
    <span className={`font-mono tabular-nums tracking-[-0.02em] ${className}`}>
      {new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value)}
    </span>
  );
}

export function ListSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={`divide-y divide-[var(--ds-color-border)] overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] ${className}`.trim()}
    >
      {children}
    </ul>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ds-modal-overlay" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ds-modal relative z-10"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            className="ds-modal-x"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ds-color-scrim)]"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[var(--ds-radius-xl)] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] shadow-lg"
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[var(--ds-color-border)]" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            className="ds-modal-x"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ds-color-border)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>
  );
}
