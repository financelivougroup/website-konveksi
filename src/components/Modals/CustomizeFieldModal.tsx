import { useState } from 'react';
import { StickyNote, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, ColumnNote, ColumnRename } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

interface CustomizeFieldModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  visibleColumns: number[];
  columnNotes: ColumnNote[];
  columnRenames: ColumnRename[];
  onToggle: (index: number) => void;
  onUpdateNotes: (notes: ColumnNote[]) => void;
  onUpdateRenames: (renames: ColumnRename[]) => void;
  onApply: () => void;
}

export function CustomizeFieldModal({ open, onClose, columns, visibleColumns, columnNotes, columnRenames, onToggle, onUpdateNotes, onUpdateRenames, onApply }: CustomizeFieldModalProps) {
  const [editingNote, setEditingNote] = useState<string>('');
  const [noteValue, setNoteValue] = useState('');
  const [editingRename, setEditingRename] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');

  const startEditNote = (key: string, current: string) => {
    setEditingNote(key);
    setNoteValue(current);
  };

  const saveNote = (key: string) => {
    const updated = [...columnNotes];
    const idx = updated.findIndex((n) => n.columnKey === key);
    if (noteValue.trim()) {
      if (idx >= 0) updated[idx] = { columnKey: key, note: noteValue.trim() };
      else updated.push({ columnKey: key, note: noteValue.trim() });
    } else if (idx >= 0) {
      updated.splice(idx, 1);
    }
    onUpdateNotes(updated);
    setEditingNote('');
  };

  const startEditRename = (key: string, current: string) => {
    setEditingRename(key);
    setRenameValue(current);
  };

  const saveRename = (key: string) => {
    const updated = [...columnRenames];
    const idx = updated.findIndex((r) => r.columnKey === key);
    if (renameValue.trim()) {
      if (idx >= 0) updated[idx] = { columnKey: key, customName: renameValue.trim() };
      else updated.push({ columnKey: key, customName: renameValue.trim() });
    } else if (idx >= 0) {
      updated.splice(idx, 1);
    }
    onUpdateRenames(updated);
    setEditingRename('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Customize Fields</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="visibility" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="visibility">Visibility</TabsTrigger>
            <TabsTrigger value="rename">Rename</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Visibility Tab */}
          <TabsContent value="visibility" className="space-y-0">
            {columns.map((col, i) => {
              const isVisible = visibleColumns.includes(i);
              return (
                <div key={col.key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
                  <div className="text-sm font-medium text-slate-700">{col.label}</div>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={() => onToggle(i)}
                  />
                </div>
              );
            })}
          </TabsContent>

          {/* Rename Tab */}
          <TabsContent value="rename">
            <p className="text-xs text-slate-400 mb-3">Click a column name to rename it. Leave blank to reset to default.</p>
            <div className="space-y-2">
              {columns.map((col) => {
                const rename = columnRenames.find((r) => r.columnKey === col.key);
                const currentName = rename?.customName || col.label;
                const isEditing = editingRename === col.key;

                return (
                  <div key={col.key} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => saveRename(col.key)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(col.key); if (e.key === 'Escape') setEditingRename(''); }}
                        className="flex-1 h-7 px-2 text-sm border border-sky-300 rounded-md outline-none bg-white"
                      />
                    ) : (
                      <button
                        onClick={() => startEditRename(col.key, currentName)}
                        className="flex-1 text-left text-sm font-medium text-slate-700 hover:text-sky-600 transition-colors"
                      >
                        {currentName}
                        {rename && <span className="text-slate-400 font-normal ml-1">(was: {col.label})</span>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <p className="text-xs text-slate-400 mb-3">Add notes to columns for documentation. Click the note icon in the table header to view.</p>
            <div className="space-y-2">
              {columns.map((col) => {
                const note = columnNotes.find((n) => n.columnKey === col.key);
                const isEditing = editingNote === col.key;
                const hasNote = !!note;

                return (
                  <div key={col.key} className={cn('flex items-center gap-3 p-2.5 rounded-lg border', hasNote ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-slate-100')}>
                    <StickyNote className={cn('w-4 h-4 flex-shrink-0', hasNote ? 'text-amber-500' : 'text-slate-300')} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{col.label}</div>
                      {isEditing ? (
                        <div className="flex gap-1 mt-1">
                          <input
                            autoFocus
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            onBlur={() => saveNote(col.key)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(col.key); if (e.key === 'Escape') setEditingNote(''); }}
                            placeholder="Enter note..."
                            className="flex-1 h-7 px-2 text-sm border border-amber-300 rounded-md outline-none bg-white"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditNote(col.key, note?.note || '')}
                          className="text-xs text-slate-400 hover:text-amber-600 transition-colors"
                        >
                          {hasNote ? note.note : '+ Add note'}
                        </button>
                      )}
                    </div>
                    {hasNote && !isEditing && (
                      <button
                        onClick={() => {
                          const updated = columnNotes.filter((n) => n.columnKey !== col.key);
                          onUpdateNotes(updated);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-sm font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200">
            Apply
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
