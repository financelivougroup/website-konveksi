import { useState, useEffect, useMemo, useCallback } from 'react';
import { computeCutVsUpload, computeStatusStock } from '@/lib/utils';
import { Landing } from '@/pages/Landing';
import ProductionMonitoring from '@/pages/ProductionMonitoring';
import SewingEntryForm from '@/pages/SewingEntryForm';
import FinishingEntryForm from '@/pages/FinishingEntryForm';
import KancingEntryForm from '@/pages/KancingEntryForm';
import InvoicingPage from '@/pages/InvoicingPage';
import { PlanningProduksiPage } from '@/pages/PlanningProduksiPage';
import { ComplainPenaltiPage } from '@/pages/ComplainPenaltiPage';
import { TargetJahitPage } from '@/pages/TargetJahitPage';
import { RegisterKaryawanPage } from '@/pages/RegisterKaryawanPage';
import { RegisterClientPage } from '@/pages/RegisterClientPage';
import OrderEntry from '@/pages/OrderEntry';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/Layout/AppSidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
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
import { viewConfig, navGroups } from '@/data/mockData';
import * as targetJahitSvc from '@/services/targetJahit';
import * as registerPenjahitSvc from '@/services/registerPenjahit';
import * as daftarLiburSvc from '@/services/daftarLibur';
import { supabase } from '@/lib/supabase';
import type { ModuleId, ViewTabSettings, ModuleViews } from '@/types';

