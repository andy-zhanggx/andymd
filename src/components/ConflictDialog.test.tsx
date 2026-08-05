import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConflictDialogView } from './ConflictDialog';

const noop = () => {};

describe('ConflictDialogView', () => {
  it('shows the file name, a diff of both versions, and all actions', () => {
    const html = renderToStaticMarkup(
      <ConflictDialogView
        fileName="note.md"
        base={'title\nalpha\nbeta'}
        draft={'title MINE\nalpha\nbeta'}
        conflict={{ diskContent: 'title\nalpha\nbeta THEIRS', diskMtime: 2 }}
        onResolve={noop}
        onDismiss={noop}
      />,
    );
    expect(html).toContain('File changed on disk');
    expect(html).toContain('note.md');
    expect(html).toContain('title MINE'); // del row (yours)
    expect(html).toContain('beta THEIRS'); // add row (disk)
    expect(html).toContain('Keep mine');
    expect(html).toContain('Use disk version');
    expect(html).toContain('Merge both');
    expect(html).toContain('Decide later');
  });

  it('announces the number of overlapping regions on the merge button', () => {
    const html = renderToStaticMarkup(
      <ConflictDialogView
        fileName="note.md"
        base={'line'}
        draft={'line MINE'}
        conflict={{ diskContent: 'line THEIRS', diskMtime: 2 }}
        onResolve={noop}
        onDismiss={noop}
      />,
    );
    expect(html).toContain('Merge both (1 overlap)');
  });
});
