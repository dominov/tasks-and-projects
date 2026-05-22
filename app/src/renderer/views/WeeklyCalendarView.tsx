import { useState } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  parseISO,
  isWithinInterval,
  startOfDay
} from 'date-fns';
import { isWorkingDay } from '../utils/dateUtils';
import type { TaskWithRelations } from '../../common/types';
import type { QuickCreateOptions } from '../components/ViewManager';

interface WeeklyCalendarViewProps {
  tasks: TaskWithRelations[];
  onSelectTask: (taskId: number) => void;
  selectedTaskId: number | null;
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<void>;
  projectId: number | null;
  currentDate: Date;
}

/** Check if a task overlaps a given day */
function taskFallsOnDay(task: TaskWithRelations, day: Date): boolean {
  const start = task.start_date ? startOfDay(parseISO(task.start_date)) : null;
  const end = task.end_date ? startOfDay(parseISO(task.end_date)) : null;
  const dayStart = startOfDay(day);

  if (start && end) {
    return isWithinInterval(dayStart, { start, end });
  }
  if (start) return isSameDay(dayStart, start);
  if (end) return isSameDay(dayStart, end);
  return false;
}

/** Check if a task overlaps any day in the week */
function taskOverlapsWeek(task: TaskWithRelations, weekStart: Date, weekEnd: Date): boolean {
  const start = task.start_date ? startOfDay(parseISO(task.start_date)) : null;
  const end = task.end_date ? startOfDay(parseISO(task.end_date)) : null;
  const wStart = startOfDay(weekStart);
  const wEnd = startOfDay(weekEnd);

  if (start && end) {
    // Task range overlaps week range
    return start <= wEnd && end >= wStart;
  }
  if (start) {
    return start >= wStart && start <= wEnd;
  }
  if (end) {
    return end >= wStart && end <= wEnd;
  }
  return false;
}

/** Determine if a task is multi-day */
function isMultiDay(task: TaskWithRelations): boolean {
  if (!task.start_date || !task.end_date) return false;
  return task.start_date !== task.end_date;
}

