"use client";
import { useSession } from "./SessionProvider";
export function AuthGate({children}:{children:React.ReactNode}){const{loading}=useSession();return loading?<p>Carregando…</p>:<>{children}</>}