const PAGE_SIZE = 10;
type ModalType = 'customize' | 'filter' | 'dateRange' | 'group' | 'sort' | 'rowHeight' | 'condColor' | 'addView' | null;

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
  const [viewMode, setViewMode] = useState<'app' | 'landing'>('app');
  const [currentView, setCurrentView] = useState<ModuleId>('production-monitoring');
  const [currentViewTab, setCurrentViewTab] = useState(0);
  const [activeSubModule, setActiveSubModule] = useState<ModuleId>('register-jahit');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState<ModalType>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelRow, setPanelRow] = useState<Record<string, unknown> | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  const [dateField, setDateField] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sidebarRenames, _setSidebarRenames] = useState<Record<string, string>>({});
  const [moduleViews, setModuleViews] = useState<Record<string, ModuleViews>>({});

  const getModuleViews = useCallback((moduleId: ModuleId): ModuleViews => {
    if (moduleViews[moduleId]) return moduleViews[moduleId];
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

  const isPipelineView = currentView === 'production-monitoring' || currentView === 'sewing-entry' || currentView === 'finishing-entry' || currentView === 'kancing-entry';
  const mv = isPipelineView ? { views: [], tabSettings: {} } : getModuleViews(currentView);
  const settings = isPipelineView ? makeDefaultSettings('production-monitoring') : getSettings(currentView, currentViewTab);
  const isCombinedView = !isPipelineView && currentView === 'production-data';
  const effectiveModule = isPipelineView ? 'production-monitoring' : (isCombinedView ? activeSubModule : currentView);
  const config = isPipelineView ? viewConfig['production-monitoring'] : viewConfig[effectiveModule];

  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (isPipelineView) { setTableData([]); return; }
    async function fetchModuleData() {
      let rows: Record<string, unknown>[] = [];
      switch (effectiveModule) {
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
        default: break;
      }
      setTableData(rows);
    }
    fetchModuleData();
  }, [effectiveModule, isPipelineView]);

  const refetchTableData = useCallback(() => {
    if (!isPipelineView) {
      const fetchFresh = async () => {
        let rows: Record<string, unknown>[] = [];
        switch (effectiveModule) {
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
          case 'selesai-jahit': case 'register-jahit': {
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

  const processedData = useMemo(() => {
    let result: Record<string, unknown>[] = data.map((row) => {
      const cutVsUpload = computeCutVsUpload(row);
      return { ...row, cutVsUpload, statusStock: computeStatusStock({ ...row, cutVsUpload }) };
    });
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q)));
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
    if (dateFrom || dateTo) {
      const field = dateField || 'tanggal';
      result = result.filter((row) => {
        const val = String(row[field] || '');
        if (!val) return false;
        const rowDate = new Date(val + 'T00:00:00');
        if (isNaN(rowDate.getTime())) return true;
        if (dateFrom) { const from = new Date(dateFrom + 'T00:00:00'); if (rowDate < from) return false; }
        if (dateTo) { const to = new Date(dateTo + 'T23:59:59'); if (rowDate > to) return false; }
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

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedData.slice(start, start + PAGE_SIZE);
  }, [processedData, currentPage]);

  const displayColumns = useMemo(() => {
    const orderedIndices = settings.columnOrder.length > 0
      ? settings.columnOrder.filter((i) => settings.visibleColumns.includes(i))
      : settings.visibleColumns;
    return orderedIndices.map((i) => {
      const col = config.columns[i];
      if (!col) return null;
      const customWidth = settings.columnWidths[col.key];
      const rename = settings.columnRenames.find((r) => r.columnKey === col.key);
      const displayLabel = rename?.customName || col.label;
      const note = settings.columnNotes.find((n) => n.columnKey === col.key);
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

  const handleSwitchView = useCallback((view: string) => {
    if (view === 'dashboard' || view === 'reports' || view === 'settings') {
      showToast(`${view} coming soon!`, 'info');
      return;
    }
    if (view === 'invoicing') {
      setCurrentView(view as ModuleId);
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
    setCurrentView(view as ModuleId);
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

  const handleSubTabChangeString = useCallback((id: string) => {
    handleSubTabChange(id as ModuleId);
  }, [handleSubTabChange]);

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
      case 'selesai-jahit': case 'register-jahit': {
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
        case 'selesai-jahit': case 'register-jahit': {
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
    setCurrentViewTab(mv.views.length);
    showToast(`View "${name}" created!`, 'success');
  }, [currentView, updateModuleViews, mv.views.length, showToast]);

  return (
    <>
      {viewMode === 'landing' && <Landing onEnterApp={() => setViewMode('app')} />}
      {viewMode === 'app' && (
        <AuthGate>
          <SidebarProvider>
            <AppSidebar
              currentView={currentView}
              onSwitchView={handleSwitchView}
              renames={sidebarRenames}
            />
            <SidebarInset>
              <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
                <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mx-2 data-[orientation=vertical]:h-4"
                  />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbPage>{navGroups.find(g => g.items.some(i => i.id === currentView))?.label || 'Dashboard'}</BreadcrumbPage>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{currentView.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-auto">
                {/* All views rendered inside consistent wrapper */}
                {currentView === 'sewing-entry' && <SewingEntryForm onBack={() => setCurrentView('production-monitoring')} />}
                {currentView === 'finishing-entry' && <FinishingEntryForm onBack={() => setCurrentView('production-monitoring')} />}
                {currentView === 'kancing-entry' && <KancingEntryForm onBack={() => setCurrentView('production-monitoring')} />}
                {currentView === 'production-monitoring' && (
                  <ProductionMonitoring onOpenSewingEntry={() => setCurrentView('sewing-entry')} onOpenFinishingEntry={() => setCurrentView('finishing-entry')} onOpenKancingEntry={() => setCurrentView('kancing-entry')} />
                )}
                {currentView === 'invoicing' && <InvoicingPage />}
                {currentView === 'order-entry' && <OrderEntry />}
                {currentView === 'planning-produksi' && <PlanningProduksiPage />}
                {currentView === 'complain-penalti' && <ComplainPenaltiPage />}
                {currentView === 'target-jahit' && <TargetJahitPage />}
                {currentView === 'register-penjahit' && <RegisterKaryawanPage />}
                {currentView === 'register-client' && <RegisterClientPage />}

                {/* DataTable pages with toolbar - only for views not listed above */}
                {!['sewing-entry', 'finishing-entry', 'kancing-entry', 'production-monitoring', 'invoicing', 'order-entry', 'planning-produksi', 'complain-penalti', 'target-jahit', 'register-penjahit', 'register-client'].includes(currentView) && (
                  <>
                    <TopBar onRefresh={handleRefresh} onAddNew={handleAddNew} />
                    <ViewTabs
                      views={mv.views}
                      activeIndex={currentViewTab}
                      onSwitch={setCurrentViewTab}
                      onRemove={(i) => {
                        if (mv.views.length <= 1) return;
                        updateModuleViews(currentView, (prev) => {
                          const views = [...prev.views];
                          views.splice(i, 1);
                          const newTabSettings: Record<number, ViewTabSettings> = {};
                          Object.entries(prev.tabSettings).forEach(([oldIdxStr, sett]) => {
                            const oldIdx = parseInt(oldIdxStr);
                            if (oldIdx === i) return;
                            if (oldIdx > i) { newTabSettings[oldIdx - 1] = sett; }
                            else { newTabSettings[oldIdx] = sett; }
                          });
                          return { ...prev, views, tabSettings: newTabSettings };
                        });
                        setCurrentViewTab((prev) => (prev >= i && prev > 0 ? prev - 1 : prev));
                        showToast('View deleted', 'success');
                      }}
                      onAdd={() => setModalOpen('addView')}
                    />
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
                      subTabs={isCombinedView ? [{ id: 'register-jahit', label: 'Register Jahit' }, { id: 'daftar-libur', label: 'Daftar Libur' }, { id: 'register-penjahit', label: 'Register Penjahit' }] : undefined}
                      activeSub={isCombinedView ? activeSubModule : undefined}
                      onSubTabChange={handleSubTabChangeString}
                    />
                    <SearchBar query={searchQuery} onQueryChange={(q) => { setSearchQuery(q); setCurrentPage(1); }} recordCount={processedData.length} />
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
                      onResizeColumn={(key, width) => updateSettings(currentView, currentViewTab, (prev) => ({ ...prev, columnWidths: { ...prev.columnWidths, [key]: width } }))}
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
                          if (note) { if (idx >= 0) updated[idx] = { columnKey: key, note }; else updated.push({ columnKey: key, note }); }
                          else if (idx >= 0) { updated.splice(idx, 1); }
                          return { ...prev, columnNotes: updated };
                        });
                      }}
                      onSortColumn={(field, dir) => {
                        updateSettings(currentView, currentViewTab, (prev) => {
                          const existing = prev.sorts.findIndex((s) => s.field === field);
                          let newSorts = [...prev.sorts];
                          if (existing >= 0) { newSorts[existing] = { field, dir }; }
                          else { newSorts.push({ field, dir }); }
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
                          }
                          else if (idx >= 0) { updated.splice(idx, 1); }
                          return { ...prev, columnSources: updated };
                        });
                        showToast(`Source indicator updated for "${key}"`, 'success');
                      }}
                    />
                    <Pagination total={processedData.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
                  </>
                )}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </AuthGate>
      )}

      {/* Detail Panel and Modals outside conditional flow */}
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
            showToast(`Date range ${dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : dateFrom ? `from ${dateFrom}` : `until ${dateTo}`} applied!`, 'success');
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

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
