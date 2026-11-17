import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPrintFonts } from '../src/utils/invoiceFonts.ts';

const text = (family, value = '거래명세서') => ({ text: value, font: { family } });

test('a single font invoice does not wait for an unused template font', () => {
  assert.deepEqual(getPrintFonts([text('돋움'), text('돋움')]).map((font) => font.family), ['돋움']);
  assert.deepEqual(getPrintFonts([text('굴림')]).map((font) => font.family), ['굴림']);
});

test('both template fonts remain available when their text is printed', () => {
  assert.deepEqual(getPrintFonts([text('굴림'), text('돋움')]).map((font) => font.family), ['돋움', '굴림']);
});

test('empty cells, whitespace and system fonts add no font loading dependency', () => {
  assert.deepEqual(getPrintFonts([]), []);
  assert.deepEqual(getPrintFonts([text('돋움', ''), text('굴림', ' \n '), text('Arial')]), []);
});
