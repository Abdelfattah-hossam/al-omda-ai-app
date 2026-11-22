import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUnverifiedDownloadLinks } from './deliverable-quality.js';
test('rejects fabricated example and file download links', () => {
 assert.equal(hasUnverifiedDownloadLinks('[download](https://example.com/deck)', ''), true);
 assert.equal(hasUnverifiedDownloadLinks('[deck](https://files.invalid/deck.pptx)', ''), true);
});
test('keeps real source links and supplied file links', () => {
 const link = 'https://files.invalid/input.pdf';
 assert.equal(hasUnverifiedDownloadLinks('[input](' + link + ')', link), false);
 assert.equal(hasUnverifiedDownloadLinks('[reference](https://www.who.int/)', ''), false);
 assert.equal(hasUnverifiedDownloadLinks('const url = "https://example.com";', ''), false);
});
