import { useEffect, useState } from 'react';
import { CircleAlert, ImageIcon, Upload, X, ZoomIn } from 'lucide-react';
import { formatBytes, useFileUpload } from '@/hooks/use-file-upload';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface FileUploadFieldProps {
  id?: string;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

// ReUI c-file-upload-4, adapted to one evidence photo without demo images
// or simulated upload progress. Persistence remains the form's responsibility.
export function FileUploadField({ id, onChange, disabled = false }: FileUploadFieldProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [{ files, isDragging, errors }, actions] = useFileUpload({
    multiple: false,
    accept: 'image/jpeg,image/png,image/webp',
    maxSize: 5 * 1024 * 1024,
    // onFilesAdded runs in the input event, not inside a React state updater.
    onFilesAdded: (added) => {
      setPreviewError(false);
      const file = added[0]?.file;
      onChange(file instanceof File ? file : null);
    },
    onError: () => onChange(null),
  });
  const selected = files[0];
  const preview = selected?.preview;

  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="min-w-0 space-y-3">
      <div
        className={cn('rounded-lg border border-dashed p-4 text-center transition-colors duration-200',
          isDragging ? 'border-slate-500 bg-slate-50' : 'border-slate-300 bg-slate-50/50',
          disabled && 'pointer-events-none opacity-60')}
        onDragEnter={actions.handleDragEnter}
        onDragLeave={actions.handleDragLeave}
        onDragOver={actions.handleDragOver}
        onDrop={actions.handleDrop}
      >
        <input {...actions.getInputProps({ id, disabled, 'aria-label': 'Pilih foto bukti barang' })} className="sr-only" />
        <ImageIcon className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        <p className="text-[12px] font-medium text-slate-700">Tarik foto bukti ke sini</p>
        <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, WEBP · maksimal 5 MB</p>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={actions.openFileDialog} className="mt-3 h-8 gap-2 text-[12px]">
          <Upload className="h-3.5 w-3.5" />{selected ? 'Ganti foto' : 'Pilih foto'}
        </Button>
      </div>
      {selected && (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-white p-2.5">
          {preview && !previewError ? <img src={preview} alt="Bukti yang dipilih" className="h-12 w-12 shrink-0 rounded-md object-cover" onError={() => setPreviewError(true)} /> : <ImageIcon className="h-12 w-12 shrink-0 p-3 text-slate-400" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium" title={selected.file.name}>{selected.file.name}</p>
            <p className="text-[11px] text-slate-500">{formatBytes(selected.file.size)} · Dipilih</p>
            {previewError && <p role="status" className="text-[11px] text-amber-700">Pratinjau tidak tersedia. Coba foto lain.</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Perbesar bukti barang" disabled={disabled || !preview || previewError} onClick={() => setPreviewOpen(true)}><ZoomIn className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-600" aria-label="Hapus foto bukti" disabled={disabled} onClick={() => { actions.removeFile(selected.id); onChange(null); setPreviewOpen(false); }}><X className="h-4 w-4" /></Button>
        </div>
      )}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle className="text-[12px]">Foto tidak dapat dipilih</AlertTitle>
          <AlertDescription className="text-[11px]">Gunakan JPG, PNG, atau WEBP berukuran maksimal 5 MB, lalu pilih ulang.</AlertDescription>
        </Alert>
      )}
      <Dialog open={!disabled && previewOpen && !!preview} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Pratinjau bukti barang</DialogTitle><DialogDescription className="break-all">{selected?.file.name}</DialogDescription></DialogHeader>
          {preview && <img src={preview} alt="Pratinjau bukti barang" className="max-h-[65vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
