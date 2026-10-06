// Image licensing: which Commons files Margin may use, and how they are credited.
// Pure functions. Input is the imageinfo entry the Action API returns for a File: title
// (asked of a language edition; Commons files come through as imagerepository "shared").
//
// Rules (approved 2026-10-05):
//  - License: LicenseShortName must be CC0, Public domain, CC BY or CC BY-SA.
//  - License URL: required for CC BY / CC BY-SA. Empty is allowed for Public domain and CC0;
//    then the credit links to the Commons file page. A URL is never invented.
//  - Author: Artist reduced to plain text, signatures/timestamps cut, first meaningful line.
//    If that is empty or longer than 80 characters, fall back to the uploader's username.
//    Reject the image only if both fail. Every fallback and rejection is reported as an event.
//  - Attribution: if the Attribution field exists it is shown verbatim; otherwise the standard
//    credit is built from author + license + file page. AttributionRequired is stored.
//  - The Commons file page link is always part of the credit.
//  - All API strings are untrusted and stored as plain text only.
import { htmlToText } from '../text/plain';

export const AUTHOR_MAX = 80;

export type ImageInfo = {
  title: string;
  imagerepository?: string;
  imageinfo?: {
    user?: string;
    width: number;
    height: number;
    mime?: string;
    sha1?: string;
    url?: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown } | undefined>;
  }[];
  /** Shared (Commons) files have no local page: the language edition reports missing + known. */
  missing?: boolean;
  known?: boolean;
};

export type Credit = {
  /** Plain text. Artist (cleaned) or, as a fallback, the uploader's Commons username. */
  author: string;
  authorSource: 'artist' | 'uploader';
  /** Plain text, as Commons states it (e.g. "CC BY-SA 4.0", "Public domain"). */
  license: string;
  /** Present for CC BY / CC BY-SA; null for Public domain / CC0. Never invented. */
  licenseUrl: string | null;
  /** The Commons file page. Always present, always linked. */
  fileUrl: string;
  /** The uploader's own attribution text, verbatim (plain text), if they set one. */
  attribution: string | null;
  attributionRequired: boolean;
};

export type ImageRecord = {
  file: string; // "File:Name.jpg" (canonical, English namespace)
  width: number;
  height: number;
  mime: string;
  sha1: string;
  original: string;
  thumb: { url: string; width: number; height: number } | null;
  credit: Credit;
};

export type ImageEvent =
  | 'author-uploader-fallback'
  | 'author-uploader-is-bot'
  | 'author-signature-stripped'
  | 'author-multiline-trimmed'
  | 'attribution-verbatim'
  | 'license-url-absent-pd'
  | 'personality-rights';

export type ImageVerdict =
  | { ok: true; record: ImageRecord; events: ImageEvent[] }
  | { ok: false; file: string; reason: string; events: ImageEvent[] };

const meta = (ii: NonNullable<ImageInfo['imageinfo']>[number], key: string): string => {
  const v = ii.extmetadata?.[key]?.value;
  return typeof v === 'string' ? v : v == null ? '' : String(v);
};

export type LicenseKind = 'pd' | 'cc0' | 'cc-by' | 'cc-by-sa';

/** Classify a LicenseShortName; null = not on the allowlist (NC, ND, GFDL-only, FAL, fair use…). */
export function classifyLicense(shortName: string): LicenseKind | null {
  const s = htmlToText(shortName).trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(public domain|pd|pd-[\w-]+)$/.test(s)) return 'pd';
  if (/^cc0( 1\.0)?( universal)?$/.test(s)) return 'cc0';
  if (/^cc[ -]by-sa [1-4]\.\d( [a-z]{2,}(-[a-z]+)?)?$/.test(s)) return 'cc-by-sa';
  if (/^cc[ -]by [1-4]\.\d( [a-z]{2,}(-[a-z]+)?)?$/.test(s)) return 'cc-by';
  return null;
}

export const needsLicenseUrl = (k: LicenseKind) => k === 'cc-by' || k === 'cc-by-sa';

const SIGNATURE = String.raw`\s*(--|—|–)?\s*\d{1,2}:\d{2}, \d{1,2}\.? [\p{L}]+\.? \d{4} \((UTC|CES?T|MES?Z)\)`;
const FILE_LINE = /^[^\s]+\.(jpe?g|png|tiff?|svg|gif|webp)\s*:?$/i;

/**
 * Artist HTML → a short, plain author name, or null.
 * Returns the cleaned name and what had to be done to it.
 */
export function cleanAuthor(artistHtml: string): { name: string | null; events: ImageEvent[] } {
  const events: ImageEvent[] = [];
  let text = htmlToText(artistHtml);
  const signature = new RegExp(SIGNATURE, 'gu');
  if (signature.test(text)) {
    events.push('author-signature-stripped');
    text = text.replace(new RegExp(SIGNATURE, 'gu'), '');
  }
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-–—~\s]+/, '').replace(/^(user|benutzer|utilisateur):/i, '').replace(/[\s,;:(–—-]+$/, '').trim())
    .filter((l) => /\p{L}/u.test(l) && !FILE_LINE.test(l) && !/^(derivative work|this file was derived from)/i.test(l));
  if (lines.length === 0) return { name: null, events };
  if (lines.length > 1) events.push('author-multiline-trimmed');
  const name = lines[0]!.replace(/\s+/g, ' ');
  if (name.length > AUTHOR_MAX) return { name: null, events };
  return { name, events };
}

