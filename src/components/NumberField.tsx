import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface NumberFieldProps {
  id?: string;
  /** Nilai disimpan sebagai string seperti state `qty` di form entry, supaya
   *  keadaan kosong ("") bisa dibedakan dari 0. */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}

/**
 * Input angka dengan tombol kurang/tambah — adaptasi ReUI c-number-field-1.
 *
 * Komponen aslinya berbasis Base UI (`@base-ui/react/number-field`), yang
 * tidak dipakai proyek ini (seluruh 50+ komponen memakai Radix), jadi
 * perilakunya diadaptasi ke atas shadcn `Input` + `Button`.
 *
 * Pengetikan manual tetap diizinkan: operator produksi mengetik angka jauh
 * lebih cepat daripada mengklik tombol +, dan nilai sementara yang tidak
 * valid (mis. "" saat sedang menghapus) tidak dipaksa jadi angka.
 */
export function NumberField({
  id,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  placeholder,
  className,
}: NumberFieldProps) {
  const current = Number(value);
  const isNumeric = value !== '' && Number.isFinite(current);

  const clamp = (next: number) => {
    let result = next;
    if (Number.isFinite(min)) result = Math.max(result, min);
    if (max !== undefined && Number.isFinite(max)) result = Math.min(result, max);
    return result;
  };

  const nudge = (direction: 1 | -1) => {
    // Nilai kosong dianggap 0, jadi tombol + pertama kali menghasilkan min.
    const base = isNumeric ? current : 0;
    onChange(String(clamp(base + direction * step)));
  };

  return (
    <div className={cn('flex items-stretch gap-1.5', className)}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 flex-1 px-3 text-[12px]"
      />
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Kurangi"
          disabled={isNumeric && current <= min}
          onClick={() => nudge(-1)}
          className="h-9 w-9 text-slate-500"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Tambah"
          disabled={isNumeric && max !== undefined && current >= max}
          onClick={() => nudge(1)}
          className="h-9 w-9 text-slate-500"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
