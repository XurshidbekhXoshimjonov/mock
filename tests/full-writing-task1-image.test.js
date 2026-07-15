const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const fullWritingHtml = fs.readFileSync(
    path.join(__dirname, '..', 'full-writing-test.html'),
    'utf8'
);

test('Full Writing Task 1 image is eagerly loaded while hidden', () => {
    const imageTag = fullWritingHtml.match(/<img\b[^>]*\bid="t1Image"[^>]*>/i)?.[0] || '';

    assert.ok(imageTag, 'Task 1 image element must exist');
    assert.match(imageTag, /\bloading="eager"/i);
    assert.doesNotMatch(imageTag, /\bloading="lazy"/i);
    assert.match(fullWritingHtml, /img\.loading\s*=\s*['"]eager['"]/);
});

test('Full Writing Task 1 renderer supports both current and legacy image fields', () => {
    assert.match(
        fullWritingHtml,
        /task\?\.visualDiagramUrl\s*\|\|\s*task\?\.imageUrl/,
        'renderer must accept visualDiagramUrl and legacy imageUrl'
    );
    assert.match(fullWritingHtml, /img\.onload\s*=\s*\(\)\s*=>/);
    assert.match(fullWritingHtml, /img\.onerror\s*=\s*\(\)\s*=>/);
});
