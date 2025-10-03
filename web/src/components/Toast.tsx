// web/src/components/Toast.tsx
import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; msg: string };
type ToastCtx = { push: (msg: string) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((msg: string) => {
    const id = Date.now();
    setItems((a) => [...a, { id, msg }]);
    setTimeout(() => setItems((a) => a.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 grid gap-2 z-[1000]">
        {items.map((t) => (
          <div
            key={t.id}
            className="px-3 py-2 rounded bg-black/80 border border-white/15 text-sm text-white shadow"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing (wrap your app in <ToastProvider>)");
  return ctx;
}
