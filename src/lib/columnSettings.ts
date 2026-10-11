import { useCallback, useMemo, useState } from 'react';
import {
  isDefaultTableSettings,
  normalizeFrozen,
  parseTableSettings,
  toggleFrozen,
} from './columnFreeze.ts';
import type { TableColumnSettings } from './columnFreeze.ts';

// Pengaturan kolom per tabel — tersimpan di localStorage, persist antar sesi.
// Dipakai bersama ColumnSettingsButton. Isinya tiga hal: kolom yang
// disembunyikan, kolom yang dibekukan (freeze), dan apakah header ikut beku.
// Kept separate so ColumnSettings.tsx only exports React components.
//
// ATURAN IMPOR: `./columnFreeze.ts` memakai ekstensi `.ts` yang eksplisit dan
// bukan alias `@/`. Berkas ini ikut dimuat `node --test` (lewat tes
// columnFreeze), dan Node tidak bisa meresolusi alias `@/` maupun ekstensi
// implisit. Mengubahnya jadi `@/lib/columnFreeze` akan mematikan tesnya.

const STORAGE_KEY = 'app.column-settings';

/** Nilai mentah yang tersimpan: satu entri per kunci tabel. */
function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage bisa penuh atau diblokir (mode privat). Pengaturan kolom
    // bukan data penting: gagal menyimpan tidak boleh sampai membuat tabel
    // tidak bisa dipakai.
  }
}

function readTable(key: string): TableColumnSettings {
  return parseTableSettings(readAll()[key]);
}

/**
 * Pengaturan kolom satu tabel.
 *
 * `orderedKeys` adalah urutan kolom yang dipakai tabel tersebut (kolom
 * tersembunyi TIDAK perlu dibuang dulu — hook yang menyaringnya). Dipakai untuk
 * merapikan daftar beku menjadi awalan yang rapat, sehingga hasilnya langsung
 * bisa dipakai sebagai `state.columnPinning.start` milik TanStack: mesin
 * pinning mengangkat kolom yang di-pin ke depan mengikuti urutan array itu,
 * jadi daftar yang berlubang akan mengubah urutan kolom di layar.
 *
 * Opsional supaya tabel yang tidak memakai fitur freeze tidak perlu berubah.
 */
export function useColumnSettings(key: string, orderedKeys: string[] = []) {
  const [settings, setSettings] = useState<TableColumnSettings>(() => {
    const stored = readTable(key);
    return {
      ...stored,
      frozen: normalizeFrozen(orderedKeys, stored.hidden, stored.frozen),
    };
  });

  const hidden = useMemo(() => new Set(settings.hidden), [settings.hidden]);
  const frozen = useMemo(() => new Set(settings.frozen), [settings.frozen]);

  /**
   * Sembunyikan/tampilkan satu kolom.
   *
   * Kolom yang disembunyikan otomatis dilepas dari daftar beku: kolom beku yang
   * tidak dirender tidak ikut dihitung TanStack, sehingga kolom beku di
   * sebelahnya akan memakai offset yang terlalu kecil dan saling menutupi.
   */
  const toggle = useCallback(
    (colKey: string) => {
      setSettings((prev) => {
        const nextHidden = prev.hidden.includes(colKey)
          ? prev.hidden.filter((k) => k !== colKey)
          : [...prev.hidden, colKey];
        const next: TableColumnSettings = {
          ...prev,
          hidden: nextHidden,
          frozen: normalizeFrozen(orderedKeys, nextHidden, prev.frozen),
        };
        const all = readAll();
        if (isDefaultTableSettings(next)) delete all[key];
        else all[key] = next;
        writeAll(all);
        return next;
      });
    },
    [key, orderedKeys],
  );

  /** Bekukan kolom ini (ikut kolom di kirinya), atau lepas kolom ini dan sesudahnya. */
  const toggleFreeze = useCallback(
    (colKey: string) => {
      setSettings((prev) => {
        const next: TableColumnSettings = {
          ...prev,
          frozen: toggleFrozen(orderedKeys, prev.hidden, prev.frozen, colKey),
        };
        const all = readAll();
        if (isDefaultTableSettings(next)) delete all[key];
        else all[key] = next;
        writeAll(all);
        return next;
      });
    },
    [key, orderedKeys],
  );

  /** Bekukan semua kolom yang terlihat, atau lepas semuanya. */
  const toggleFreezeAll = useCallback(() => {
    setSettings((prev) => {
      const allVisible = orderedKeys.filter((k) => !prev.hidden.includes(k));
      const allFrozen =
        allVisible.length > 0 && allVisible.every((k) => prev.frozen.includes(k));
      const next: TableColumnSettings = {
        ...prev,
        frozen: allFrozen ? [] : allVisible,
      };
      const all = readAll();
      if (isDefaultTableSettings(next)) delete all[key];
      else all[key] = next;
      writeAll(all);
      return next;
    });
  }, [key, orderedKeys]);

  const setHeaderFrozen = useCallback(
    (value: boolean) => {
      setSettings((prev) => {
        const next: TableColumnSettings = { ...prev, headerFrozen: value };
        const all = readAll();
        if (isDefaultTableSettings(next)) delete all[key];
        else all[key] = next;
        writeAll(all);
        return next;
      });
    },
    [key],
  );

  return {
    hidden,
    toggle,
    frozen,
    toggleFreeze,
    toggleFreezeAll,
    headerFrozen: settings.headerFrozen,
    setHeaderFrozen,
  };
}
