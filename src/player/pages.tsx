import type { Page, Thing } from '../core/schema/thing';
import type { Manifest } from './data';
import { Photo } from './Photo';

// The three page types of milestone (c): title, sentence, image. The other types (bignumber, timeline,
// map, compare, closing) arrive with milestone (d); until then they are written as plain lines, so a
// day is always readable from start to end.

type Props = { page: Page; thing: Thing; manifest: Manifest };

export function PageBody({ page, thing, manifest }: Props) {
  switch (page.type) {
    case 'title': {
      const img = page.image ? thing.images[page.image] : undefined;
      return (
        <div className="page page--title">
          <h1 className="ink ink--title" data-write>
            {page.title}
          </h1>
          {page.line ? (
            <p className="ink title-line" data-write>
              {page.line}
            </p>
          ) : null}
          {img ? <Photo image={img} entry={manifest[img.file]} size="title" alt={img.alt} /> : null}
        </div>
      );
    }
    case 'sentence':
      return (
        <div className="page page--sentence">
          <p className="ink ink--page" data-write>
            {page.text}
          </p>
        </div>
      );
    case 'image': {
      const img = thing.images[page.image];
      return (
        <div className="page page--image">
          {img ? <Photo image={img} entry={manifest[img.file]} size="page" alt={img.alt} /> : null}
          <p className="ink ink--note photo-caption" data-write>
            {page.caption}
          </p>
        </div>
      );
    }
    // ---- interim renderings until milestone (d) ----
    case 'bignumber':
      return (
        <div className="page page--interim">
          <p className="ink ink--title" data-write>
            {page.display}
          </p>
          <p className="ink" data-write>
            {page.caption}
          </p>
        </div>
      );
    case 'timeline':
      return (
        <div className="page page--interim">
          {page.events.map((e) => (
            <p key={e.fact} className="ink" data-write>
              {String(thing.facts[e.fact]?.value ?? '')} · {e.label}
            </p>
          ))}
        </div>
      );
    case 'closing':
      return (
        <div className="page page--sentence">
          <p className="ink ink--page" data-write>
            {page.text}
          </p>
        </div>
      );
    case 'map':
      return (
        <div className="page page--interim">
          <p className="ink" data-write>
            {page.label}
          </p>
        </div>
      );
    case 'compare':
      return (
        <div className="page page--interim">
          <p className="ink" data-write>
            {page.caption}
          </p>
        </div>
      );
  }
}
