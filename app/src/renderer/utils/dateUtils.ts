import { isWeekend } from 'date-fns';

export function isWorkingDay(date: Date | string | number): boolean {
  if (!date) return false;
  return !isWeekend(new Date(date));
}
