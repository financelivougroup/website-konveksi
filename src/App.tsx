import { useState, useEffect, useMemo, useCallback } from 'react';
import { computeCutVsUpload, computeStatusStock } from '@/lib/utils';
import { Landing } from '@/pages/Landing';
import ProductionMonitoring from '@/pages/ProductionMonitoring';
import SewingEntryForm from '@/pages/SewingEntryForm';
import SeedPage from '@/pages/SeedPage';
import InvoicingPage from '@/pages/InvoicingPage';
import { RegisterPoPage } from '@/pages/RegisterPoPage';
import OrderEntry from '@/pages/OrderEntry';
import { Sidebar } from '@/components/Layout/Sidebar';
import { AuthGate } from '@/components/Auth/AuthGate';
import { TopBar } from '@/components/Layout/TopBar';
import { ViewTabs } from '@/components/Layout/ViewTabs';
import { Toolbar } from '@/components/Layout/Toolbar';
import { SearchBar } from '@/components/Layout/SearchBar';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { DetailPanel } from '@/components/Panel/DetailPanel';
import { ToastContainer } from '@/components/Layout/ToastContainer';
import { CustomizeFieldModal } from '@/components/Modals/CustomizeFieldModal';
import { FilterModal } from '@/components/Modals/FilterModal';
import { GroupByModal } from '@/components/Modals/GroupByModal';
import { SortModal } from '@/components/Modals/SortModal';
import { RowHeightModal } from '@/components/Modals/RowHeightModal';
import { ConditionalColorModal } from '@/components/Modals/ConditionalColorModal';
import { DateRangeModal } from '@/components/Modals/DateRangeModal';
import { AddViewModal } from '@/components/Modals/AddViewModal';
import { useToast } from '@/hooks/useToast';
import { viewConfig } from '@/data/mockData';
import * as targetJahitSvc from '@/services/targetJahit';
import * as registerPenjahitSvc from '@/services/registerPenjahit';
import * as daftarLiburSvc from '@/services/daftarLibur';
import { supabase } from '@/lib/supabase';
import type { ModuleId } from '@/types';

const PAGE_SIZE = 10;

type ModalType = 'customize' | 'filter' | 'dateRange' | 'group' | 'sort' | 'rowHeight' | 'condColor' | 'addView' | null;

import type { ViewTabSettings, ModuleViews } from '@/types';

function makeDefaultSettings(moduleId: ModuleId): ViewTabSettings {
  const config = viewConfig[moduleId];
  const allIndices = config.columns.map((_, i) => i);
  return {
    visibleColumns: [...allIndices],
    columnOrder: [...allIndices],
    columnWidths: {},
    columnNotes: [],
    columnRenames: [],
    columnSources: [],
    filters: [],
    groups: [],
    sorts: [],
    rowHeight: 'medium',
    condColors: [],
  };
}

