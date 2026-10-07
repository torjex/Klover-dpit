import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, readApiKey, SESSION_EXPIRED, writeApiKey } from "../api/client";

interface AuthValue {
  signedIn: boolean;
  ready: boolean;
  signIn: (password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => !!readApiKey());
  const [ready] = useState(true);

  useEffect(() => {
    const onExpired = () => {
      writeApiKey(null);
      setSignedIn(false);
    };
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  const signIn = useCallback(async (password: string) => {
    const result = await api.login(password);
    writeApiKey(result.apiKey);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(() => {
    writeApiKey(null);
    setSignedIn(false);
  }, []);

  const value = useMemo(() => ({ signedIn, ready, signIn, signOut }), [signedIn, ready, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
