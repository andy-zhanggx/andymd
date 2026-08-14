import { describe, it, expect } from 'vitest';
import {
  isImagePath,
  filterImagePaths,
  isImageFile,
  pastedImageName,
  imagesFromPaste,
} from './image';

describe('isImagePath', () => {
  it('accepts common image extensions case-insensitively', () => {
    expect(isImagePath('/a/b/photo.PNG')).toBe(true);
    expect(isImagePath('cover.jpeg')).toBe(true);
    expect(isImagePath('/x/diagram.svg')).toBe(true);
  });

  it('rejects non-images and extensionless paths', () => {
    expect(isImagePath('/notes/readme.md')).toBe(false);
    expect(isImagePath('/bin/tool')).toBe(false);
    expect(isImagePath('archive.zip')).toBe(false);
  });

  it('ignores query and fragment suffixes', () => {
    expect(isImagePath('/a/pic.png?v=2')).toBe(true);
    expect(isImagePath('/a/pic.webp#frag')).toBe(true);
  });
});

describe('filterImagePaths', () => {
  it('keeps only image paths', () => {
    expect(filterImagePaths(['/a.png', '/b.md', '/c.gif'])).toEqual(['/a.png', '/c.gif']);
  });
});

describe('pastedImageName', () => {
  const now = new Date(2026, 7, 14, 9, 5, 3); // 2026-08-14 09:05:03 local

  it('timestamps generic clipboard names', () => {
    expect(pastedImageName({ name: 'image.png', type: 'image/png' }, now)).toBe(
      'pasted-20260814-090503.png'
    );
    expect(pastedImageName({ name: '', type: 'image/jpeg' }, now)).toBe(
      'pasted-20260814-090503.jpg'
    );
  });

  it('keeps real filenames', () => {
    expect(pastedImageName({ name: '股指走势.png', type: 'image/png' }, now)).toBe('股指走势.png');
  });

  it('falls back to png for unknown MIME types', () => {
    expect(pastedImageName({ name: 'image', type: 'image/x-odd' }, now)).toBe(
      'pasted-20260814-090503.png'
    );
  });
});

describe('imagesFromPaste', () => {
  const imgFile = new File(['x'], 'image.png', { type: 'image/png' });

  it('returns image files from a files-only paste', () => {
    const dt = { files: [imgFile], getData: () => '' };
    expect(imagesFromPaste(dt)).toHaveLength(1);
  });

  it('defers to text when the paste also carries text/plain', () => {
    const dt = { files: [imgFile], getData: (t: string) => (t === 'text/plain' ? 'a\tb' : '') };
    expect(imagesFromPaste(dt)).toHaveLength(0);
  });

  it('handles empty and null transfers', () => {
    expect(imagesFromPaste(null)).toHaveLength(0);
    expect(imagesFromPaste({ files: [], getData: () => '' })).toHaveLength(0);
  });
});

describe('isImageFile', () => {
  it('accepts by MIME type even with an odd name', () => {
    expect(isImageFile({ name: 'clipboard', type: 'image/png' })).toBe(true);
  });
  it('accepts by extension when MIME is empty', () => {
    expect(isImageFile({ name: '股指.jpg.png', type: '' })).toBe(true);
  });
  it('rejects non-images', () => {
    expect(isImageFile({ name: 'notes.md', type: 'text/markdown' })).toBe(false);
  });
});
