import { useEffect, useState } from 'react';
import { BRAND } from '../../brand/brand.config';
import { Wordmark } from '../../brand/Wordmark';
import { dayState, msUntilNextChange, type SlotState } from '../../core/unlock/unlock';
import { formatHour, formatMarginDate, LANGS, translate } from '../../i18n/i18n';
import { Sheet } from '../../paper/Sheet';
import { InkLink } from '../InkLink';
import { usePrefs } from '../PrefsContext';

/** Re-render exactly when the day changes state (05:00, 17:00, midnight). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setTimeout(() => setNow(new Date()), msUntilNextChange(now) + 500);
    return () => window.clearTimeout(id);
  }, [now]);
  return now;
}

export function Landing() {
  const { prefs, setPrefs, t } = usePrefs();
  const now = useNow();
  const day = dayState(now);
  const lang = prefs.lang;

  const slotLine = (s: SlotState) => (
    <p className="ink slot-line">
      <span>{t(s.slot === 'morning' ? 'slot.morning' : 'slot.evening')}</span>
      <span className="slot-sep" aria-hidden="true"> · </span>
      <span className="slot-status" data-open={s.open}>
        {s.open ? t('landing.open') : t('landing.opensAt', { time: formatHour(lang, s.opensAtHour) })}
      </span>
    </p>
  );

  return (
    <Sheet
      paper={prefs.paper}
      fill
      margin={<p className="ink ink--small ink--note margin-date">{formatMarginDate(lang, now)}</p>}
    >
      <h1 className="m-0">
        <Wordmark rules={3} />
      </h1>
      <p className="ink tagline gap-1">{BRAND.tagline[lang]}</p>

      <section className="gap-1" aria-label={t('landing.today')}>
        {slotLine(day.morning)}
        {slotLine(day.evening)}
      </section>

      <p className="ink gap-1 begin-line">
        <InkLink to="/begin" arrow width={96} seed={5}>
          {t('landing.begin')}
        </InkLink>
      </p>

      <footer className="page-foot landing-foot">
        <p className="ink ink--small">
          <InkLink to="/pace" seed={11} width={60}>
            {t('landing.pace')}
          </InkLink>
          <span className="pace-current"> {t('pace.medium')}</span>
        </p>
        <nav className="ui-line lang-toggle" aria-label={t('landing.languages')}>
          {LANGS.map((l, i) => (
            <span key={l}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <button
                type="button"
                className="lang-btn"
                lang={l}
                aria-pressed={l === lang}
                onClick={() => setPrefs({ lang: l })}
              >
                {translate(l, 'lang.name')}
              </button>
            </span>
          ))}
        </nav>
      </footer>
    </Sheet>
  );
}
