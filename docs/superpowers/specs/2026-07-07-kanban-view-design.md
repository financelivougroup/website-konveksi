# Kanban View for Production Monitoring

**Date:** 2026-07-07  
**Status:** Approved for Implementation  
**Approach:** Simple CSS Grid Layout (Approach 1)

## Overview

Add a read-only Kanban view to the Production Monitoring page that visualizes work orders grouped by their production status. This provides a visual pipeline view of the manufacturing process from cutting through invoicing.

## Requirements

### Functional Requirements

1. **New Tab**: Add "Kanban" as the fourth tab in Production Monitoring (after RAW DATA, Cutting Log, Sewing Log)
2. **7 Column Layout**: Group work orders into 7 columns based on production and invoice status:
   - Cutting Pending (CUTTING_PENDING)
   - Cutting Complete (CUTTING_COMPLETE)
   - Sewing In Progress (SEWING_IN_PROGRESS)
   - Sewing Complete (SEWING_COMPLETE)
   - Finishing In Progress (FINISHING_IN_PROGRESS)
   - Finished (FINISHING_COMPLETE)
   - Invoiced (FINISHING_COMPLETE + invoiceStatus !== 'NONE')
3. **Read-Only View**: Cards cannot be dragged. Status changes only via other tabs (RAW DATA, Cutting Log, etc.)
4. **Search Integration**: Respect existing searchQuery state from ProductionMonitoring component
5. **Automatic Updates**: Cards automatically move to correct column when status changes elsewhere

### Display Requirements

Each Kanban card displays:
- Work Order ID (`id`)
- Customer Name (use `brand` field)
- Product Name (`product`)
- Quantity (`quantity`)
- Current Production Status (`productionStatus`)

## Architecture & Component Structure

### Tab Integration

```typescript
// Add to tabs array in ProductionMonitoring.tsx
const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'raw', label: 'RAW DATA', icon: '📋' },
  { id: 'cutting', label: 'Cutting Log', icon: '✂️' },
  { id: 'sewing', label: 'Sewing Log', icon: '🧵' },
  { id: 'kanban', label: 'Kanban', icon: '📊' }, // NEW
];
```

### Component Hierarchy

```
ProductionMonitoring (existing)
├── Tab Navigation (add 'kanban' tab)
└── activeTab === 'kanban' ? (new)
    └── KanbanView
        ├── KanbanColumn (× 7 columns)
        │   ├── Column Header (title + count badge)
        │   ├── Cards Container (scrollable)
        │   └── KanbanCard (× N cards per column)
        │       ├── Work Order ID
        │       ├── Customer (brand)
        │       ├── Product Name
        │       ├── Quantity
        │       └── Status Badge
        └── Empty State (when no work orders)
```

### File Structure

All implementation will be inline in `ProductionMonitoring.tsx` - no separate files needed. This maintains consistency with existing tabs (RAW DATA, Cutting Log, Sewing Log) which are all inline.

## Data Flow & Logic

### Grouping Work Orders by Status

```typescript
// Filter work orders for each column
const cuttingPendingWO = filteredWO.filter(w => w.productionStatus === 'CUTTING_PENDING');
const cuttingCompleteWO = filteredWO.filter(w => w.productionStatus === 'CUTTING_COMPLETE');
const sewingInProgressWO = filteredWO.filter(w => w.productionStatus === 'SEWING_IN_PROGRESS');
const sewingCompleteWO = filteredWO.filter(w => w.productionStatus === 'SEWING_COMPLETE');
const finishingInProgressWO = filteredWO.filter(w => w.productionStatus === 'FINISHING_IN_PROGRESS');
const finishedWO = filteredWO.filter(w => w.productionStatus === 'FINISHING_COMPLETE');

// Invoiced column: Finished + Invoice Status not NONE
const invoicedWO = filteredWO.filter(w => 
  w.productionStatus === 'FINISHING_COMPLETE' && 
  w.invoiceStatus !== 'NONE'
);
```

### Search Integration

- Kanban view uses the existing `searchQuery` state from ProductionMonitoring
- Filters by workCode, product, brand, warna (same as RAW DATA tab)
- Search persists when switching between tabs

### Reactivity

- Read-only view: no drag-and-drop implementation needed
- Uses React's existing state management (`mockWorkOrders`)
- When status changes in other tabs, React re-renders automatically move cards to correct columns
- No special card movement logic required

## UI Components & Styling

### KanbanCard Component Specifications

**Structure:**
```
┌─────────────────────────────────┐
│ WO-001            [Status]      │ ← Header: WO ID + Status badge
│                                 │
│ Nike                            │ ← Brand (customer)
│ T-Shirt Basic Navy              │ ← Product name
│                                 │
│ QUANTITY                        │ ← Label
│ 500 pcs                         │ ← Value
└─────────────────────────────────┘
```

