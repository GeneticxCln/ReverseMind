import type { Routine } from './types';

const DEFAULT_TIME = '09:00';

function parseTime(time: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return { hours: 9, minutes: 0 };
  return {
    hours: Math.min(23, Math.max(0, Number(match[1]))),
    minutes: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

/**
 * Next occurrence of a routine's schedule in the machine's local time.
 * Manual routines never run on their own. Hourly routines align to the top
 * of the next hour; daily and weekday routines use their configured time.
 */
export function nextRoutineRun(
  schedule: Routine['schedule'],
  time: string = DEFAULT_TIME,
  from: number = Date.now()
): number | null {
  if (schedule === 'manual') return null;

  if (schedule === 'hourly') {
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    return next.getTime() + 3_600_000;
  }

  const { hours, minutes } = parseTime(time);
  const candidate = new Date(from);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() <= from) candidate.setDate(candidate.getDate() + 1);

  if (schedule === 'weekdays') {
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
    }
  }

  return candidate.getTime();
}
