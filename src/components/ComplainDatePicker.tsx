import { useState } from 'react';
import { format, isValid, parseISO, subDays } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ComplainDatePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

// Adapted from ReUI c-calendar-16: sidebar presets, with one date per complain.
export function ComplainDatePicker({ id, value, onChange }: ComplainDatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const selected = isValid(parsed) ? parsed : undefined;
  const [month, setMonth] = useState(() => selected ?? new Date());

  const selectDate = (date: Date) => {
    // Keep the local calendar date; UTC conversion can shift the saved day.
    onChange(format(date, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) setMonth(selected ?? new Date());
      setOpen(nextOpen);
    }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-required="true"
          className="h-9 w-full justify-start gap-2 px-3 text-[12px] font-normal"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? format(selected, 'd MMM yyyy', { locale: localeId }) : 'Pilih tanggal'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-auto max-w-[calc(100vw-1.5rem)] overflow-y-auto max-h-[var(--radix-popover-content-available-height)] p-0"
        aria-label="Pilih tanggal complain"
      >
        <Card className="border-0 p-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row">
              <div className="order-1 border-t px-2 py-3 sm:order-none sm:w-28 sm:border-r sm:border-t-0 sm:py-4">
                <div className="flex gap-1 sm:flex-col">
                  <Button type="button" variant="ghost" size="sm" className="flex-1 justify-start sm:w-full" onClick={() => selectDate(new Date())}>
                    Hari ini
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="flex-1 justify-start sm:w-full" onClick={() => selectDate(subDays(new Date(), 1))}>
                    Kemarin
                  </Button>
                </div>
              </div>
              <Calendar
                mode="single"
                required
                autoFocus
                locale={localeId}
                month={month}
                onMonthChange={setMonth}
                selected={selected}
                onSelect={selectDate}
                className="[--cell-size:2rem]"
              />
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