**Typography:**
- Work Order ID: 18px, font-weight 700
- Brand: 14px, font-weight 500, gray (#6B7280)
- Product Name: 16px, font-weight 600
- Quantity Label: 12px, uppercase, gray
- Quantity Value: 18px, font-weight 700
- Status Badge: 12px, font-weight 600, rounded pill

**Layout:**
- Card width: 320-360px (desktop), full width (mobile)
- Border radius: 18px
- Padding: 20-24px
- Background: white
- Border: 1px solid #E5E7EB
- Soft layered shadow

**Spacing:**
- 20px outer padding
- 16px between header and body
- 12px between Brand and Product Name
- 20px between body and footer

**Hover Animation:**
- Transform: translateY(-2px) scale(1.01)
- Shadow: stronger
- Transition: 200ms ease-out
- Cursor: pointer

**No Drag Animations:** Read-only view - no drag-and-drop styling needed

### Status Badge Colors

```typescript
const kanbanStatusColors = {
  'CUTTING_PENDING': 'bg-amber-100 text-amber-700',
  'CUTTING_COMPLETE': 'bg-sky-100 text-sky-700',
  'SEWING_IN_PROGRESS': 'bg-indigo-100 text-indigo-700',
  'SEWING_COMPLETE': 'bg-purple-100 text-purple-700',
  'FINISHING_IN_PROGRESS': 'bg-pink-100 text-pink-700',
  'FINISHING_COMPLETE': 'bg-emerald-100 text-emerald-700',
  'INVOICED': 'bg-gray-100 text-gray-700',
};
```

### Kanban Container Layout

- CSS Grid with 7 columns
- Fixed column width: 320-360px
- Horizontal scroll on smaller screens
- Gap between columns: 16px
- Container padding: consistent with existing tabs

### Column Component

**Header:**
- Status label (from `productionStatusLabel`)
- Count badge (number of cards)
- Background color matching status

**Body:**
- Vertical stack of cards
- Gap between cards: 12px
- Scrollable container (max-height + overflow-y-auto)
- Min-height to show at least one card height

**Empty State:**
- "No work orders" message
- Icon (optional)
- Centered text, gray color

## Edge Cases & Error Handling

### Empty Column
- Display "No work orders" message
- Keep column visible (don't hide empty columns)
- Maintain consistent column widths

### Many Cards in Column
- Column becomes scrollable (overflow-y-auto)
- Max height: viewport height minus header/padding
- Smooth scroll behavior

### Search Filter
- When search returns no results: all columns empty
- Show global "No results found" message above columns
- Clear search to restore all work orders

### Status Transition
- Card disappears from old column via React re-render
- Card appears in new column automatically
- No animation needed (instant update is acceptable)

### Responsive Behavior
- **Desktop (>1200px)**: 7 columns side-by-side, horizontal scroll if needed
- **Tablet (768-1200px)**: Horizontal scroll, 7 columns maintain width
- **Mobile (<768px)**: Horizontal scroll, cards full-width within column

## Implementation Approach

**Chosen Approach:** Simple CSS Grid Layout (Approach 1)

**Rationale:**
- Read-only view doesn't need drag-and-drop library complexity
- Consistent with existing codebase patterns (Tailwind CSS + simple React components)
- No external dependencies needed
- Lightweight and performant
- Easy to maintain and understand

**Alternative Approaches Considered:**
1. ~~Kanban Library (react-beautiful-dnd)~~ - Rejected: overkill for read-only view, adds unnecessary bundle size
2. ~~Custom Horizontal Scroll with Advanced Features~~ - Rejected: over-engineering for current requirements

## Testing Considerations

### Manual Testing Checklist
1. Switch to Kanban tab - verify 7 columns render correctly
2. Verify cards display correct data (WO ID, brand, product, quantity, status)
3. Change status in Cutting Log tab - verify card moves in Kanban view
4. Test search functionality - verify filtering works across all columns
5. Test with empty columns - verify empty state displays
6. Test with many cards in one column - verify scrolling works
7. Test responsive behavior on different screen sizes
8. Test hover states on cards

### Edge Cases to Test
- All work orders in one status (6 empty columns)
- No work orders (all columns empty)
- Search with no results
- Status transitions (cutting → sewing → finishing → invoiced)
- Very long product names (truncation if needed)

## Future Enhancements (Out of Scope)

The following are NOT included in this initial implementation:
- Drag-and-drop to change status
- Inline editing of card fields
- Card detail modal/drawer
- Print/export Kanban view
- Custom column ordering
- Column collapse/expand
- WIP limits per column
- Card color coding by priority/brand

These can be considered for future iterations based on user feedback.

## Implementation Files

### Files to Modify
1. `src/pages/ProductionMonitoring.tsx`
   - Add 'kanban' to TabType
   - Add 'kanban' tab to tabs array
   - Add Kanban view rendering in tab content section
   - Implement KanbanColumn and KanbanCard components inline

### Files to Reference
- `src/types/pipeline.ts` - ProductionStatus, InvoiceStatus types
- `src/data/pipelineData.ts` - mockWorkOrders data source

### No New Files Needed
All components will be inline in ProductionMonitoring.tsx to maintain consistency with existing tab implementations.

---

**Approved by:** User  
**Ready for Implementation:** Yes  
**Next Step:** Create implementation plan via writing-plans skill
