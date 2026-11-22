import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOoxmlPackage } from './ooxml-validation';

// Synthetic eight-slide deck produced by PptxGenJS 3.12.0 with no addNotes calls.
// The library still writes one notesSlide part per slide, including blank notes.
test('PptxGenJS packages have a notes part for every slide even without speaker notes', async () => {
  const bytes = readFileSync(new URL('./fixtures/pptxgenjs-eight-slides.pptx', import.meta.url));
  const blob = new Blob([bytes]);
  const options = { requiredEntries: ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels'], expectedSlideCount: 8, expectedText: ['اختبار 0', 'اختبار 7', 'النقطة الأولى', 'النقطة الثانية'] };
  assert.equal(await validateOoxmlPackage(blob, { ...options, expectedNotesCount: 0 }), false, 'documents the old false rejection');
  assert.equal(await validateOoxmlPackage(blob, { ...options, expectedNotesCount: 8 }), true);
  assert.equal(await validateOoxmlPackage(blob, { ...options, expectedSlideCount: 7, expectedNotesCount: 8 }), false, 'wrong slide counts must still fail');
});
