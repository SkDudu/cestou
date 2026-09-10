"use client";
import { createContext,useContext,useEffect,useState } from "react";
type Session={id:string;email:string}|null;
const SessionContext=createContext<{session:Session;loading:boolean}>({session:null,loading:true});
export function SessionProvider({children}:{children:React.ReactNode}){const[session,setSession]=useState<Session>(null);const[loading,setLoading]=useState(true);useEffect(()=>{void fetch("/api/v1/client/auth/me",{credentials:"include"}).then(r=>r.ok?r.json():null).then(setSession).finally(()=>setLoading(false))},[]);return <SessionContext.Provider value={{session,loading}}>{children}</SessionContext.Provider>}
export const useSession=()=>useContext(SessionContext);
