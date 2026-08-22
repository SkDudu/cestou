"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

const STORAGE_KEY = "cestou_session_token";

type SessionCtx = {
  userId: Id<"users"> | null;
  ready: boolean;
};

const Ctx = createContext<SessionCtx>({ userId: null, ready: false });

function getOrCreateToken() {
  if (typeof window === "undefined") return null;
  let token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, token);
  }
  return token;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const ensure = useMutation(api.clientAuth.ensureSession);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [ready, setReady] = useState(false);

  const boot = useCallback(async () => {
    const token = getOrCreateToken();
    if (!token) return;
    try {
      const id = await ensure({ sessionToken: token });
      setUserId(id);
    } catch (e) {
      console.error("ensureSession failed", e);
    } finally {
      setReady(true);
    }
  }, [ensure]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const value = useMemo(() => ({ userId, ready }), [userId, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
