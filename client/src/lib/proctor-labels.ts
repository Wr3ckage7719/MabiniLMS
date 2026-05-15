import type { ProctorViolationType } from '@/services/exams.service';

export const VIOLATION_LABELS: Record<ProctorViolationType, string> = {
  visibility_hidden: 'Tab switch / window blur',
  fullscreen_exit: 'Exited fullscreen',
  context_menu: 'Right-click attempt',
  copy: 'Copy attempt',
  paste: 'Paste attempt',
  cut: 'Cut attempt',
  print_shortcut: 'Print / save shortcut',
  devtools_open: 'DevTools opened',
  wake_lock_released: 'Screen sleep / wake-lock released',
  screen_orientation_change: 'Device rotated',
  network_offline: 'Device went offline',
  picture_in_picture: 'Entered Picture-in-Picture',
};

export function violationLabel(type: ProctorViolationType | string): string {
  return VIOLATION_LABELS[type as ProctorViolationType] ?? type;
}
