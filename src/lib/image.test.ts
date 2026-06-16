import { describe, it, expect } from 'vitest';
import { isImagePath, filterImagePaths, isImageFile } from './image';

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
