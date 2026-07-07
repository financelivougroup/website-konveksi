import { Search } from 'lucide-react';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  recordCount: number;
}

export function SearchBar({ query, onQueryChange, recordCount }: SearchBarProps) {
  return (
    <div className="h-[48px] bg-white flex items-center justify-between px-6 gap-3 flex-shrink-0">
      <div className="relative w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search in this view..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full h-8 bg-slate-50 border border-gray-200 rounded-lg pl-9 pr-3 text-[13px] text-slate-700 placeholder-gray-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all"
        />
      </div>
      <span className="text-[11px] text-slate-400 font-medium">{recordCount} records</span>
    </div>
  );
}
