"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, adminApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await adminApi.login(email, password);
      router.replace("/admin");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401 ? "E-mail ou senha inválidos." : "Não foi possível entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100"><form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"><div><p className="text-sm font-medium text-emerald-400">Cestou Ops</p><h1 className="mt-1 text-2xl font-semibold">Acesso administrativo</h1></div><label className="block text-sm">E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" /></label><label className="block text-sm">Senha<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-red-400">{error}</p>}<button disabled={submitting} className="w-full rounded-md bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-60">{submitting ? "Entrando…" : "Entrar"}</button></form></main>;
}
