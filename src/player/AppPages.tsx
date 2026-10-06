import { useState } from 'react';
import { Link } from 'react-router';
import { usePrefs } from '../app/PrefsContext';
import type { Thing } from '../core/schema/thing';
import { dayState, EVENING_OPENS_HOUR, MORNING_OPENS_HOUR } from '../core/unlock/unlock';
import { formatHour } from '../i18n/i18n';
import { sketchFlourish } from '../ink/sketch';
import { loadNote, NOTE_MAX, noteKey, saveNote } from './notes';

// The pages that belong to the app, not the content (plan §3): the margin note at the end of an evening,
// and the END page that closes every reading.

/**
 * Evening only: one line for the margin. Optional and private: it is stored on this device and nowhere
 * else. "keep it" saves and turns the page; "not today" just turns it.
 */
export function NotePage({ thing, onDone }: { thing: Thing; onDone: () => void }) {
  const { t } = usePrefs();
  const key = noteKey(thing.lang, thing.date, thing.slot);
  const [text, setText] = useState(() => loadNote(key)?.text ?? '');
  const [kept, setKept] = useState(() => Boolean(loadNote(key)));
  const keep = () => {
    if (saveNote(key, text, thing.topic.title) && text.trim()) setKept(true);
    onDone();
  };
  return (
    <div className="page page--note">
      <p className="ink ink--page" data-write>
        {t('note.title')}
      </p>
      <form
        className="note-form"
        onSubmit={(e) => {
          e.preventDefault();
          keep();
        }}
      >
        <label className="visually-hidden" htmlFor="margin-note">
          {t('note.title')}
        </label>
        <input
          id="margin-note"
          className="note-input"
          type="text"
          maxLength={NOTE_MAX}
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setKept(false);
          }}
          placeholder={t('note.placeholder')}
        />
        <p className="ui-line note-hint">{kept ? t('note.kept') : t('note.hint')}</p>
        <p className="ui-line note-actions">
          <button type="submit" className="note-btn note-btn--keep">
            {t('note.keep')}
          </button>
          <button type="button" className="note-btn" onClick={onDone}>
            {t('note.skip')}
          </button>
        </p>
      </form>
    </div>
  );
}

/** The END page: the notebook closes. It says when the next page opens; nothing to scroll, nothing to chase. */
export function EndPage({ thing }: { thing: Thing }) {
  const { prefs, t } = usePrefs();
  const lang = prefs.lang;
  const day = dayState(new Date());
  const today = day.date === thing.date;
  const morning = thing.slot === 'morning';
  let next: string;
  if (morning && today && day.evening.open) next = t('end.eveningOpen');
  else if (morning) next = t('end.nextEvening', { time: formatHour(lang, EVENING_OPENS_HOUR) });
  else next = t('end.nextMorning', { time: formatHour(lang, MORNING_OPENS_HOUR) });
  return (
    <div className="page page--end">
      <p className="ink ink--title end-title" data-write>
        {morning ? t('end.morning') : t('end.evening')}
      </p>
      <svg className="end-flourish" viewBox="0 0 160 16" aria-hidden="true" data-draw>
        <path d={sketchFlourish(4, 8, 150, 7)} />
      </svg>
      <p className="ink" data-write>
        {next}
      </p>
      <p className="ink ink--small gap-1 end-actions">
        {morning && today && day.evening.open ? (
          <Link className="ink-link end-link" to={`/read/${thing.lang}/${thing.date}/evening`}>
            {t('end.readEvening')}
          </Link>
        ) : null}
        {morning ? (
          <Link className="ink-link end-link" to={`/trail/${thing.lang}/${thing.date}`}>
            {t('trail.start')}
          </Link>
        ) : null}
        <Link className="ink-link end-link" to="/">
          {t('end.close')}
        </Link>
      </p>
    </div>
  );
}
