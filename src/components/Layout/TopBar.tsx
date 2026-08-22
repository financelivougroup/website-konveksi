import { RefreshCw, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  onRefresh: () => void
  onAddNew: () => void
}

export function TopBar({ onRefresh, onAddNew }: TopBarProps) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2">
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
        className="h-8 gap-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
      >
        <Plus className="h-3.5 w-3.5" />
        Add New
      </Button>
    </div>
  )
}
