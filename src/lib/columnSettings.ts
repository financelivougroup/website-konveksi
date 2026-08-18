import { useState } from 'react';

// Pengaturan hide/show kolom per tabel — tersimpan di localStorage,
// persist antar sesi. Dipakai bersama ColumnSettingsButton.
// Kept separate so ColumnSettings.tsx only exports React components.

const STORAGE_KEY = 'app.column-settings';

function readAll(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function useColumnSettings(key: string) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(readAll()[key] ?? []));
  const toggle = (colKey: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey); else next.add(colKey);
      const all = readAll();
      if (next.size === 0) delete all[key]; else all[key] = Array.from(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      return next;
    });
  };
  return { hidden, toggle };
}