/** Commons file page for a file title, from the API's descriptionurl (never constructed by hand). */
function fileUrlOf(ii: NonNullable<ImageInfo['imageinfo']>[number]): string | null {
  const u = ii.descriptionurl;
  return typeof u === 'string' && u.startsWith('https://commons.wikimedia.org/wiki/') ? u : null;
}

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff']);

/**
 * Maintenance and review bots upload new versions (rotations, crops) or transfer files; they are never
 * the author. "FlickreviewR" reviews Flickr licenses; "File Upload Bot (Magnus Manske)" transfers files.
 */
export function isBotAccount(name: string): boolean {
  return /bot\b|bot$|^FlickreviewR|^File Upload Bot|^CommonsDelinker|^Commons fair use upload bot/i.test(name.trim());
}

export type EvaluateOptions = {
  /**
   * The uploader of the file's first version (from its history). The `user` in a plain imageinfo
   * response is the uploader of the latest version, often a bot that only rotated or cropped the file.
   * When given, this is the uploader the author fallback uses.
   */
  originalUploader?: string | null;
};

/** Decide whether a file may be used, and build its credit. */
export function evaluateImage(info: ImageInfo, opts: EvaluateOptions = {}): ImageVerdict {
  const file = canonicalFileTitle(info.title);
  const events: ImageEvent[] = [];
  const no = (reason: string): ImageVerdict => ({ ok: false, file, reason, events });

  const ii = info.imageinfo?.[0];
  if (!ii) return no('missing');
  if (info.imagerepository !== 'shared') return no(`not-on-commons (${info.imagerepository ?? 'unknown'})`);
  const fileUrl = fileUrlOf(ii);
  if (!fileUrl) return no('no-file-page');

  const mime = ii.mime ?? '';
  if (!ACCEPTED_MIME.has(mime)) return no(`mime ${mime || 'unknown'}`);
  if (Math.max(ii.width, ii.height) < 800 || Math.min(ii.width, ii.height) < 400) return no('too-small');
  if (ii.width / ii.height > 3 || ii.height / ii.width > 3) return no('extreme-aspect');

  if (meta(ii, 'NonFree') && meta(ii, 'NonFree').toLowerCase() !== 'false') return no('non-free');
  const restrictions = htmlToText(meta(ii, 'Restrictions')).toLowerCase();
  if (/trademark|insignia/.test(restrictions)) return no(`restricted (${restrictions})`);
  if (/personality/.test(restrictions)) events.push('personality-rights');

  const licenseShort = htmlToText(meta(ii, 'LicenseShortName')).trim();
  const kind = classifyLicense(licenseShort);
  if (!kind) return no(`license-not-allowed (${licenseShort || 'none'})`);
  const licenseUrlRaw = htmlToText(meta(ii, 'LicenseUrl')).trim();
  const licenseUrl = /^https?:\/\/[^\s<>"]+$/.test(licenseUrlRaw) ? licenseUrlRaw.replace(/^http:/, 'https:') : null;
  if (needsLicenseUrl(kind) && !licenseUrl) return no('license-url-missing');
  if (!needsLicenseUrl(kind) && !licenseUrl) events.push('license-url-absent-pd');

  const a = cleanAuthor(meta(ii, 'Artist'));
  events.push(...a.events);
  let author = a.name;
  let authorSource: Credit['authorSource'] = 'artist';
  if (!author) {
    const uploader = htmlToText((opts.originalUploader !== undefined ? opts.originalUploader : ii.user) ?? '').trim();
    if (!uploader || uploader.length > AUTHOR_MAX || isBotAccount(uploader)) return no('no-author (artist and uploader both unusable)');
    author = uploader;
    authorSource = 'uploader';
    events.push('author-uploader-fallback');
  }

  const attributionText = htmlToText(meta(ii, 'Attribution')).replace(/\s+/g, ' ').trim();
  const attribution = attributionText ? attributionText.slice(0, 200) : null;
  if (attribution) events.push('attribution-verbatim');
  const attributionRequired = meta(ii, 'AttributionRequired').toLowerCase() === 'true';

  const thumb =
    ii.thumburl && ii.thumbwidth && ii.thumbheight
      ? { url: ii.thumburl.replace(/\?.*$/, ''), width: ii.thumbwidth, height: ii.thumbheight }
      : null;

  return {
    ok: true,
    events,
    record: {
      file,
      width: ii.width,
      height: ii.height,
      mime,
      sha1: ii.sha1 ?? '',
      original: (ii.url ?? '').replace(/\?.*$/, ''),
      thumb,
      credit: { author, authorSource, license: licenseShort, licenseUrl, fileUrl, attribution, attributionRequired },
    },
  };
}

/** "Datei:A b.jpg" / "Fichier:A_b.jpg" / "A b.jpg" → "File:A b.jpg". */
export function canonicalFileTitle(t: string): string {
  const name = t.replace(/^(file|datei|fichier|image|bild):/i, '').replace(/_/g, ' ').trim();
  return `File:${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * The credit as plain-text parts, for rendering as text nodes with one link (the file page).
 * If the uploader set an Attribution, it is shown verbatim instead of the author name.
 */
export function creditLine(c: Credit): { who: string; license: string; licenseUrl: string | null; fileUrl: string } {
  return { who: c.attribution ?? c.author, license: c.license, licenseUrl: c.licenseUrl, fileUrl: c.fileUrl };
}
