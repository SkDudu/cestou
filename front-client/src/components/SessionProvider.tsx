"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, clientAuth, type ClientSession } from "@/lib/api";

type SessionContextValue = {
  session: ClientSession | null;
  loading: boolean;
  refresh: () => Promise<ClientSession | null>;
  clear: () => void;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  refresh: async () => null,
  clear: () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await clientAuth.me();
      setSession(next);
      return next;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error(error);
      }
      setSession(null);
      return null;
    }
  }, []);

  const clear = useCallback(() => setSession(null), []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, clear }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
