import * as React from 'react';

import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SelectOption } from '@/components/selectOptions';

/**
 * Nilai sentinel untuk opsi "kosong / placeholder".
 *
 * Radix menolak `Select.Item` bernilai string kosong (nilai kosong dipakai
 * untuk mengosongkan pilihan dan memunculkan placeholder), sementara seluruh
 * `<select>` native di aplikasi ini memakai `<option value="">` untuk keperluan
 * yang sama. Nilai yang tidak mungkin muncul di data ini dipakai sebagai
 * pengganti dan dipetakan kembali ke `''` sebelum keluar dari komponen.
 */
const EMPTY_VALUE = '__app_select_empty__';


interface AppSelectProps {
  /** Dipakai juga sebagai id elemen pembawa nilai (menggantikan `<select>`). */
  id?: string;
  /** Nilai terkontrol. */
  value?: string;
  /** Nilai awal untuk pemakaian tidak terkontrol. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  /** Teks opsi pengosong; bila ada, opsi ini ditambahkan di posisi pertama. */
  placeholder?: string;
  /** Keep the trigger placeholder without offering it as a clear-selection item. */
  showPlaceholderOption?: boolean;
  /** Label di atas trigger; mengikuti struktur `Field` pada c-select-4. */
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  /** Pesan saat `options` kosong. */
  emptyMessage?: string;
  /**
   * Lepas pembungkus `Field` (label + tata letak vertikal).
   *
   * Dipakai untuk dropdown yang berdiri sebaris dengan kontrol lain (baris
   * aturan filter/sort), tempat pembungkus vertikal `Field` akan merusak
   * tata letak. Struktur `c-select-4` tetap dipakai di mode normal.
   */
  bare?: boolean;
  /**
   * Nilai yang tersimpan boleh tidak ada di `options` (mis. penjahit yang sudah
   * Non-Aktif). Nilai itu disisipkan agar pilihan tersimpan tetap tampil dan
   * tidak berubah diam-diam saat disimpan ulang.
   */
  allowUnlistedValue?: boolean;
}

/**
 * Dropdown pilihan — struktur ReUI `c-select-4` (`Field` + `Select` +
 * `SelectGroup` + `SelectItem`) di atas primitif shadcn yang sudah terpasang.
 *
 * Catatan penyesuaian: referensi asli memakai `<Select items={items}>`.
 * Prop `items` bukan API Radix (melainkan Base UI) dan tidak ada di versi
 * manapun yang terbit, jadi tidak dipakai di sini — item tetap dirender satu
 * per satu seperti pada referensi, sehingga perilakunya identik.
 *
 * Elemen pembawa nilai dirender sebagai `<input type="hidden">` dengan id yang
 * sama, supaya kode yang mengumpulkan nilai lewat DOM (seperti `collectFormData`
 * di DetailPanel) tetap membaca nilai yang sama seperti sebelumnya.
 */
export function AppSelect({
  id,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  showPlaceholderOption = true,
  label,
  required = false,
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  emptyMessage = 'Tidak ada pilihan.',
  allowUnlistedValue = true,
  bare = false,
}: AppSelectProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const currentValue = isControlled ? value : internalValue;

  const items = React.useMemo(() => {
    const base = options.filter((option) => option.value !== '');
    const hasUnlisted =
      allowUnlistedValue &&
      currentValue !== '' &&
      currentValue !== EMPTY_VALUE &&
      !base.some((option) => option.value === currentValue);

    return hasUnlisted
      ? [{ value: currentValue, label: currentValue }, ...base]
      : base;
  }, [options, currentValue, allowUnlistedValue]);

  const handleValueChange = (next: string) => {
    const normalized = next === EMPTY_VALUE ? '' : next;
    if (!isControlled) setInternalValue(normalized);
    onValueChange?.(normalized);
  };

  // Radix memakai '' untuk mengosongkan pilihan; sentinel dipakai hanya untuk item.
  const selectValue =
    currentValue === '' || currentValue === EMPTY_VALUE
      ? undefined
      : currentValue;

  if (bare) {
    return (
      <Select
        value={selectValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id={id ? `${id}-trigger` : undefined}
          aria-required={required || undefined}
          className={cn(
            'h-7 w-full min-w-0 text-[11px]',
            !currentValue && 'text-slate-400',
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent className={contentClassName}>
          {items.length === 0 && (!placeholder || !showPlaceholderOption) ? (
            <div className="px-3 py-2 text-[12px] text-slate-400">{emptyMessage}</div>
          ) : (
            <SelectGroup>
              {placeholder && showPlaceholderOption && (
                <SelectItem value={EMPTY_VALUE} className="text-[12px] text-slate-400">
                  {placeholder}
                </SelectItem>
              )}
              {items.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="text-[12px]"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Field className={cn('gap-1.5', className)}>
      {label && (
        <FieldLabel
          htmlFor={id ? `${id}-trigger` : undefined}
          className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground"
        >
          {label}
          {required && <span className="sr-only"> (wajib diisi)</span>}
        </FieldLabel>
      )}

      <Select
        value={selectValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id={id ? `${id}-trigger` : undefined}
          aria-required={required || undefined}
          className={cn('h-9 w-full text-[12px]', !currentValue && 'text-slate-400', triggerClassName)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent className={contentClassName}>
          {items.length === 0 && (!placeholder || !showPlaceholderOption) ? (
            <div className="px-3 py-2 text-[12px] text-slate-400">{emptyMessage}</div>
          ) : (
            <SelectGroup>
              {placeholder && showPlaceholderOption && (
                <SelectItem value={EMPTY_VALUE} className="text-[12px] text-slate-400">
                  {placeholder}
                </SelectItem>
              )}
              {items.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="text-[12px]"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {id && <input type="hidden" id={id} value={currentValue} readOnly />}
    </Field>
  );
}

