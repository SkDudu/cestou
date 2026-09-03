"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button, Field, Input } from "@/components/ui";

export function AuthForm({
  flow,
}: {
  flow: "signIn" | "signUp";
}) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = flow === "signUp";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex flex-col justify-center border-b border-[var(--line)] px-8 py-14 lg:border-b-0 lg:border-r lg:px-16">
        <p className="font-mono text-[11px] font-bold tracking-[0.28em] text-[var(--amber)]">
          CESTOU
        </p>
        <h1 className="mt-6 max-w-[16ch] text-4xl font-semibold tracking-tighter md:text-5xl">
          {isSignUp ? "Crie sua conta" : "Entrar"}
        </h1>
        <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[var(--muted)]">
          Compare ofertas validadas dos supermercados perto de você.
        </p>
      </section>
      <section className="flex items-center px-8 py-14 lg:px-16">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-5">
          <Field label="E-mail">
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha" hint={isSignUp ? "Mínimo 8 caracteres" : undefined}>
            <Input
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? <p className="text-sm text-[var(--alert)]">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde…" : isSignUp ? "Cadastrar" : "Entrar"}
            {!busy ? <ArrowRight size={16} weight="bold" aria-hidden /> : null}
          </Button>
          <p className="text-sm text-[var(--muted)]">
            {isSignUp ? (
              <>
                Já tem conta?{" "}
                <Link href="/entrar" className="text-[var(--amber)]">
                  Entrar
                </Link>
              </>
            ) : (
              <>
                Novo por aqui?{" "}
                <Link href="/cadastro" className="text-[var(--amber)]">
                  Criar conta
                </Link>
              </>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
