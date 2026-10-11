import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

// Tab pill ringkas — pola yang dipakai halaman Target Jahit
// (`TargetJahitPage.tsx:418-476`), bukan gaya lebar penuh `flex-1 h-9` di
// dalam baki berbingkai yang dipakai Production Monitoring sebelumnya.
//
// Kontrolnya sengaja TIDAK memakai shadcn `Tabs`/`TabsList`: komponen itu
// membawa `h-9` + `text-sm` sendiri, yaitu justru tampilan "besar" yang
// diminta diganti, dan menimpanya berarti melawan bawaannya.

export interface PillTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  items: PillTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Kelas tambahan pada kontainer — mis. `ml-auto` saat tab dipasangkan toggle. */
  className?: string;
  'aria-label'?: string;
}

export function PillTabs<T extends string>({
  items,
  active,
  onChange,
  className,
  'aria-label': ariaLabel,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-2 flex-wrap', className)}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors inline-flex items-center gap-1.5',
              isActive
                ? 'bg-primary text-white shadow-md shadow-slate-300'
                : 'bg-card text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
