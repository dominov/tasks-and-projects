import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseIsoDate,
  toIsoDate,
} from '../../common/businessDays'
import type { Project, TaskUpdatePayload, TaskWithRelations } from '../../common/types'

interface GanttViewProps {
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  presentationMode: boolean
  onTogglePresentationMode: () => void
}

const ROW_HEIGHT = 36
const BAR_VERTICAL_PADDING = 6
const MIN_WEEKDAY_WIDTH = 24
const WEEKEND_WIDTH_RATIO = 0.5
const HEADER_HEIGHT = 56
const DEFAULT_SIDE_PANEL_WIDTH = 220
const MIN_SIDE_PANEL_WIDTH = 180
const MAX_SIDE_PANEL_WIDTH = 560
const DAYS_BEFORE_TODAY = 30
const DAYS_AFTER_TODAY = 60

interface DayCell {
  date: Date
  iso: string
  isWeekend: boolean
  width: number
  offset: number
}

interface PositionedTask {
  row: GanttRow
  task: TaskWithRelations
  startIdx: number
  endIdx: number
  left: number
  width: number
}

interface GanttRow {
  task: TaskWithRelations
  level: number
  hasChildren: boolean
}

interface DragState {
  taskId: number
  mode: 'move' | 'resize'
  pointerStartX: number
  originalStartIso: string | null
  originalEndIso: string | null
  deltaDays: number
}

interface PanelResizeState {
  pointerStartX: number
  initialWidth: number
}

