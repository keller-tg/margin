import { describe, expect, it } from 'vitest';
import { imageId, thumbUrl } from './build-images';

// HANDMADE records shaped like content/images/used.json entries (URLs copied from real ones).
const lion = {
  width: 5168, mime: 'image/jpeg',
  original: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/020_The_lion_king.jpg',
  thumb: { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/020_The_lion_king.jpg/960px-020_The_lion_king.jpg', width: 960, height: 640 },
};

describe('thumbUrl', () => {
  it('asks upload.wikimedia.org for the 1280 standard width', () => {
    expect(thumbUrl(lion)).toEqual({ url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/020_The_lion_king.jpg/1280px-020_The_lion_king.jpg', width: 1280 });
  });
  it('keeps the TIFF page prefix', () => {
    const tif = { ...lion, mime: 'image/tiff', thumb: { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Tuba.tif/lossy-page1-500px-Tuba.tif.jpg', width: 500, height: 900 } };
    expect(thumbUrl(tif).url).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Tuba.tif/lossy-page1-1280px-Tuba.tif.jpg');
  });
  it('uses small JPEG/PNG originals directly, never a non-standard width', () => {
    expect(thumbUrl({ ...lion, width: 1100 })).toEqual({ url: lion.original, width: 1100 });
    const smallTif = { ...lion, width: 1100, mime: 'image/tiff', thumb: { url: 'https://thumb.wikimedia.org/x/lossy-page1-500px-T.tif.jpg', width: 500, height: 500 } };
    expect(thumbUrl(smallTif).width).toBe(960);
  });
  it('ids are stable SHA-1 prefixes', () => expect(imageId('2d87b38e53e6223b99ea68ced19a8ed1677e11a7')).toBe('2d87b38e53e6'));
});
