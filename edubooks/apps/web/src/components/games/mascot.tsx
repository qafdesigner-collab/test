'use client';
/** "Ollie" the owl — the friendly guide of the student portal (inline SVG, no external assets). */
export function Mascot({ say, mood = 'happy', size = 120 }: { say?: string; mood?: 'happy' | 'wow'; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Ollie the owl" className="shrink-0 motion-safe:animate-[bob_3s_ease-in-out_infinite]">
        <ellipse cx="60" cy="112" rx="30" ry="5" fill="#000" opacity=".08" />
        <path d="M22 40 L32 14 L46 32 Z M98 40 L88 14 L74 32 Z" fill="#7c3aed" />
        <ellipse cx="60" cy="66" rx="40" ry="44" fill="#8b5cf6" />
        <ellipse cx="60" cy="80" rx="26" ry="26" fill="#ede9fe" />
        <circle cx="43" cy="52" r="15" fill="#fff" /><circle cx="77" cy="52" r="15" fill="#fff" />
        <circle cx={mood === 'wow' ? 43 : 45} cy="53" r={mood === 'wow' ? 8 : 7} fill="#1e1b4b" /><circle cx={mood === 'wow' ? 77 : 75} cy="53" r={mood === 'wow' ? 8 : 7} fill="#1e1b4b" />
        <circle cx="47" cy="50" r="2.5" fill="#fff" /><circle cx="78" cy="50" r="2.5" fill="#fff" />
        <path d="M54 64 L60 74 L66 64 Z" fill="#f59e0b" />
        <path d="M24 70 Q14 86 26 98 M96 70 Q106 86 94 98" stroke="#7c3aed" strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M48 108 l-4 6 M54 108 v7 M66 108 v7 M72 108 l4 6" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {say && <div className="relative mb-6 max-w-xs rounded-3xl bg-white px-5 py-3 text-left text-lg font-bold text-slate-700 shadow-md before:absolute before:-left-2 before:bottom-4 before:size-4 before:rotate-45 before:bg-white">{say}</div>}
    </div>
  );
}
