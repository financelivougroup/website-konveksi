import { useState, useEffect } from 'react'
import { TrendingUpIcon, TrendingDownIcon, ClipboardListIcon, TargetIcon, ClockIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import * as workOrderSvc from '@/services/workOrders'
import * as targetJahitSvc from '@/services/targetJahit'
import type { WorkOrder } from '@/types/pipeline'
import type { TargetJahitRow } from '@/services/targetJahit'

interface DashboardMetrics {
  totalOrders: number
  activeOrders: number
  completionRate: number
  pendingPenalty: number
}

export function ProductionDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalOrders: 0,
    activeOrders: 0,
    completionRate: 0,
    pendingPenalty: 0,
  })

  useEffect(() => {
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    try {
      const woResult = await workOrderSvc.fetchAll()
      const tjResult = await targetJahitSvc.fetchAll()

      if (woResult.data) {
        const orders: WorkOrder[] = woResult.data
        const targets: TargetJahitRow[] = tjResult.data || []

        const total = orders.length
        const active = orders.filter((o) => ['CUTTING', 'PROGRESS'].includes(o.productionStatus)).length
        const completed = orders.filter((o) => o.productionStatus === 'FINISHED').length
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0

        setMetrics({
          totalOrders: total,
          activeOrders: active,
          completionRate: rate,
          pendingPenalty: targets?.filter((t) => t.selisih_accum && t.selisih_accum !== 0).length || 0,
        })
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
    }
  }

  return (
    <div className="*:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card lg:px-6">
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Total Orders</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {metrics.totalOrders}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              <ClipboardListIcon className="size-3" />
              All Orders
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Total production orders
          </div>
        </CardContent>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Active Orders</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {metrics.activeOrders}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs bg-sky-50 text-sky-600">
              <ClockIcon className="size-3" />
              In Process
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Currently being processed
          </div>
        </CardContent>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Completion Rate</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {metrics.completionRate}%
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              {metrics.completionRate >= 80 ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
              {metrics.completionRate >= 80 ? '+ Good' : '- Review'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {metrics.completionRate >= 80 ? 'On track performance' : 'Needs attention'}
          </div>
        </CardContent>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Pending Penalties</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {metrics.pendingPenalty}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs bg-destructive/10 text-destructive">
              <TargetIcon className="size-3" />
              Needs Review
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Quality issues requiring attention
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
