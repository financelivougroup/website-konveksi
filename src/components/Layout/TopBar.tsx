import { RefreshCw, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  onRefresh: () => void
  onAddNew: () => void
}

export function TopBar({ onRefresh, onAddNew }: TopBarProps) {
  return (
    // `px-6` (24px) menyamai ViewTabs / Toolbar / SearchBar di bawahnya dan
    // padding halaman lain. Dulu `px-4` karena pembungkus App.tsx menambah
    // `p-4` lagi di luarnya; pembungkus itu sudah dibuang (2026-09-29).
    <div className="flex items-center justify-end gap-2 px-6 py-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        className="h-8 gap-1.5 text-xs"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
      <Button
        size="sm"
        onClick={onAddNew}
        className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-white shadow-sm"
      >
        <Plus className="h-3.5 w-3.5" />
        Add New
      </Button>
    </div>
  )
}
