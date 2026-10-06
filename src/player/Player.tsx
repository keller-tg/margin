import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/PrefsContext';
import type { PaceId, Thing } from '../core/schema/thing';
import { normalizeTypography } from '../core/typography/typography';
import { formatMarginDate } from '../i18n/i18n';
import type { PacePref } from '../theme/prefs';
import type { Manifest } from './data';
import { EndPage, NotePage } from './AppPages';
import { Notebook, seedFor, Ticks, type Go } from './Notebook';
import { PageBody } from './pages';

const PACES: PacePref[] = ['easy', 'medium', 'deep'];

/** Same relative position in a different pace: page 3 of 7 → page 2 of 4. */
export function mapIndex(index: number, fromLen: number, toLen: number): number {
  if (fromLen <= 1) return 0;
  return Math.round((index / (fromLen - 1)) * (toLen - 1));
}

type AppPageKind = 'note' | 'end';

export function Player({ thing, manifest, startAt = 0 }: { thing: Thing; manifest: Manifest; startAt?: number }) {
  const { prefs, setPrefs, t } = usePrefs();
  const navigate = useNavigate();
  const pace = prefs.pace as PaceId;
  const pages = thing.paces[pace];
  // the app's own pages after the content: the margin note (evenings) and the END page
  const appPages: AppPageKind[] = thing.slot === 'evening' ? ['note', 'end'] : ['end'];
  const count = pages.length + appPages.length;
  const [index, setIndex] = useState(() => Math.max(0, Math.min(startAt, count - 1)));
  if (index > count - 1) setIndex(count - 1); // a shorter pace chosen while on a late page
  const topicTitle = normalizeTypography(thing.topic.title, thing.lang); // Swiss "ss" for German, as on the pages
  const date = new Date(`${thing.date}T12:00:00`);
  const close = useCallback(() => navigate('/'), [navigate]);

  const changePace = (p: PacePref) => {
    if (p === pace) return;
    // on the app's pages (note, END) stay there; within the content keep the relative position
    setIndex(index >= pages.length ? thing.paces[p].length + (index - pages.length) : mapIndex(index, pages.length, thing.paces[p].length));
    setPrefs({ pace: p, paceChosen: true });
  };

  const leaf = (i: number, go: Go) => {
    const page = i < pages.length ? pages[i]! : null;
    const app = page ? null : appPages[i - pages.length]!;
    return {
      margin: (
        <p className="ink ink--small ink--note margin-date">
          {i === 0 ? `${formatMarginDate(thing.lang, date)} · ${t(thing.slot === 'morning' ? 'slot.morning' : 'slot.evening').toLowerCase()}` : page ? `${i + 1}/${pages.length}` : ''}
        </p>
      ),
      body: page ? (
        <PageBody page={page} thing={thing} manifest={manifest} seed={seedFor(thing.id, i)} />
      ) : app === 'note' ? (
        <NotePage thing={thing} onDone={() => go('forward')} />
      ) : (
        <EndPage thing={thing} />
      ),
      foot: (
        <footer className="page-foot player-foot">
          <Ticks n={pages.length} at={Math.min(i, pages.length - 1)} />
          <nav className="ui-line player-nav" aria-label={t('player.pageOf', { n: String(i + 1), total: String(count) })}>
            <button type="button" className="nav-btn" onClick={() => go('back')} disabled={i === 0} aria-label={t('player.prev')}>
              ←
            </button>
            {i === 0 ? (
              <span className="pace-switch" role="group" aria-label={t('player.pace')}>
                {PACES.map((p) => (
                  <button key={p} type="button" className="pace-btn" aria-pressed={p === pace} onClick={() => changePace(p)}>
                    {t(`pace.${p}`)}
                  </button>
                ))}
              </span>
            ) : (
              <span />
            )}
            <button type="button" className="nav-btn" onClick={() => go('forward')} aria-label={i === count - 1 ? t('player.close') : t('player.next')}>
              →
            </button>
          </nav>
          <p className="ui-line attribution">
            {t('player.text')} ·{' '}
            <a href={thing.sources[0]?.url} target="_blank" rel="noopener noreferrer">
              {topicTitle}
            </a>{' '}
            · <span className="nowrap">CC BY-SA 4.0</span>
          </p>
        </footer>
      ),
    };
  };

  return (
    <Notebook
      label={topicTitle}
      count={count}
      index={index}
      setIndex={setIndex}
      pageKey={(i) => `${pace}:${i}`}
      leaf={leaf}
      onPastEnd={close}
      onEscape={close}
    />
  );
}