export default function App() {
  // 'landing' shows the marketing site, 'app' shows the data dashboard.
  const [viewMode, setViewMode] = useState<'app' | 'landing' | 'seed'>('app');
  const [currentView, setCurrentView] = useState<ModuleId>('selesai-finishing');
  const [currentViewTab, setCurrentViewTab] = useState(0);
  // Active sub-tab inside the combined "Production Data" view.
  // Ignored for all other modules.
  const [activeSubModule, setActiveSubModule] = useState<ModuleId>('register-jahit');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState<ModalType>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelRow, setPanelRow] = useState<Record<string, unknown> | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Date range filter (global, per view tab)
  const [dateField, setDateField] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sidebar table rename: moduleId → custom name
  const [sidebarRenames, setSidebarRenames] = useState<Record<string, string>>({});

  // Per-module view tabs + per-tab settings
  const [moduleViews, setModuleViews] = useState<Record<string, ModuleViews>>({});

  const getModuleViews = useCallback((moduleId: ModuleId): ModuleViews => {
    if (moduleViews[moduleId]) return moduleViews[moduleId];

    // Preset views for Selesai Finishing
    if (moduleId === 'selesai-finishing') {
      return {
        views: [
          { name: 'Raw Data', icon: 'Database' },
          { name: 'Clear Finish', icon: 'CheckCircle' },
          { name: 'Need Invoice', icon: 'FileText' },
        ],
        tabSettings: {
          0: makeDefaultSettings(moduleId), // Raw: no filters
          1: {
            ...makeDefaultSettings(moduleId),
            filters: [
              { field: 'cutVsUpload', operator: 'equals', value: 'LENGKAP' },
              { field: 'jahitVsFinish', operator: 'equals', value: 'BALANCE' },
            ],
          },
          2: {
            ...makeDefaultSettings(moduleId),
            filters: [
              { field: 'alertTrigger', operator: 'contains', value: 'PERLU REGISTER INVOICE' },
            ],
          },
        },
      };
    }

    return {
      views: [{ name: 'All Data', icon: 'LayoutList' }],
      tabSettings: { 0: makeDefaultSettings(moduleId) },
    };
  }, [moduleViews]);

  const getSettings = useCallback((moduleId: ModuleId, tabIndex: number): ViewTabSettings => {
    const mv = getModuleViews(moduleId);
    return mv.tabSettings[tabIndex] || makeDefaultSettings(moduleId);
  }, [getModuleViews]);

  const updateModuleViews = useCallback((moduleId: ModuleId, updater: (prev: ModuleViews) => ModuleViews) => {
    setModuleViews((prev) => {
      const current = prev[moduleId] || {
        views: [{ name: 'All Data', icon: 'LayoutList' }],
        tabSettings: { 0: makeDefaultSettings(moduleId) },
      };
      return { ...prev, [moduleId]: updater(current) };
    });
  }, []);

  const updateSettings = useCallback((moduleId: ModuleId, tabIndex: number, updater: (prev: ViewTabSettings) => ViewTabSettings) => {
    updateModuleViews(moduleId, (prev) => ({
      ...prev,
      tabSettings: {
        ...prev.tabSettings,
        [tabIndex]: updater(prev.tabSettings[tabIndex] || makeDefaultSettings(moduleId)),
      },
    }));
  }, [updateModuleViews]);

  const isPipelineView = currentView === 'production-monitoring' || currentView === 'sewing-entry';

  const mv = isPipelineView ? { views: [], tabSettings: {} } : getModuleViews(currentView);
  const settings = isPipelineView ? makeDefaultSettings('selesai-finishing') : getSettings(currentView, currentViewTab);
  // Combined "Production Data" view: resolve the real module from the active sub-tab
  // so the table, DetailPanel form and column config all follow the sub-tab selection.
  const isCombinedView = !isPipelineView && currentView === 'production-data';
  const effectiveModule = isPipelineView ? 'selesai-finishing' : (isCombinedView ? activeSubModule : currentView);
  const config = isPipelineView ? viewConfig['selesai-finishing'] : viewConfig[effectiveModule];

  // ====== Supabase data fetching ======
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (isPipelineView) { setTableData([]); return; }

    async function fetchModuleData() {
      let rows: Record<string, unknown>[] = [];

      switch (effectiveModule) {
        case 'selesai-finishing': {
          // Derived: join work_orders + cutting_records + sewing_records and compute fields
          const { data: wo } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
          if (wo) {
            rows = wo.map((w: Record<string, unknown>) => {
              const row = { ...w };
              row.cutVsUpload = computeCutVsUpload(row);
              row.statusStock = computeStatusStock({ ...row, cutVsUpload: row.cutVsUpload });
              // Compute jahitVsFinish
              const qty = Number(w.quantity) || 0;
              const totalJahit = Number(w.total_selesai_jahit) || 0;
              row.jahitVsFinish = qty === totalJahit ? 'BALANCE' : 'MASALAH';
              return row;
            });
          }
          break;
        }
        case 'selesai-jahit': {
          const { data: wo } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
          if (wo) rows = wo as Record<string, unknown>[];
          break;
        }
        case 'target-jahit': {
          const { data } = await targetJahitSvc.fetchAll();
          if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
          break;
        }
        case 'register-jahit': {
          const { data: wo } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
          if (wo) rows = wo as Record<string, unknown>[];
          break;
        }
        case 'daftar-libur': {
          const { data } = await daftarLiburSvc.fetchAll();
          if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
          break;
        }
        case 'register-penjahit': {
          const { data } = await registerPenjahitSvc.fetchAll();
          if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
          break;
        }
        case 'master-product': {
          const { data } = await supabase.from('master_products').select('*').order('id');
          if (data) rows = data as Record<string, unknown>[];
          break;
        }
        case 'raw-monitoring': {
          const { data } = await supabase.from('raw_product_monitoring').select('*').order('id');
          if (data) rows = data as Record<string, unknown>[];
          break;
        }
        case 'master-import': {
          const { data } = await supabase.from('master_imports').select('*').order('id');
          if (data) rows = data as Record<string, unknown>[];
          break;
        }
        default:
          break;
      }
      setTableData(rows);
    }
    fetchModuleData();
  }, [effectiveModule, isPipelineView]);

  const refetchTableData = useCallback(() => {
    // trigger re-fetch by toggling a counter or re-running the effect
    // We just re-run the effect by changing effectiveModule briefly - simpler approach
    if (!isPipelineView) {
      const fetchFresh = async () => {
        let rows: Record<string, unknown>[] = [];
        switch (effectiveModule) {
          case 'selesai-finishing': {
            const { data: wo } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
            if (wo) {
              rows = wo.map((w: Record<string, unknown>) => {
                const row = { ...w };
                row.cutVsUpload = computeCutVsUpload(row);
                row.statusStock = computeStatusStock({ ...row, cutVsUpload: row.cutVsUpload });
                const qty = Number(w.quantity) || 0;
                const totalJahit = Number(w.total_selesai_jahit) || 0;
                row.jahitVsFinish = qty === totalJahit ? 'BALANCE' : 'MASALAH';
                return row;
              });
            }
            break;
          }
          case 'target-jahit': {
            const { data } = await targetJahitSvc.fetchAll();
            if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
            break;
          }
          case 'daftar-libur': {
            const { data } = await daftarLiburSvc.fetchAll();
            if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
            break;
          }
          case 'register-penjahit': {
            const { data } = await registerPenjahitSvc.fetchAll();
            if (data) rows = data.map(r => ({ ...r })) as unknown as Record<string, unknown>[];
            break;
          }
          case 'selesai-jahit':
          case 'register-jahit': {
            const { data: wo } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false });
            if (wo) rows = wo as Record<string, unknown>[];
            break;
          }
          case 'master-product': {
            const { data } = await supabase.from('master_products').select('*').order('id');
            if (data) rows = data as Record<string, unknown>[];
            break;
          }
          case 'raw-monitoring': {
            const { data } = await supabase.from('raw_product_monitoring').select('*').order('id');
            if (data) rows = data as Record<string, unknown>[];
            break;
          }
          case 'master-import': {
            const { data } = await supabase.from('master_imports').select('*').order('id');
            if (data) rows = data as Record<string, unknown>[];
            break;
          }
        }
        setTableData(rows);
      };
      fetchFresh();
    }
  }, [effectiveModule, isPipelineView]);

  const data = isPipelineView ? [] : tableData;

  // Process data
  const processedData = useMemo(() => {
    // Recompute "Cut vs Upload" + "STATUS STOCK" dynamically per the AppSheet
    // formulas, so the table + filters always reflect the latest numbers.
    let result: Record<string, unknown>[] = data.map((row) => {
      const cutVsUpload = computeCutVsUpload(row);
      return { ...row, cutVsUpload, statusStock: computeStatusStock({ ...row, cutVsUpload }) };
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    if (settings.filters.length > 0) {
      result = result.filter((row) =>
        settings.filters.every((f) => {
          const val = String(row[f.field] || '').toLowerCase();
          const search = f.value.toLowerCase();
          if (f.operator === 'contains') return val.includes(search);
          if (f.operator === 'equals') return val === search;
          if (f.operator === 'starts') return val.startsWith(search);
          if (f.operator === 'ends') return val.endsWith(search);
          return true;
        })
      );
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const field = dateField || 'tanggal';
      result = result.filter((row) => {
        const val = String(row[field] || '');
        if (!val) return false;
        const rowDate = new Date(val + 'T00:00:00');
        if (isNaN(rowDate.getTime())) return true; // skip non-date values
        if (dateFrom) {
          const from = new Date(dateFrom + 'T00:00:00');
          if (rowDate < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59');
          if (rowDate > to) return false;
        }
        return true;
      });
    }

    if (settings.sorts.length > 0) {
      result.sort((a, b) => {
        for (const s of settings.sorts) {
          const aVal = a[s.field] || '';
          const bVal = b[s.field] || '';
          if (aVal < bVal) return s.dir === 'asc' ? -1 : 1;
          if (aVal > bVal) return s.dir === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [data, searchQuery, settings.filters, settings.sorts, dateField, dateFrom, dateTo]);

  // Pagination
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedData.slice(start, start + PAGE_SIZE);
  }, [processedData, currentPage]);

  // Ordered, visible columns with custom widths, notes, renames, and sources applied
  const displayColumns = useMemo(() => {
    // 1. Apply columnOrder to determine sequence
    const orderedIndices = settings.columnOrder.length > 0
      ? settings.columnOrder.filter((i) => settings.visibleColumns.includes(i))
      : settings.visibleColumns;

    // 2. Map to column defs with customizations
    return orderedIndices.map((i) => {
      const col = config.columns[i];
      if (!col) return null;

      // Apply custom width
      const customWidth = settings.columnWidths[col.key];

      // Apply custom name (rename)
      const rename = settings.columnRenames.find((r) => r.columnKey === col.key);
      const displayLabel = rename?.customName || col.label;

      // Find note
      const note = settings.columnNotes.find((n) => n.columnKey === col.key);

      // Find source
      const source = settings.columnSources.find((s) => s.columnKey === col.key);

      return {
        ...col,
        width: customWidth ? `${customWidth}px` : col.width,
        label: displayLabel,
        _note: note?.note,
        _source: source,
        _originalIndex: i,
      };
    }).filter(Boolean) as Array<typeof config.columns[0] & { width: string; label: string; _note?: string; _source?: import('@/types').ColumnSource; _originalIndex: number }>;
  }, [settings.columnOrder, settings.visibleColumns, settings.columnWidths, settings.columnRenames, settings.columnNotes, settings.columnSources, config.columns]);

  // Handlers
  const handleSwitchView = useCallback((view: ModuleId | 'dashboard' | 'reports' | 'settings') => {
    if (view === 'dashboard' || view === 'reports' || view === 'settings') {
      showToast(`${view} coming soon!`, 'info');
      return;
    }
    if (view === 'invoicing') {
      setCurrentView(view);
      setCurrentViewTab(0);
      setCurrentPage(1);
      setSelectedRows(new Set());
      setSearchQuery('');
      setDateFrom('');
      setDateTo('');
      setDateField('');
      setPanelOpen(false);
      return;
    }
    setCurrentView(view);
    setCurrentViewTab(0);
    setCurrentPage(1);
    setSelectedRows(new Set());
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setDateField('');
    setPanelOpen(false);
    if (view === 'production-data') setActiveSubModule('register-jahit');
  }, [showToast]);

  // Switch sub-tab inside the combined "Production Data" view.
  // Filter/sort/search share one setting set, so reset them on switch.
  const handleSubTabChange = useCallback((sub: ModuleId) => {
    setActiveSubModule(sub);
    setCurrentPage(1);
    setSelectedRows(new Set());
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setDateField('');
    setPanelOpen(false);
  }, []);

  const handleToggleRow = useCallback((id: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedRows((prev) => {
      if (prev.size === paginatedData.length) return new Set();
      return new Set(paginatedData.map((r) => r.id as number));
    });
  }, [paginatedData]);

  const handleViewDetail = useCallback((id: number) => {
    const row = data.find((r) => r.id === id);
    if (row) {
      setPanelRow(row);
      setIsAddingNew(false);
      setPanelOpen(true);
    }
  }, [data]);

  const handleEditDetail = useCallback((id: number) => {
    const row = data.find((r) => r.id === id);
    if (row) {
      setPanelRow(row);
      setIsAddingNew(false);
      setPanelOpen(true);
    }
  }, [data]);

  const handleDeleteRow = useCallback(async (id: number) => {
    if (!confirm('Yakin ingin menghapus data ini?')) return;
    let error: Error | null = null;

    switch (effectiveModule) {
      case 'selesai-finishing':
      case 'selesai-jahit':
      case 'register-jahit': {
        const { error: e } = await supabase.from('work_orders').delete().eq('id', String(id));
        error = e;
        break;
      }
      case 'target-jahit': {
        const { error: e } = await targetJahitSvc.remove(id);
        error = e;
        break;
      }
      case 'daftar-libur': {
        const { error: e } = await daftarLiburSvc.remove(id);
        error = e;
        break;
      }
      case 'register-penjahit': {
        const { error: e } = await registerPenjahitSvc.remove(id);
        error = e;
        break;
      }
    }

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast('Data berhasil dihapus!', 'success');
      setPanelOpen(false);
      refetchTableData();
    }
  }, [effectiveModule, showToast, refetchTableData]);

  const handleAddNew = useCallback(() => {
    if (!config.editable) {
      showToast('This table is read-only (Sync from Supabase)', 'error');
      return;
    }
    setPanelRow({});
    setIsAddingNew(true);
    setPanelOpen(true);
  }, [config.editable, showToast]);

  const handleSaveData = useCallback(async (formData: Record<string, unknown>) => {
    let error: Error | null = null;

    if (isAddingNew) {
      switch (effectiveModule) {
        case 'selesai-finishing': {
          const { error: e } = await supabase.from('work_orders').insert(formData);
          error = e;
          break;
        }
        case 'target-jahit': {
          const { error: e } = await targetJahitSvc.create(formData as any);
          error = e;
          break;
        }
        case 'daftar-libur': {
          const { error: e } = await daftarLiburSvc.create(formData as any);
          error = e;
          break;
        }
        case 'register-penjahit': {
          const { error: e } = await registerPenjahitSvc.create(formData as any);
          error = e;
          break;
        }
        default: {
          const { error: e } = await supabase.from('work_orders').insert(formData);
          error = e;
        }
      }
    } else if (panelRow) {
      const id = panelRow.id as string | number;
      switch (effectiveModule) {
        case 'selesai-finishing':
        case 'selesai-jahit':
        case 'register-jahit': {
          const { error: e } = await supabase.from('work_orders').update(formData).eq('id', String(id));
          error = e;
          break;
        }
        case 'target-jahit': {
          const { error: e } = await targetJahitSvc.update(Number(id), formData as any);
          error = e;
          break;
        }
        case 'daftar-libur': {
          const { error: e } = await supabase.from('daftar_libur').update(formData).eq('id', Number(id));
          error = e;
          break;
        }
        case 'register-penjahit': {
          const { error: e } = await registerPenjahitSvc.update(Number(id), formData as any);
          error = e;
          break;
        }
        default: {
          const { error: e } = await supabase.from('work_orders').update(formData).eq('id', String(id));
          error = e;
        }
      }
    }

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast(isAddingNew ? 'Data berhasil ditambahkan!' : 'Data berhasil diupdate!', 'success');
      setPanelOpen(false);
      refetchTableData();
    }
  }, [effectiveModule, isAddingNew, panelRow, showToast, refetchTableData]);

  const handleRefresh = useCallback(() => {
    refetchTableData();
    showToast('Data refreshed from Supabase!', 'success');
  }, [refetchTableData, showToast]);

  const handleExport = useCallback(() => {
    showToast('Exporting to CSV...', 'success');
    setTimeout(() => showToast('CSV exported successfully!', 'success'), 1000);
  }, [showToast]);

  const handleImport = useCallback(() => {
    showToast('Import feature coming soon!', 'info');
  }, [showToast]);

  const handleCreateView = useCallback((name: string) => {
    updateModuleViews(currentView, (prev) => {
      const newIndex = prev.views.length;
      return {
        ...prev,
        views: [...prev.views, { name, icon: 'LayoutList' }],
        tabSettings: {
          ...prev.tabSettings,
          [newIndex]: makeDefaultSettings(currentView),
        },
      };
    });
    setCurrentViewTab(mv.views.length); // switch to the new view
    showToast(`View "${name}" created!`, 'success');
  }, [currentView, updateModuleViews, mv.views.length, showToast]);

  return (
    <>
      {viewMode === 'landing' && <Landing onEnterApp={() => setViewMode('app')} />}
      {viewMode === 'seed' && <SeedPage />}
      {viewMode === 'app' && (
    <AuthGate>
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onSwitchView={handleSwitchView}
        renames={sidebarRenames}
        onRename={(id, name) => setSidebarRenames((prev) => ({ ...prev, [id]: name }))}
        onViewLanding={() => setViewMode('landing')}
      />

      {/* Main Content */}
      {currentView === 'sewing-entry' ? (
        <SewingEntryForm onBack={() => setCurrentView('production-monitoring')} />
      ) : currentView === 'production-monitoring' ? (
        <ProductionMonitoring onOpenSewingEntry={() => setCurrentView('sewing-entry')} />
      ) : currentView === 'invoicing' ? (
        <InvoicingPage />
      ) : currentView === 'register-po' ? (
        <RegisterPoPage />
      ) : currentView === 'order-entry' ? (
        <OrderEntry />
      ) : (
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <TopBar currentView={currentView} onRefresh={handleRefresh} onAddNew={handleAddNew} />

        {/* View Tabs */}
        <ViewTabs
          views={mv.views}
          activeIndex={currentViewTab}
          onSwitch={setCurrentViewTab}
          onRemove={(i) => {
            if (mv.views.length <= 1) return;
            updateModuleViews(currentView, (prev) => {
              const views = [...prev.views];
              views.splice(i, 1);
              // rebuild tabSettings: shift indices after removed one
              const newTabSettings: Record<number, ViewTabSettings> = {};
              Object.entries(prev.tabSettings).forEach(([oldIdxStr, sett]) => {
                const oldIdx = parseInt(oldIdxStr);
                if (oldIdx === i) return; // skip removed
                if (oldIdx > i) {
                  newTabSettings[oldIdx - 1] = sett;
                } else {
                  newTabSettings[oldIdx] = sett;
                }
              });
              return { ...prev, views, tabSettings: newTabSettings };
            });
            setCurrentViewTab((prev) => (prev >= i && prev > 0 ? prev - 1 : prev));
            showToast('View deleted', 'success');
          }}
          onAdd={() => setModalOpen('addView')}
        />

        {/* Toolbar */}
        <Toolbar
          filterCount={settings.filters.length}
          groupCount={settings.groups.length}
          colorCount={settings.condColors.length}
          isReadOnly={!config.editable}
          dateRangeActive={!!(dateFrom || dateTo)}
          onCustomizeField={() => setModalOpen('customize')}
          onFilter={() => setModalOpen('filter')}
          onGroupBy={() => setModalOpen('group')}
          onSort={() => setModalOpen('sort')}
          onRowHeight={() => setModalOpen('rowHeight')}
          onCondColor={() => setModalOpen('condColor')}
          onDateRange={() => setModalOpen('dateRange')}
          onExport={handleExport}
          onImport={handleImport}
          subTabs={
            isCombinedView
              ? [
                  { id: 'register-jahit', label: 'Register Jahit' },
                  { id: 'daftar-libur', label: 'Daftar Libur' },
                  { id: 'register-penjahit', label: 'Register Penjahit' },
                ]
              : undefined
          }
          activeSub={isCombinedView ? activeSubModule : undefined}
          onSubTabChange={(id) => handleSubTabChange(id as ModuleId)}
        />

        {/* Search Bar */}
        <SearchBar
          query={searchQuery}
          onQueryChange={(q) => { setSearchQuery(q); setCurrentPage(1); }}
          recordCount={processedData.length}
        />

        {/* Data Table */}
        <DataTable
          columns={displayColumns}
          data={paginatedData}
          selectedRows={selectedRows}
          rowHeight={settings.rowHeight}
          condColors={settings.condColors}
          editable={config.editable}
          sorts={settings.sorts}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onViewDetail={handleViewDetail}
          onEditDetail={handleEditDetail}
          onDeleteRow={handleDeleteRow}
          onResizeColumn={(key, width) => {
            updateSettings(currentView, currentViewTab, (prev) => ({
              ...prev,
              columnWidths: { ...prev.columnWidths, [key]: width },
            }));
          }}
          onReorderColumn={(fromOrig, toOrig) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              const newOrder = [...prev.columnOrder];
              const fromPos = newOrder.indexOf(fromOrig);
              const toPos = newOrder.indexOf(toOrig);
              if (fromPos === -1 || toPos === -1) return prev;
              const [removed] = newOrder.splice(fromPos, 1);
              newOrder.splice(toPos, 0, removed);
              return { ...prev, columnOrder: newOrder };
            });
          }}
          onRenameColumn={(key, newName) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              const updated = [...prev.columnRenames];
              const idx = updated.findIndex((r) => r.columnKey === key);
              if (idx >= 0) updated[idx] = { columnKey: key, customName: newName };
              else updated.push({ columnKey: key, customName: newName });
              return { ...prev, columnRenames: updated };
            });
            showToast(`Column renamed to "${newName}"`, 'success');
          }}
          onUpdateNote={(key, note) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              const updated = [...prev.columnNotes];
              const idx = updated.findIndex((n) => n.columnKey === key);
              if (note) {
                if (idx >= 0) updated[idx] = { columnKey: key, note };
                else updated.push({ columnKey: key, note });
              } else if (idx >= 0) {
                updated.splice(idx, 1);
              }
              return { ...prev, columnNotes: updated };
            });
          }}
          onSortColumn={(field, dir) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              // Check if this field already has a sort
              const existing = prev.sorts.findIndex((s) => s.field === field);
              let newSorts = [...prev.sorts];
              if (existing >= 0) {
                newSorts[existing] = { field, dir };
              } else {
                newSorts.push({ field, dir });
              }
              return { ...prev, sorts: newSorts };
            });
            showToast(`Sorted ${field} ${dir === 'asc' ? 'ascending' : 'descending'}`, 'success');
          }}
          onGroupColumn={(field) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              const exists = prev.groups.some((g) => g.field === field);
              if (exists) return prev;
              return { ...prev, groups: [...prev.groups, { field }] };
            });
            showToast(`Grouped by ${field}`, 'success');
          }}
          onSetSource={(key, icon, label) => {
            updateSettings(currentView, currentViewTab, (prev) => {
              const updated = [...prev.columnSources];
              const idx = updated.findIndex((s) => s.columnKey === key);
              if (icon || label) {
                if (idx >= 0) updated[idx] = { columnKey: key, sourceIcon: icon, sourceLabel: label };
                else updated.push({ columnKey: key, sourceIcon: icon, sourceLabel: label });
              } else if (idx >= 0) {
                updated.splice(idx, 1);
              }
              return { ...prev, columnSources: updated };
            });
            showToast(`Source indicator updated for "${key}"`, 'success');
          }}
        />

        {/* Pagination */}
        <Pagination
          total={processedData.length}
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </main>
      )}

      {/* Detail Panel */}
      <DetailPanel
        open={panelOpen}
        moduleId={effectiveModule}
        row={panelRow}
        isAddingNew={isAddingNew}
        onClose={() => setPanelOpen(false)}
        onSave={handleSaveData}
        onDelete={handleDeleteRow}
        onRefresh={handleRefresh}
      />

      {/* Modals */}
      <CustomizeFieldModal
        open={modalOpen === 'customize'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        visibleColumns={settings.visibleColumns}
        columnNotes={settings.columnNotes}
        columnRenames={settings.columnRenames}
        onToggle={(i) => {
          updateSettings(currentView, currentViewTab, (prev) => {
            const visible = prev.visibleColumns.includes(i)
              ? prev.visibleColumns.filter((c) => c !== i)
              : [...prev.visibleColumns, i];
            return { ...prev, visibleColumns: visible };
          });
        }}
        onUpdateNotes={(notes) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, columnNotes: notes }))}
        onUpdateRenames={(renames) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, columnRenames: renames }))}
        onApply={() => { setModalOpen(null); showToast('Field settings updated!', 'success'); }}
      />

      <FilterModal
        open={modalOpen === 'filter'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        filters={settings.filters}
        onUpdate={(f) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, filters: f }))}
        onApply={() => { setModalOpen(null); showToast(`Filter applied! ${settings.filters.length} active filter(s)`, 'success'); }}
      />

      <DateRangeModal
        open={modalOpen === 'dateRange'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        dateField={dateField}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onUpdate={(f, from, to) => { setDateField(f); setDateFrom(from); setDateTo(to); }}
        onApply={() => {
          setModalOpen(null);
          if (dateFrom || dateTo) {
            showToast(`Date range ${dateFrom && dateTo ? `${dateFrom} \u2014 ${dateTo}` : dateFrom ? `from ${dateFrom}` : `until ${dateTo}`} applied!`, 'success');
          } else {
            showToast('Date range cleared', 'success');
          }
        }}
      />

      <GroupByModal
        open={modalOpen === 'group'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        groups={settings.groups}
        onUpdate={(g) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, groups: g }))}
        onApply={() => { setModalOpen(null); showToast(`Group by applied! ${settings.groups.length} group(s)`, 'success'); }}
      />

      <SortModal
        open={modalOpen === 'sort'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        sorts={settings.sorts}
        onUpdate={(s) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, sorts: s }))}
        onApply={() => { setModalOpen(null); showToast(`Sort applied! ${settings.sorts.length} sort(s)`, 'success'); }}
      />

      <RowHeightModal
        open={modalOpen === 'rowHeight'}
        onClose={() => setModalOpen(null)}
        currentHeight={settings.rowHeight}
        onSelect={(h) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, rowHeight: h }))}
        onApply={() => { setModalOpen(null); showToast('Row height updated!', 'success'); }}
      />

      <ConditionalColorModal
        open={modalOpen === 'condColor'}
        onClose={() => setModalOpen(null)}
        columns={config.columns}
        rules={settings.condColors}
        onUpdate={(c) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, condColors: c }))}
        onApply={() => { setModalOpen(null); showToast(`Conditional coloring applied! ${settings.condColors.length} rule(s)`, 'success'); }}
      />

      <AddViewModal
        open={modalOpen === 'addView'}
        onClose={() => setModalOpen(null)}
        onCreate={handleCreateView}
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
    </AuthGate>
      )}
    </>
  );
}
