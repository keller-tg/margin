import { useEffect } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import type { Slot } from '../../core/schema/thing';
import { dayState } from '../../core/unlock/unlock';
import { isLang } from '../../i18n/i18n';
import { Sheet } from '../../paper/Sheet';
import { useThing } from '../../player/data';
import { Player } from '../../player/Player';
import { InkLink } from '../InkLink';
import { usePrefs } from '../PrefsContext';

/** /begin: today's open slot (the evening once it has opened, otherwise the morning). Asks for a pace first. */
export function Begin() {
  const { prefs } = usePrefs();
  const day = dayState(new Date());
  const slot: Slot | null = day.evening.open ? 'evening' : day.morning.open ? 'morning' : null;
  if (!slot) return <Navigate to="/" replace />;
  const target = `/read/${prefs.lang}/${day.date}/${slot}`;
  return <Navigate to={prefs.paceChosen ? target : `/pace?next=${encodeURIComponent(target)}`} replace />;
}

/** /read/:lang/:date/:slot — one day's thing, in the reader's pace. */
export function Read() {
  const { lang, date, slot } = useParams();
  const { prefs, setPrefs, t } = usePrefs();
  const [params] = useSearchParams();
  const valid = isLang(lang) && /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && (slot === 'morning' || slot === 'evening');
  const state = useThing(isLang(lang) ? lang : 'en', date ?? '', (slot as Slot) ?? 'morning');

  // a link to another language's day switches the UI language too
  useEffect(() => {
    if (isLang(lang) && lang !== prefs.lang) setPrefs({ lang });
  }, [lang, prefs.lang, setPrefs]);
  // ?pace=deep (used by the screenshots and shareable links) sets the pace once
  useEffect(() => {
    const p = params.get('pace');
    if (p === 'easy' || p === 'medium' || p === 'deep') setPrefs({ pace: p });
  }, [params, setPrefs]);

  if (!valid) return <Navigate to="/" replace />;
  if (state.status === 'ready') return <Player thing={state.thing} manifest={state.manifest} />;
  return (
    <Sheet paper={prefs.paper}>
      <p className="ink gap-2" aria-live="polite">
        {state.status === 'loading' ? t('player.loading') : t('player.missing')}
      </p>
      {state.status === 'missing' ? (
        <p className="ink ink--small gap-1">
          <InkLink to="/" seed={3} width={120}>
            {t('notYet.back')}
          </InkLink>
        </p>
      ) : null}
    </Sheet>
  );
}