function GanttView({
  tasks,
  projects,
  onSelectTask,
  selectedTaskId,
  onUpdateTask,
  presentationMode,
  onTogglePresentationMode,
}: GanttViewProps) {
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [panelResize, setPanelResize] = useState<PanelResizeState | null>(null)
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH)
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Observe canvas width so the timeline reflows when the right details
  // sidebar pushes the main canvas (Tarea 5: Push Sidebar responsive).
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    const measure = () => setContainerWidth(node.clientWidth)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const projectColorById = useMemo(() => {
    const map = new Map<number, string>()
    for (const project of projects) {
      map.set(project.id, project.color)
    }
    return map
  }, [projects])

  const datedTasks = useMemo(() => tasks.filter((task) => Boolean(task.start_date || task.end_date)), [tasks])

  const goalTasks = useMemo(() => datedTasks.filter((task) => task.type === 'goal'), [datedTasks])

  const childrenByParent = useMemo(() => {
    const map = new Map<number, TaskWithRelations[]>()
    for (const task of datedTasks) {
      if (!task.parent_task_id) {
        continue
      }
      const list = map.get(task.parent_task_id) ?? []
      list.push(task)
      map.set(task.parent_task_id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aIso = a.start_date ?? a.end_date ?? ''
        const bIso = b.start_date ?? b.end_date ?? ''
        return aIso.localeCompare(bIso)
      })
    }
    return map
  }, [datedTasks])

  const rows = useMemo<GanttRow[]>(() => {
    if (goalTasks.length === 0) {
      return []
    }

    const sortedGoals = [...goalTasks].sort((a, b) => {
      const aIso = a.start_date ?? a.end_date ?? ''
      const bIso = b.start_date ?? b.end_date ?? ''
      return aIso.localeCompare(bIso)
    })

    const result: GanttRow[] = []
    const pushChildren = (parentId: number, level: number) => {
      const children = childrenByParent.get(parentId) ?? []
      for (const child of children) {
        const childRows = childrenByParent.get(child.id) ?? []
        const hasChildren = childRows.length > 0
        result.push({ task: child, level, hasChildren })
        const isExpanded = expandedRows[child.id] ?? true
        if (hasChildren && isExpanded) {
          pushChildren(child.id, level + 1)
        }
      }
    }

    for (const goal of sortedGoals) {
      const goalChildren = childrenByParent.get(goal.id) ?? []
      const hasChildren = goalChildren.length > 0
      result.push({ task: goal, level: 0, hasChildren })
      const isExpanded = expandedRows[goal.id] ?? true
      if (hasChildren && isExpanded) {
        pushChildren(goal.id, 1)
      }
    }

    return result
  }, [childrenByParent, expandedRows, goalTasks])

  // Build a fixed window: 30 days before today and 60 days after today.
  const days = useMemo<DayCell[]>(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - DAYS_BEFORE_TODAY)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DAYS_AFTER_TODAY)

    const cells: DayCell[] = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate())

    const available = Math.max(containerWidth - sidePanelWidth, 320)

    // First pass: collect calendar days + which are weekends.
    while (cursor <= stop) {
      const dayOfWeek = cursor.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      cells.push({
        date: new Date(cursor),
        iso: toIsoDate(cursor),
        isWeekend,
        width: 0,
        offset: 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    // Calculate weekday width so weekend columns can be exactly 50% wide and
    // the whole timeline fits the available canvas (with a minimum to keep
    // bars graspable).
    const weekdayUnits = cells.reduce((acc, cell) => acc + (cell.isWeekend ? WEEKEND_WIDTH_RATIO : 1), 0)
    const weekdayWidth = Math.max(MIN_WEEKDAY_WIDTH, available / Math.max(weekdayUnits, 1))

    let offset = 0
    for (const cell of cells) {
      cell.width = cell.isWeekend ? weekdayWidth * WEEKEND_WIDTH_RATIO : weekdayWidth
      cell.offset = offset
      offset += cell.width
    }

    return cells
  }, [containerWidth, sidePanelWidth])

  const totalTimelineWidth = days.length > 0 ? days[days.length - 1].offset + days[days.length - 1].width : 0

  const indexByIso = useMemo(() => {
    const map = new Map<string, number>()
    days.forEach((cell, index) => map.set(cell.iso, index))
    return map
  }, [days])

  const positionedTasks = useMemo<PositionedTask[]>(() => {
    if (days.length === 0) {
      return []
    }

    const lastIndex = days.length - 1
    const findIndex = (iso: string): number => {
      if (indexByIso.has(iso)) {
        return indexByIso.get(iso) as number
      }
      // Date outside the visible window: clamp to nearest edge.
      const target = parseIsoDate(iso).getTime()
      if (target < days[0].date.getTime()) return 0
      return lastIndex
    }

    return rows.map((row) => {
      const { task } = row
      const startIso = task.start_date ?? task.end_date
      const endIso = task.end_date ?? task.start_date
      const startIdx = findIndex(startIso ?? days[0].iso)
      const endIdx = findIndex(endIso ?? days[lastIndex].iso)
      const safeStart = Math.min(startIdx, endIdx)
      const safeEnd = Math.max(startIdx, endIdx)
      const left = days[safeStart].offset
      const width = days[safeEnd].offset + days[safeEnd].width - left
      return { row, task, startIdx: safeStart, endIdx: safeEnd, left, width }
    })
  }, [days, indexByIso, rows])

  // --- Drag & resize ---------------------------------------------------------

  const averageDayWidth = useMemo(() => {
    if (days.length === 0) return MIN_WEEKDAY_WIDTH
    return totalTimelineWidth / days.length
  }, [days.length, totalTimelineWidth])

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, task: TaskWithRelations, mode: 'move' | 'resize') => {
      if (task.type === 'goal') {
        // Goal dates are derived from subtasks; keep them read-only.
        return
      }
      event.stopPropagation()
      event.preventDefault()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      setDragState({
        taskId: task.id,
        mode,
        pointerStartX: event.clientX,
        originalStartIso: task.start_date,
        originalEndIso: task.end_date,
        deltaDays: 0,
      })
    },
    [],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (panelResize) {
        const deltaPx = event.clientX - panelResize.pointerStartX
        const nextWidth = Math.max(
          MIN_SIDE_PANEL_WIDTH,
          Math.min(MAX_SIDE_PANEL_WIDTH, panelResize.initialWidth + deltaPx),
        )

        if (nextWidth !== sidePanelWidth) {
          setSidePanelWidth(nextWidth)
        }
        return
      }

      if (!dragState) return
      const deltaPx = event.clientX - dragState.pointerStartX
      const deltaDays = Math.round(deltaPx / Math.max(averageDayWidth, 1))
      if (deltaDays === dragState.deltaDays) return
      setDragState({ ...dragState, deltaDays })
    },
    [averageDayWidth, dragState, panelResize, sidePanelWidth],
  )

  const handlePointerUp = useCallback(
    async (event: React.PointerEvent<HTMLElement>) => {
      if (panelResize) {
        setPanelResize(null)
        return
      }

      if (!dragState) return
      try {
        ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      const { taskId, mode, deltaDays, originalStartIso, originalEndIso } = dragState
      setDragState(null)

      if (deltaDays === 0) {
        return
      }

      if (mode === 'move') {
        const nextStart = originalStartIso ? shiftIsoDate(originalStartIso, deltaDays) : null
        const nextEnd = originalEndIso ? shiftIsoDate(originalEndIso, deltaDays) : null
        const payload: TaskUpdatePayload = {}
        if (nextStart !== null) payload.start_date = nextStart
        if (nextEnd !== null) payload.end_date = nextEnd
        await onUpdateTask(taskId, payload, 'Task rescheduled.')
        return
      }

      // Resize: only end_date moves; the cascade engine kicks in when end_date
      // changes (see main.ts tasks:update).
      if (!originalEndIso) {
        return
      }
      const nextEnd = shiftIsoDate(originalEndIso, deltaDays)
      // Guard: end can't move before start.
      if (originalStartIso && nextEnd < originalStartIso) {
        return
      }
      await onUpdateTask(taskId, { end_date: nextEnd }, 'Task duration updated.')
    },
    [dragState, onUpdateTask, panelResize],
  )

  const liveDelta = dragState ? dragState.deltaDays : 0
  const liveDeltaPx = liveDelta * averageDayWidth

  const beginPanelResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      setPanelResize({
        pointerStartX: event.clientX,
        initialWidth: sidePanelWidth,
      })
    },
    [sidePanelWidth],
  )

  // --- Render ----------------------------------------------------------------

  const toggleExpanded = (taskId: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [taskId]: !(prev[taskId] ?? true),
    }))
  }

  return (
    <section
      className={`gantt-view${presentationMode ? ' gantt-view--presentation' : ''}`}
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <header className="gantt-toolbar">
        <div className="gantt-toolbar-left">
          <h2>Goals timeline</h2>
        </div>
        <button
          type="button"
          className="gantt-presentation-toggle"
          onClick={onTogglePresentationMode}
          aria-pressed={presentationMode}
        >
          {presentationMode ? 'Exit presentation' : 'Presentation mode'}
        </button>
      </header>

      {days.length === 0 ? (
        <p className="muted">No timeline window available.</p>
      ) : rows.length === 0 ? (
        <p className="muted">No goals with dated subtasks to display.</p>
      ) : (
        <div className="gantt-scroll">
          <div className="gantt-canvas" style={{ minWidth: `${sidePanelWidth + totalTimelineWidth}px` }}>
            <GanttHeader
              days={days}
              sidePanelWidth={sidePanelWidth}
              onBeginResize={beginPanelResize}
              isResizing={Boolean(panelResize)}
            />

            <div className="gantt-body">
              {positionedTasks.map((entry, rowIndex) => {
                const { task, row, left, width } = entry
                const projectColor = task.project_id ? projectColorById.get(task.project_id) ?? '#475569' : '#475569'
                const isDragging = dragState?.taskId === task.id
                const adjustedLeft = isDragging && dragState?.mode === 'move' ? left + liveDeltaPx : left
                const adjustedWidth =
                  isDragging && dragState?.mode === 'resize' ? Math.max(MIN_WEEKDAY_WIDTH, width + liveDeltaPx) : width
                const isGoal = task.type === 'goal'
                const isExpanded = expandedRows[task.id] ?? true

                return (
                  <div className={`gantt-row${isGoal ? ' is-goal' : ''}`} key={task.id} style={{ height: ROW_HEIGHT }}>
                    <div className="gantt-row-label" style={{ width: sidePanelWidth }}>
                      <div className="gantt-row-label-content" style={{ paddingLeft: `${row.level * 14}px` }}>
                        {row.hasChildren ? (
                          <button
                            type="button"
                            className="gantt-row-expander"
                            onClick={() => toggleExpanded(task.id)}
                            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                            title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        ) : (
                          <span className="gantt-row-expander-placeholder" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className={
                            selectedTaskId === task.id ? 'gantt-row-title is-active' : 'gantt-row-title'
                          }
                          onClick={() => onSelectTask(task.id)}
                          title={task.title}
                        >
                          {task.title}
                        </button>
                      </div>
                    </div>
                    <div className="gantt-row-track" style={{ height: ROW_HEIGHT }}>
                      {days.map((cell, idx) => (
                        <div
                          key={cell.iso}
                          className={`gantt-cell${cell.isWeekend ? ' is-weekend' : ''}`}
                          style={{
                            left: cell.offset,
                            width: cell.width,
                            height: ROW_HEIGHT,
                            zIndex: idx,
                          }}
                          aria-hidden="true"
                        />
                      ))}
                      <div
                        className={`gantt-bar${isDragging ? ' is-dragging' : ''}${
                          selectedTaskId === task.id ? ' is-selected' : ''
                        }${isGoal ? ' is-goal' : ''}`}
                        style={{
                          left: adjustedLeft,
                          width: adjustedWidth,
                          top: BAR_VERTICAL_PADDING,
                          height: ROW_HEIGHT - BAR_VERTICAL_PADDING * 2,
                          background: projectColor,
                          zIndex: 100 + rowIndex,
                        }}
                        onPointerDown={(event) => beginDrag(event, task, 'move')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectTask(task.id)
                        }}
                      >
                        <span className="gantt-bar-label">{task.title}</span>
                        {!isGoal ? (
                          <span
                            className="gantt-bar-handle"
                            onPointerDown={(event) => beginDrag(event, task, 'resize')}
                            aria-label="Resize end date"
                            role="button"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

interface GanttHeaderProps {
  days: DayCell[]
  sidePanelWidth: number
  onBeginResize: (event: React.PointerEvent<HTMLButtonElement>) => void
  isResizing: boolean
}

function GanttHeader({ days, sidePanelWidth, onBeginResize, isResizing }: GanttHeaderProps) {
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; width: number }[] = []
    for (const cell of days) {
      const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}`
      const last = groups[groups.length - 1]
      if (last && last.key === key) {
        last.width += cell.width
      } else {
        groups.push({
          key,
          label: cell.date.toLocaleString(undefined, { month: 'short', year: 'numeric' }),
          width: cell.width,
        })
      }
    }
    return groups
  }, [days])

  return (
    <div className="gantt-header" style={{ height: HEADER_HEIGHT }}>
      <div className="gantt-header-spacer" style={{ width: sidePanelWidth }}>
        <button
          type="button"
          className={`gantt-panel-resizer${isResizing ? ' is-dragging' : ''}`}
          aria-label="Resize goal title panel"
          title="Drag to resize goal title panel"
          onPointerDown={onBeginResize}
        />
      </div>
      <div className="gantt-header-cells">
        <div className="gantt-month-row">
          {monthGroups.map((group) => (
            <div key={group.key} className="gantt-month-cell" style={{ width: group.width }}>
              {group.label}
            </div>
          ))}
        </div>
        <div className="gantt-day-row">
          {days.map((cell) => (
            <div
              key={cell.iso}
              className={`gantt-day-cell${cell.isWeekend ? ' is-weekend' : ''}`}
              style={{ width: cell.width }}
            >
              {cell.date.getDate()}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const base = parseIsoDate(iso)
  const shifted = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays)
  return toIsoDate(shifted)
}

export default GanttView
