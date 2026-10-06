import { useNavigate, useSearchParams } from 'react-router';
import type { PaceId, Page } from '../../core/schema/thing';
import { dayState } from '../../core/unlock/unlock';
import { Sheet } from '../../paper/Sheet';
import { useThing } from '../../player/data';
import type { PacePref } from '../../theme/prefs';
import { InkLink } from '../InkLink';
import { usePrefs } from '../PrefsContext';

const PACES: PacePref[] = ['easy', 'medium', 'deep'];

/** The fullest text page of a pace: shows how much a page holds at that pace. */
const fullestText = (pages: Page[]): string => {
  let best = '';
  for (const p of pages.slice(1)) {
    const t = p.type === 'sentence' || p.type === 'closing' ? p.text : '';
    if (t.length > best.length) best = t;
  }
  return best;
};

/**
 * The pace calibration page: the three paces, each with the fullest page of today's morning at that pace
 * and one tick per page, so the reader sees the difference rather than reading about it. Equal status:
 * no recommendation, no minutes (decision 3).
 */
export function Pace() {
  const { prefs, setPrefs, t } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const day = dayState(new Date());
  const state = useThing(prefs.lang, day.date, 'morning');
  const thing = state.status === 'ready' ? state.thing : null;

  const choose = (p: PacePref) => {
    setPrefs({ pace: p, paceChosen: true });
    navigate(next && next.startsWith('/read/') ? next : '/', { replace: true });
  };

  return (
    <Sheet paper={prefs.paper}>
      <h1 className="ink ink--title">{t('pace.title')}</h1>
      <p className="ink">{t('pace.lead')}</p>
      <ul className="pace-list" role="list">
        {PACES.map((p) => {
          const pages = thing?.paces[p as PaceId];
          const sample = pages ? fullestText(pages) : '';
          const chosen = prefs.paceChosen && prefs.pace === p;
          return (
            <li key={p} className="pace-option gap-1">
              <h2 className="ink pace-name">
                <button type="button" className="ink-link pace-choose" onClick={() => choose(p)} aria-describedby={`pace-${p}-desc`}>
                  {t(`pace.${p}`)}
                </button>
                {chosen ? <span className="ink--note pace-mine"> · {t('pace.chosen')}</span> : null}
              </h2>
              <p id={`pace-${p}-desc`} className="ui-line pace-desc">
                {t(`pace.${p}.desc`)}
              </p>
              {sample ? (
                <blockquote className="pace-sample">
                  <p className="ui-line pace-sample-label">
                    {t('pace.sample')}
                    {pages ? (
                      <span className="pace-pages" aria-hidden="true">
                        {' '}
                        {'/'.repeat(pages.length)}
                      </span>
                    ) : null}
                  </p>
                  <p className="ink">{sample}</p>
                </blockquote>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="ink ink--small gap-2">
        <InkLink to="/" seed={3} width={120}>
          {t('notYet.back')}
        </InkLink>
      </p>
    </Sheet>
  );
}
