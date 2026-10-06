import { describe, expect, it } from 'vitest';
import recorded from '../../../fixtures/wikimedia/imageinfo.recorded.json';
import { classifyLicense, cleanAuthor, creditLine, evaluateImage, isBotAccount, type ImageInfo } from './license';

// RECORDED FIXTURE: real imageinfo responses from en/de/fr.wikipedia.org (see fixtures/README.md).
const pages = recorded.pages as unknown as ImageInfo[];
const byName = (s: string) => {
  const p = pages.find((x) => x.title.includes(s));
  if (!p) throw new Error(`fixture missing ${s}`);
  return structuredClone(p);
};
const ext = (p: ImageInfo) => p.imageinfo![0]!.extmetadata!;

describe('classifyLicense', () => {
  it('accepts the allowlist', () => {
    expect(classifyLicense('CC BY-SA 3.0')).toBe('cc-by-sa');
    expect(classifyLicense('CC BY 2.0 de')).toBe('cc-by');
    expect(classifyLicense('Public domain')).toBe('pd');
    expect(classifyLicense('CC0')).toBe('cc0');
  });
  it('rejects everything else', () => {
    for (const l of ['CC BY-NC-SA 2.0', 'CC BY-ND 4.0', 'GFDL', 'FAL', 'Fair use', '']) expect(classifyLicense(l)).toBeNull();
  });
});

describe('cleanAuthor', () => {
  it('strips talk-page signatures and timestamps', () => {
    const r = cleanAuthor(ext(byName('Kampsbrezel')).Artist!.value as string);
    expect(r.name).toBe('Xocolatl');
    expect(r.events).toContain('author-signature-stripped');
  });
  it('keeps the first meaningful line of multi-line credits', () => {
    const r = cleanAuthor(ext(byName('Octopus vulgaris')).Artist!.value as string);
    expect(r.name).toBe('Albert Kok in der Wikipedia auf Niederländisch');
    expect(r.events).toContain('author-multiline-trimmed');
  });
  it('gives up on credits that are a file name followed by a long blob', () => {
    expect(cleanAuthor(ext(byName('Mont Blanc')).Artist!.value as string).name).toBeNull();
  });
  it('returns null over 80 characters', () => {
    expect(cleanAuthor('x'.repeat(81)).name).toBeNull();
  });
  it('never passes markup through', () => {
    const r = cleanAuthor('<img src=x onerror=alert(1)><b>Jane</b> &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.name).not.toMatch(/[<>]/);
    expect(r.name).toContain('Jane');
  });
});

describe('isBotAccount', () => {
  it('knows bots from people', () => {
    for (const b of ['Rotatebot', 'Topjabot', 'FlickreviewR', 'File Upload Bot (Magnus Manske)', 'CropBot']) expect(isBotAccount(b)).toBe(true);
    for (const h of ['Fæ', 'Jastrow', 'Abbott Lab', 'Benh']) expect(isBotAccount(h)).toBe(false);
  });
});

describe('evaluateImage (recorded responses)', () => {
  it('CC BY-SA with a license URL', () => {
    const v = evaluateImage(byName('Octopus2'));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.record.credit).toMatchObject({
      author: 'albert kok', authorSource: 'artist', license: 'CC BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', attribution: null, attributionRequired: true,
      fileUrl: 'https://commons.wikimedia.org/wiki/File:Octopus2.jpg',
    });
  });
  it('Public domain without a license URL: allowed, links the file page, never invents a URL', () => {
    const v = evaluateImage(byName('Tour Eiffel Wikimedia Commons (cropped)'));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.record.credit.licenseUrl).toBeNull();
    expect(v.record.credit.fileUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(v.events).toContain('license-url-absent-pd');
  });
  it('uses the Attribution field verbatim when present', () => {
    const p = byName('Mont Blanc');
    p.imageinfo![0]!.user = 'Matthieu Riegler'; // HANDMADE EDIT: the recording did not request `user`
    const v = evaluateImage(p);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.record.credit.attribution).toBe('Matthieu Riegler, CC-by');
    expect(creditLine(v.record.credit).who).toBe('Matthieu Riegler, CC-by');
    expect(v.events).toEqual(expect.arrayContaining(['attribution-verbatim', 'author-uploader-fallback']));
  });
  it('falls back to the uploader when the artist is unusable', () => {
    const p = byName('Octopus2');
    ext(p).Artist = { value: 'y'.repeat(120) }; // HANDMADE EDIT
    p.imageinfo![0]!.user = 'Albert kok';
    const v = evaluateImage(p);
    expect(v.ok && v.record.credit).toMatchObject({ author: 'Albert kok', authorSource: 'uploader' });
  });
  it('uses the original uploader when given, and never a bot', () => {
    const p = byName('Octopus2');
    ext(p).Artist = { value: '' }; // HANDMADE EDIT
    p.imageinfo![0]!.user = 'Rotatebot';
    expect(evaluateImage(p).ok).toBe(false); // latest uploader is a bot → both fail
    const v = evaluateImage(p, { originalUploader: 'Albert kok' });
    expect(v.ok && v.record.credit).toMatchObject({ author: 'Albert kok', authorSource: 'uploader' });
    expect(evaluateImage(p, { originalUploader: 'FlickreviewR' }).ok).toBe(false);
  });
  it('rejects only when artist and uploader both fail', () => {
    const p = byName('Octopus2');
    ext(p).Artist = { value: '' }; // HANDMADE EDIT
    delete p.imageinfo![0]!.user;
    const v = evaluateImage(p);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/no-author/);
  });
  it('rejects CC licenses without a license URL', () => {
    const p = byName('Octopus2');
    delete ext(p).LicenseUrl; // HANDMADE EDIT
    expect(evaluateImage(p)).toMatchObject({ ok: false, reason: 'license-url-missing' });
  });
  it('rejects local (non-Commons) files', () => {
    const p = byName('Octopus2');
    p.imagerepository = 'local'; // HANDMADE EDIT
    expect(evaluateImage(p).ok).toBe(false);
  });
});