export default function WeeklyCalendarView({
  tasks,
  onSelectTask,
  selectedTaskId,
  onCreateTask,
  projectId,
  currentDate
}: WeeklyCalendarViewProps) {
  const [addingTaskForDay, setAddingTaskForDay] = useState<Date | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Generate the 7 days of the week starting from Monday
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];

  // Filter tasks: exclude goals, include only tasks that overlap this week
  const calendarTasks = tasks.filter(
    (t) => t.type !== 'goal' && (t.start_date || t.end_date) && taskOverlapsWeek(t, weekStart, weekEnd)
  );

  // Multi-day tasks: have both start and end, spanning more than one day
  const multiDayTasks = calendarTasks.filter(isMultiDay);

  // Single-day tasks: everything else (single date or same start/end)
  const singleDayTasks = calendarTasks.filter((t) => !isMultiDay(t));

  const handleCreateTask = async (day: Date) => {
    if (!newTaskTitle.trim()) {
      setAddingTaskForDay(null);
      return;
    }
    const dateStr = format(day, 'yyyy-MM-dd');
    await onCreateTask(newTaskTitle, 'task', {
      startDate: dateStr,
      endDate: dateStr,
      projectId: projectId || undefined,
    });
    setNewTaskTitle('');
    setAddingTaskForDay(null);
  };

  const getCapacity = (day: Date) => {
    if (!isWorkingDay(day)) return { total: 0, isOver: false };

    let totalSp = 0;
    calendarTasks.forEach((t) => {
      if (taskFallsOnDay(t, day)) {
        totalSp += t.story_points || 0;
      }
    });

    return { total: totalSp, isOver: totalSp > 6 };
  };

  // Calculate left offset and width percentage for a multiday task bar.
  // Layout flex weights: Mon-Fri = 2, Sat-Sun = 1. Total = 12.
  const getTotalWidthPercentage = (startDayIdx: number, endDayIdx: number) => {
    let offsetFlex = 0;
    for (let i = 0; i < startDayIdx; i++) {
      offsetFlex += i < 5 ? 2 : 1;
    }
    let durationFlex = 0;
    for (let i = startDayIdx; i <= endDayIdx; i++) {
      durationFlex += i < 5 ? 2 : 1;
    }
    return {
      left: `${(offsetFlex / 12) * 100}%`,
      width: `${(durationFlex / 12) * 100}%`,
    };
  };

  // Calculate visible start/end indices for a multiday task within this week
  const getVisualIndices = (task: TaskWithRelations) => {
    const start = startOfDay(parseISO(task.start_date!));
    const end = startOfDay(parseISO(task.end_date!));

    let visualStartIdx = 0;
    if (start >= startOfDay(weekStart)) {
      visualStartIdx = weekDays.findIndex((d) => isSameDay(d, start));
      if (visualStartIdx === -1) visualStartIdx = 0;
    }

    let visualEndIdx = 6;
    if (end <= startOfDay(weekEnd)) {
      const idx = weekDays.findIndex((d) => isSameDay(d, end));
      if (idx !== -1) visualEndIdx = idx;
    }

    return { visualStartIdx, visualEndIdx };
  };

  // Dynamic spacer height based on number of multi-day tasks visible
  const multiDaySpacerHeight = `${Math.max(4, multiDayTasks.length * 3 + 1)}rem`;

  return (
    <div className="weekly-grid">
      <div className="weekly-grid-container">
        {/* Header Row */}
        <div className="weekly-days-header">
          {weekDays.map((day, idx) => {
            const { total, isOver } = getCapacity(day);
            const isWeekendDay = !isWorkingDay(day);
            return (
              <div 
                key={day.toISOString()} 
                className={`weekly-day-col ${isWeekendDay ? 'weekly-weekend-pattern' : ''}`}
                style={{ flex: idx < 5 ? 2 : 1 }}
              >
                <div className="weekly-day-header">
                  <div style={{ textTransform: 'uppercase', fontSize: '10px', color: '#64748b' }}>
                    {format(day, 'EEE')}
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    {format(day, 'd')}
                  </div>
                  {!isWeekendDay && (
                    <div className={`weekly-day-capacity ${isOver ? 'capacity-over' : 'capacity-ok'}`}>
                      {isOver ? '🔥' : ''} {total}/6 Blocks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Body Row (Grid Content) */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: '520px' }}>
            
          {/* Multi-day Task Layer */}
          <div className="weekly-multi-day-layer">
            {multiDayTasks.map((task, index) => {
                const { visualStartIdx, visualEndIdx } = getVisualIndices(task);
                const { left, width } = getTotalWidthPercentage(visualStartIdx, visualEndIdx);

                return (
                    <div 
                        key={task.id} 
                        className="weekly-multi-day-task"
                        data-details-trigger="open"
                        style={{ 
                            left, 
                            width, 
                            top: `${index * 3}rem`, 
                            backgroundColor: '#3b82f6'
                        }}
                        onClick={() => onSelectTask(task.id)}
                    >
                        <strong>{task.title}</strong>
                        <div style={{ fontSize: '10px', opacity: 0.8 }}>
                            {task.project_name || 'No Project'}
                        </div>
                    </div>
                );
            })}
          </div>

          <div style={{ display: 'flex', width: '100%' }}>
            {weekDays.map((day, idx) => {
              const isWeekendDay = !isWorkingDay(day);
              // Single-day tasks for this day (check start_date OR end_date)
              const dayTasks = singleDayTasks.filter((t) => taskFallsOnDay(t, day));
              
              return (
                <div 
                  key={`body-${day.toISOString()}`} 
                  className={`weekly-day-body ${isWeekendDay ? 'weekly-weekend-pattern' : ''}`}
                  style={{ flex: idx < 5 ? 2 : 1 }}
                >
                  <div style={{ height: multiDaySpacerHeight }}></div> {/* Dynamic spacer for multiday tasks */}
                  
                  {dayTasks.map(task => (
                    <div 
                        key={task.id} 
                        className="weekly-single-task"
                        data-details-trigger="open"
                        onClick={() => onSelectTask(task.id)}
                        style={{ borderLeft: task.id === selectedTaskId ? '3px solid #3b82f6' : undefined }}
                    >
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{task.project_name || 'No Project'}</div>
                      <strong>{task.title}</strong>
                    </div>
                  ))}

                  <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                    {addingTaskForDay && isSameDay(addingTaskForDay, day) ? (
                      <input 
                        type="text" 
                        autoFocus
                        className="add-task-input"
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onBlur={() => setAddingTaskForDay(null)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreateTask(day);
                          if (e.key === 'Escape') setAddingTaskForDay(null);
                        }}
                      />
                    ) : (
                      <button 
                        className="add-task-btn"
                        onClick={() => {
                          setAddingTaskForDay(day);
                          setNewTaskTitle('');
                        }}
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
