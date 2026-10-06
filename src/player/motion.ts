// One switch for all motion: the reader's own setting wins, otherwise the system's reduced-motion preference.
import { useEffect, useState } from 'react';
import type { MotionPref } from '../theme/prefs';

const query = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(pref: MotionPref): boolean {
  const [system, setSystem] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia(query);
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'off' ? true : pref === 'on' ? false : system;
}
