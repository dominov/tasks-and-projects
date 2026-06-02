import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseIsoDate,
  toIsoDate,
} from '../../common/businessDays'
import type { Project, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import { getGroupLabel, getGroupLabelHeading, type GroupBy } from '../utils/taskGrouping'

interface GanttViewProps {
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  onShiftTasks: (
    updates: Array<{ taskId: number; payload: TaskUpdatePayload }>,
    successMessage: string,
  ) => Promise<void>
  presentationMode: boolean
  onTogglePresentationMode: () => void
}

const ROW_HEIGHT = 36
const BAR_VERTICAL_PADDING = 6
const MIN_WEEKDAY_WIDTH = 35
const WEEKEND_WIDTH_RATIO = 0.5
const HEADER_HEIGHT = 56
const DEFAULT_SIDE_PANEL_WIDTH = 220
const MIN_SIDE_PANEL_WIDTH = 180
const MAX_SIDE_PANEL_WIDTH = 560
const DAYS_BEFORE_TODAY = 7
const DAYS_AFTER_LATEST_TASK = 3
const CLICK_SUPPRESSION_MS = 250

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

interface GanttGroupSection {
  groupBy: GroupBy
  groupLabel: string
  groupTitle: string
  rows: GanttRow[]
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
  onShiftTasks,
  presentationMode,
  onTogglePresentationMode,
}: GanttViewProps) {
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [panelResize, setPanelResize] = useState<PanelResizeState | null>(null)
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH)
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
  const [groupBy, setGroupBy] = useState<GroupBy>('status')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const suppressedClickRef = useRef<{ taskId: number | null; until: number }>({
    taskId: null,
    until: 0,
  })

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

  const taskById = useMemo(() => {
    const map = new Map<number, TaskWithRelations>()
    for (const task of tasks) {
      map.set(task.id, task)
    }
    return map
  }, [tasks])

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

  const allChildrenByParent = useMemo(() => {
    const map = new Map<number, TaskWithRelations[]>()
    for (const task of tasks) {
      if (!task.parent_task_id) {
        continue
      }
      const list = map.get(task.parent_task_id) ?? []
      list.push(task)
      map.set(task.parent_task_id, list)
    }
    return map
  }, [tasks])

  const groupedRows = useMemo<GanttGroupSection[]>(() => {
    if (goalTasks.length === 0) {
      return []
    }

    const sortedGoals = [...goalTasks].sort((a, b) => {
      const aIso = a.start_date ?? a.end_date ?? ''
      const bIso = b.start_date ?? b.end_date ?? ''
      return aIso.localeCompare(bIso)
    })

    const buildBranchRows = (goal: TaskWithRelations): GanttRow[] => {
      const branchRows: GanttRow[] = []

      const pushChildren = (parentId: number, level: number) => {
        const children = childrenByParent.get(parentId) ?? []
        for (const child of children) {
          const childRows = childrenByParent.get(child.id) ?? []
          const hasChildren = childRows.length > 0
          branchRows.push({ task: child, level, hasChildren })
          const isExpanded = expandedRows[child.id] ?? true
          if (hasChildren && isExpanded) {
            pushChildren(child.id, level + 1)
          }
        }
      }

      const goalChildren = childrenByParent.get(goal.id) ?? []
      const hasChildren = goalChildren.length > 0
      branchRows.push({ task: goal, level: 0, hasChildren })
      const isExpanded = expandedRows[goal.id] ?? true
      if (hasChildren && isExpanded) {
        pushChildren(goal.id, 1)
      }

      return branchRows
    }

    const groups = new Map<string, GanttGroupSection>()

    for (const goal of sortedGoals) {
      const groupLabel = getEffectiveGroupLabel(goal, groupBy, childrenByParent)
      const groupTitle = `${getGroupLabelHeading(groupBy)}: ${groupLabel}`
      const existing = groups.get(groupLabel)

      if (existing) {
        existing.rows.push(...buildBranchRows(goal))
      } else {
        groups.set(groupLabel, {
          groupBy,
          groupLabel,
          groupTitle,
          rows: buildBranchRows(goal),
        })
      }
    }

    return Array.from(groups.values()).sort((left, right) => {
      const leftIsFallback = isFallbackGroupLabel(left.groupLabel)
      const rightIsFallback = isFallbackGroupLabel(right.groupLabel)

      if (leftIsFallback !== rightIsFallback) {
        return leftIsFallback ? 1 : -1
      }

      return left.groupLabel.localeCompare(right.groupLabel)
    })
  }, [childrenByParent, expandedRows, goalTasks, groupBy])

  const rows = useMemo<GanttRow[]>(() => groupedRows.flatMap((section) => section.rows), [groupedRows])

  const todayIso = useMemo(() => toIsoDate(new Date()), [])

  // Build window: one week before today until the latest task date + 3 days.
  const days = useMemo<DayCell[]>(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - DAYS_BEFORE_TODAY)

    let latestTaskDate: Date | null = null
    for (const task of datedTasks) {
      const candidateIso = task.end_date ?? task.start_date
      if (!candidateIso) {
        continue
      }

      const candidateDate = parseIsoDate(candidateIso)
      if (!latestTaskDate || candidateDate.getTime() > latestTaskDate.getTime()) {
        latestTaskDate = candidateDate
      }
    }

    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const latestPlusBuffer = latestTaskDate
      ? new Date(
          latestTaskDate.getFullYear(),
          latestTaskDate.getMonth(),
          latestTaskDate.getDate() + DAYS_AFTER_LATEST_TASK,
        )
      : todayFloor

    const end = latestPlusBuffer.getTime() > todayFloor.getTime() ? latestPlusBuffer : todayFloor

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
  }, [containerWidth, datedTasks, sidePanelWidth])

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

  const rowOrderByTaskId = useMemo(() => {
    const map = new Map<number, number>()
    rows.forEach((row, index) => {
      map.set(row.task.id, index)
    })
    return map
  }, [rows])

  const positionedByTaskId = useMemo(() => {
    const map = new Map<number, PositionedTask>()
    positionedTasks.forEach((entry) => {
      map.set(entry.task.id, entry)
    })
    return map
  }, [positionedTasks])

  // --- Drag & resize ---------------------------------------------------------

  const averageDayWidth = useMemo(() => {
    if (days.length === 0) return MIN_WEEKDAY_WIDTH
    return totalTimelineWidth / days.length
  }, [days.length, totalTimelineWidth])

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, task: TaskWithRelations, mode: 'move' | 'resize') => {
      if (task.type === 'goal' && mode === 'resize') {
        // Goal resizing is disabled because bounds come from subtasks.
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

      // Prevent the synthetic click that can fire after pointer-up on a drag.
      suppressedClickRef.current = {
        taskId,
        until: Date.now() + CLICK_SUPPRESSION_MS,
      }

      if (mode === 'move') {
        const draggedTask = taskById.get(taskId)

        if (draggedTask?.type === 'goal') {
          const descendants: TaskWithRelations[] = []
          const pendingIds: number[] = [taskId]

          while (pendingIds.length > 0) {
            const parentId = pendingIds.shift()
            if (parentId === undefined) {
              continue
            }

            for (const child of allChildrenByParent.get(parentId) ?? []) {
              descendants.push(child)
              pendingIds.push(child.id)
            }
          }

          const updates = [...descendants, draggedTask]
            .filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index)
            .map((task) => {
              const payload: TaskUpdatePayload = {}

              if (task.start_date) {
                payload.start_date = shiftIsoDate(task.start_date, deltaDays)
              }

              if (task.end_date) {
                payload.end_date = shiftIsoDate(task.end_date, deltaDays)
              }

              return { taskId: task.id, payload }
            })
            .filter((update) => Object.keys(update.payload).length > 0)

          if (updates.length === 0) {
            return
          }

          await onShiftTasks(updates, 'Goal and subtasks rescheduled.')
          return
        }

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
    [allChildrenByParent, dragState, onShiftTasks, onUpdateTask, panelResize, taskById],
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
          <div className="gantt-group-controls">
            <label htmlFor="gantt-group-by">Group:</label>
            <select
              id="gantt-group-by"
              className="gantt-group-select"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            >
              <option value="status">Status</option>
              <option value="category">Category</option>
              <option value="project">Project</option>
              <option value="priority">Priority</option>
            </select>
          </div>
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
              todayIso={todayIso}
            />

            <div className="gantt-body">
              {groupedRows.map((section) => (
                <Fragment key={`${section.groupBy}-${section.groupLabel}`}>
                  {groupedRows.length > 1 ? (
                    <div className="gantt-group-row">
                      <div className="gantt-group-row-label" style={{ width: sidePanelWidth }}>
                        {section.groupTitle}
                      </div>
                      <div className="gantt-group-row-track" />
                    </div>
                  ) : null}

                  {section.rows.map((row) => {
                    const task = row.task
                    const entry = positionedByTaskId.get(task.id)

                    if (!entry) {
                      return null
                    }

                    const { left, width } = entry
                    const rowIndex = rowOrderByTaskId.get(task.id) ?? 0
                    const projectColor = task.project_id ? projectColorById.get(task.project_id) ?? '#475569' : '#475569'
                    const durationDays = getTaskDurationDays(task)
                    const isDragging = dragState?.taskId === task.id
                    const adjustedLeft = isDragging && dragState?.mode === 'move' ? left + liveDeltaPx : left
                    const adjustedWidth =
                      isDragging && dragState?.mode === 'resize' ? Math.max(MIN_WEEKDAY_WIDTH, width + liveDeltaPx) : width
                    const isGoal = task.type === 'goal'
                    const isSubtask = row.level > 0
                    const isExpanded = expandedRows[task.id] ?? true

                    const handleBarClick = (event: React.MouseEvent<HTMLDivElement>) => {
                      event.stopPropagation()

                      const suppressed = suppressedClickRef.current
                      if (suppressed.taskId === task.id && Date.now() <= suppressed.until) {
                        suppressedClickRef.current = { taskId: null, until: 0 }
                        return
                      }

                      onSelectTask(task.id)
                    }

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
                              className={selectedTaskId === task.id ? 'gantt-row-title is-active' : 'gantt-row-title'}
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
                              className={`gantt-cell${cell.isWeekend ? ' is-weekend' : ''}${cell.iso === todayIso ? ' is-today' : ''}`}
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
                            }${isGoal ? ' is-goal' : ''}${isSubtask ? ' is-subtask' : ''}`}
                            style={{
                              left: adjustedLeft,
                              width: adjustedWidth,
                              top: BAR_VERTICAL_PADDING,
                              height: ROW_HEIGHT - BAR_VERTICAL_PADDING * 2,
                              background: projectColor,
                              zIndex: 100 + rowIndex,
                            }}
                            onPointerDown={(event) => beginDrag(event, task, 'move')}
                            onClick={handleBarClick}
                          >
                            <span className="gantt-bar-label">{durationDays} day{durationDays === 1 ? '' : 's'}</span>
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
                </Fragment>
              ))}
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
  todayIso: string
}

function GanttHeader({ days, sidePanelWidth, onBeginResize, isResizing, todayIso }: GanttHeaderProps) {
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
              className={`gantt-day-cell${cell.isWeekend ? ' is-weekend' : ''}${cell.iso === todayIso ? ' is-today' : ''}`}
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

function getTaskDurationDays(task: TaskWithRelations): number {
  const startIso = task.start_date ?? task.end_date
  const endIso = task.end_date ?? task.start_date

  if (!startIso || !endIso) {
    return 1
  }

  const start = parseIsoDate(startIso).getTime()
  const end = parseIsoDate(endIso).getTime()
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, days)
}

function isFallbackGroupLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase()
  return normalized.startsWith('no ') || normalized === 'none' || normalized === '-'
}

function getEffectiveGroupLabel(
  goal: TaskWithRelations,
  groupBy: GroupBy,
  childrenByParent: Map<number, TaskWithRelations[]>,
): string {
  const directLabel = getGroupLabel(goal, groupBy)

  // Goals often don't carry project/category, while their subtasks do.
  // Use the first descendant with a non-fallback label so grouping stays meaningful.
  if (groupBy !== 'project' && groupBy !== 'category') {
    return directLabel
  }

  if (!isFallbackGroupLabel(directLabel)) {
    return directLabel
  }

  const queue: TaskWithRelations[] = [...(childrenByParent.get(goal.id) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    const label = getGroupLabel(current, groupBy)
    if (!isFallbackGroupLabel(label)) {
      return label
    }

    queue.push(...(childrenByParent.get(current.id) ?? []))
  }

  return directLabel
}

export default GanttView
