// DEV ONLY (not in production builds): a type specimen for checking baseline alignment on every paper.
import { normalizeTypography } from '../../core/typography/typography';
import { Wordmark } from '../../brand/Wordmark';
import { Sheet } from '../../paper/Sheet';
import type { Hand, Ink, PaperType, ThemePref } from '../../theme/prefs';
import { usePrefs } from '../PrefsContext';

const SAMPLES = {
  en: normalizeTypography('The quick brown fox jumps over the lazy dog, then naps. "It\'s about 3 m," she wrote...', 'en'),
  de: normalizeTypography('Zwölf Boxkämpfer jagen Viktor quer über den grossen Sylter Deich. Äpfel, Öl, Übermass.', 'de'),
  fr: normalizeTypography("Portez ce vieux whisky au juge blond qui fume. « Où est l'œuvre ? » Ça m'étonne !", 'fr'),
};

function Choice<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly T[]; onPick: (v: T) => void }) {
  return (
    <span className="specimen-choice">
      {label}:{' '}
      {options.map((o) => (
        <button key={o} type="button" className="lang-btn" aria-pressed={o === value} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}{' '}
    </span>
  );
}

export function Specimen() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <Sheet paper={prefs.paper} margin={<p className="ink ink--small ink--note margin-date">≈ 3 m</p>}>
      <div className="ui-line">
        <Choice<PaperType> label="paper" value={prefs.paper} options={['lined', 'dotted', 'grid', 'blank']} onPick={(paper) => setPrefs({ paper })} />
        <Choice<Hand> label="hand" value={prefs.hand} options={['caveat', 'playpen']} onPick={(hand) => setPrefs({ hand })} />
      </div>
      <div className="ui-line">
        <Choice<Ink> label="ink" value={prefs.ink} options={['graphite', 'blueblack', 'sepia']} onPick={(ink) => setPrefs({ ink })} />
        <Choice<ThemePref> label="theme" value={prefs.theme} options={['system', 'light', 'dark']} onPick={(theme) => setPrefs({ theme })} />
      </div>
      <Wordmark rules={3} />
      <h1 className="ink ink--title">Oktopus · Größe</h1>
      <p className="ink">{SAMPLES.en}</p>
      <p className="ink gap-1">{SAMPLES.de}</p>
      <p className="ink gap-1">{SAMPLES.fr}</p>
      <p className="ink ink--small ink--note gap-1">a note in the margin: 1879–1955 · ½ · 25 °C</p>
      <p className="ui-line gap-1">Adapted from Wikipedia · CC BY-SA · read the original</p>
    </Sheet>
  );
}
