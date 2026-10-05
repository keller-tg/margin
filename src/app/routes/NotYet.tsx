import { Sheet } from '../../paper/Sheet';
import { InkLink } from '../InkLink';
import { usePrefs } from '../PrefsContext';

/** Calm placeholder for parts of the notebook that aren't written yet. */
export function NotYet() {
  const { prefs, t } = usePrefs();
  return (
    <Sheet paper={prefs.paper}>
      <h1 className="ink ink--title">{t('notYet.title')}</h1>
      <p className="ink gap-1">{t('notYet.line1')}</p>
      <p className="ink">{t('notYet.line2')}</p>
      <p className="ink ink--small gap-2">
        <InkLink to="/" seed={3} width={120}>
          {t('notYet.back')}
        </InkLink>
      </p>
    </Sheet>
  );
}

export function NotFound() {
  const { prefs, t } = usePrefs();
  return (
    <Sheet paper={prefs.paper}>
      <h1 className="ink ink--title">{t('notFound.title')}</h1>
      <p className="ink gap-1">{t('notFound.line')}</p>
      <p className="ink ink--small gap-2">
        <InkLink to="/" seed={3} width={120}>
          {t('notYet.back')}
        </InkLink>
      </p>
    </Sheet>
  );
}
