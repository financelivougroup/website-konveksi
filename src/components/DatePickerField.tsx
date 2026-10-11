import { useState } from 'react';
import { format, isValid, parseISO, startOfDay, subDays } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerFieldProps {
  id?: string;
  /** 'YYYY-MM-DD'. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Batas atas tanggal yang boleh dipilih (inklusif). */
  maxDate?: Date;
  /** Batas bawah tanggal yang boleh dipilih (inklusif). */
  minDate?: Date;
  className?: string;
}

/**
 * Pemilih tanggal satu-per-satu untuk form entry produksi.
 *
 * Adaptasi ReUI c-calendar-15: popover + kalender dengan preset, mengikuti
 * pola `ComplainDatePicker` yang sudah ada di repo. Perbedaan utamanya ada
 * pada `maxDate`/`minDate` — form log produksi harus mengizinkan backdate
 * (entry yang terlambat dicatat) tetapi tidak boleh menerima tanggal masa
 * depan, jadi tanggal sesudah hari ini dinonaktifkan.
 *
 * Nilai tetap disimpan sebagai string 'YYYY-MM-DD' agar sesuai dengan kolom
 * `tanggal_laporan` / `tanggal_import` di database.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  maxDate,
  minDate,
  className,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const selected = isValid(parsed) ? parsed : undefined;
  const [month, setMonth] = useState(() => selected ?? new Date());

  // Tanggal dinormalisasi ke awal hari supaya "hari ini" tidak tiba-tiba
  // dinonaktifkan gara-gara perbandingan jam.
  const isDisabled = (date: Date) => {
    const day = startOfDay(date);
    if (minDate && day < startOfDay(minDate)) return true;
    if (maxDate && day > startOfDay(maxDate)) return true;
    return false;
  };

  const selectDate = (date: Date) => {
    if (isDisabled(date)) return;
    // Dipakai tanggal kalender lokal; konversi UTC bisa menggeser hari.
    onChange(format(date, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setMonth(selected ?? new Date());
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start gap-2 px-3 text-[12px] font-normal',
            !selected && 'text-slate-400',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">
            {selected ? format(selected, 'd MMM yyyy', { locale: localeId }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-auto max-w-[calc(100vw-1.5rem)] overflow-y-auto max-h-[var(--radix-popover-content-available-height)] p-0"
        aria-label="Pilih tanggal"
      >
        <Card className="border-0 p-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row">
              <div className="order-1 border-t px-2 py-3 sm:order-none sm:w-28 sm:border-r sm:border-t-0 sm:py-4">
                <div className="flex gap-1 sm:flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex-1 justify-start sm:w-full"
                    disabled={isDisabled(new Date())}
                    onClick={() => selectDate(new Date())}
                  >
                    Hari ini
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex-1 justify-start sm:w-full"
                    disabled={isDisabled(subDays(new Date(), 1))}
                    onClick={() => selectDate(subDays(new Date(), 1))}
                  >
                    Kemarin
                  </Button>
                </div>
              </div>
              <Calendar
                mode="single"
                autoFocus
                locale={localeId}
                month={month}
                onMonthChange={setMonth}
                selected={selected}
                onSelect={(date) => date && selectDate(date)}
                disabled={isDisabled}
                className="[--cell-size:2rem]"
              />
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
