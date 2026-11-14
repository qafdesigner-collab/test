'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Toast = { id: number; msg: string; kind: 'ok' | 'err' };
const Ctx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'err' ? 6000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map((t) => (
          <div key={t.id} role="status" className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg text-white ${t.kind === 'ok' ? 'bg-slate-900' : 'bg-red-600'}`}>
            {t.kind === 'ok' ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" /> : <XCircle className="size-4 mt-0.5 shrink-0" />}<span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
