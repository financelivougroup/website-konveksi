import { useState, useCallback } from 'react';
import type { ModuleId, ViewTabSettings, FilterRule, GroupRule, SortRule, CondColorRule } from '@/types';
import { viewConfig } from '@/data/mockData';

function createDefaultSettings(moduleId: ModuleId): ViewTabSettings {
  const config = viewConfig[moduleId];
  return {
    visibleColumns: config.columns.map((_, i) => i),
    columnOrder: config.columns.map((_, i) => i),
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

export function useViewSettings(moduleId: ModuleId) {
  const [allSettings, setAllSettings] = useState<Record<string, ViewTabSettings>>({});

  const settings = allSettings[moduleId] || createDefaultSettings(moduleId);

  const updateSettings = useCallback((updater: (prev: ViewTabSettings) => ViewTabSettings) => {
    setAllSettings((prev) => ({
      ...prev,
      [moduleId]: updater(prev[moduleId] || createDefaultSettings(moduleId)),
    }));
  }, [moduleId]);

  const setVisibleColumns = useCallback((cols: number[]) => {
    updateSettings((prev) => ({ ...prev, visibleColumns: cols }));
  }, [updateSettings]);

  const setFilters = useCallback((filters: FilterRule[]) => {
    updateSettings((prev) => ({ ...prev, filters }));
  }, [updateSettings]);

  const setGroups = useCallback((groups: GroupRule[]) => {
    updateSettings((prev) => ({ ...prev, groups }));
  }, [updateSettings]);

  const setSorts = useCallback((sorts: SortRule[]) => {
    updateSettings((prev) => ({ ...prev, sorts }));
  }, [updateSettings]);

  const setRowHeight = useCallback((height: ViewTabSettings['rowHeight']) => {
    updateSettings((prev) => ({ ...prev, rowHeight: height }));
  }, [updateSettings]);

  const setCondColors = useCallback((colors: CondColorRule[]) => {
    updateSettings((prev) => ({ ...prev, condColors: colors }));
  }, [updateSettings]);

  const addView = useCallback((_name: string) => {
    // Views are now managed in ModuleViews in App.tsx
  }, []);

  const removeView = useCallback((_index: number) => {
    // Views are now managed in ModuleViews in App.tsx
  }, []);

  return {
    settings,
    setVisibleColumns,
    setFilters,
    setGroups,
    setSorts,
    setRowHeight,
    setCondColors,
    addView,
    removeView,
  };
}
