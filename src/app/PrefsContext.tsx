import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type MessageKey } from '../i18n/i18n';
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from '../theme/prefs';

type Ctx = {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => set((p) => ({ ...p, ...patch })), []);
  const t = useCallback((key: MessageKey, vars?: Record<string, string>) => translate(prefs.lang, key, vars), [prefs.lang]);
  const value = useMemo(() => ({ prefs, setPrefs, t }), [prefs, setPrefs, t]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
