import { cn } from '@/lib/utils';

// ===== Data table design system (formal/enterprise) =====
// Zebra rows #FFFFFF/#F9FAFB, hover #F0F1F3, selected #EFF6FF.
// Horizontal dividers only (1px #E5E7EB rows, 2px #D1D5DB header underline).
// Sticky white header.
export const T_WRAP = 'bg-white border border-gray-200 rounded-lg overflow-auto max-h-[calc(100vh-250px)]';
export const T_TABLE = 'w-full text-[13px] leading-[1.45] border-collapse';
export const T_HEAD_ROW = 'bg-white border-b-2 border-[#D1D5DB] sticky top-0 z-10';
export const T_TH = 'py-2.5 px-4 text-[12px] font-semibold text-[#4B5563] whitespace-nowrap';
export const T_TD = 'py-1.5 px-3 align-middle';

// ===== Toolbar buttons (Filter/Sort/Kolom/Export dll.) =====
// Efek hover sama dengan tab bar Production Monitoring: lift + shadow biru.
export const T_TOOLBAR_BTN = 'h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 transition-all duration-200 ease-out';
export const T_TOOLBAR_BTN_IDLE = 'border border-gray-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 hover:-translate-y-px hover:shadow-md hover:shadow-blue-100';
export const T_TOOLBAR_BTN_ACTIVE = 'bg-blue-500 text-white font-medium border border-blue-500 hover:bg-blue-600 hover:-translate-y-px hover:shadow-md hover:shadow-blue-300';

export function rowClass(i: number, selected?: boolean) {
  if (selected) return 'bg-[#EFF6FF] hover:bg-[#E4EDFB] border-b border-[#E5E7EB] transition-colors';
  return cn(
    'border-b border-[#E5E7EB] hover:bg-[#F0F1F3] transition-colors',
    i % 2 === 1 ? 'bg-[#F9FAFB]' : 'bg-white',
  );
}
