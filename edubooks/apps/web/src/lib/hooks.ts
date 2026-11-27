'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';

/** Mutation that invalidates the given query keys, toasts success/error. */
export function useAction<V = void, R = any>(fn: (v: V) => Promise<R>, opts: { ok?: string | ((r: R) => string); keys?: string[]; after?: (r: R) => void } = {}) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      (opts.keys ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (opts.ok) toast(typeof opts.ok === 'function' ? opts.ok(r) : opts.ok);
      opts.after?.(r);
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });
}
