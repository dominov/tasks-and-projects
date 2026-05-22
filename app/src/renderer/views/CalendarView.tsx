import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import type { TaskWithRelations } from '../../common/types';
import type { QuickCreateOptions } from '../components/ViewManager';
import WeeklyCalendarView from './WeeklyCalendarView';

interface CalendarViewProps {
  tasks: TaskWithRelations[];
  onSelectTask: (taskId: number) => void;
  selectedTaskId: number | null;
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<void>;
  projectId: number | null;
}

export default function CalendarView({
  tasks,
  onSelectTask,
  selectedTaskId,
  onCreateTask,
  projectId
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date('2026-05-22T00:00:00')); // Hardcoded based on context, but typically Date.now()

  const handlePrev = () => setCurrentDate((prev) => addDays(prev, viewMode === 'weekly' ? -7 : -30));
  const handleNext = () => setCurrentDate((prev) => addDays(prev, viewMode === 'weekly' ? 7 : 30));
  const handleToday = () => setCurrentDate(new Date('2026-05-22T00:00:00'));

  return (
    <div className="weekly-calendar">
      <div className="weekly-header-bar">
        <div>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>
            CALENDAR SCHEDULE
          </span>
          <h1>{viewMode === 'weekly' ? 'Weekly Planner' : 'Monthly Planner'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'weekly' | 'monthly')}
            style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', outline: 'none' }}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <button onClick={handlePrev} style={{ display: 'flex', alignItems: 'center', padding: '0.375rem', borderRadius: '0.25rem', color: '#475569', cursor: 'pointer', border: 'none', background: 'transparent' }} title="Previous">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button onClick={handleToday} style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#334155', padding: '0 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }} title="Go to Today">
              {format(currentDate, 'MMMM yyyy')}
            </button>
            <button onClick={handleNext} style={{ display: 'flex', alignItems: 'center', padding: '0.375rem', borderRadius: '0.25rem', color: '#475569', cursor: 'pointer', border: 'none', background: 'transparent' }} title="Next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'weekly' ? (
        <WeeklyCalendarView 
          tasks={tasks}
          onSelectTask={onSelectTask}
          selectedTaskId={selectedTaskId}
          onCreateTask={onCreateTask}
          projectId={projectId}
          currentDate={currentDate}
        />
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Monthly view is not implemented yet.
        </div>
      )}
    </div>
  );
}

