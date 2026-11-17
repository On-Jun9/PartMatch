import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { pageGeometry, sheetGeometry } from '../src/utils/invoiceLayout.ts';

const template = { sheet_name: '출력 양식', ranges: ['A2:AP44'], paper_size: 9, orientation: 'portrait', scale: 0.91,
  fit_to_page: false, fit_to_width: 1, fit_to_height: 1,
  margins_mm: { top: 19, right: 6, bottom: 19, left: 6 }, horizontal_centered: true,
  vertical_centered: false, default_row_height_pt: 15, row_heights_pt: [] };

test('A4 page uses template scale and margins with its actual print area', () => {
  const page = pageGeometry(template, 472, 804);
  assert.equal(page.mmWidth, 210);
  assert.equal(page.mmHeight, 297);
  assert.equal(page.scale, 0.91);
  assert.ok(Math.abs(page.y * 25.4 / 72 - 19) < 0.001);
  assert.ok(Math.abs(page.x - (page.pageWidth - 472 * 0.91) / 2) < 0.001);
});
test('different template paper, orientation, margins and scale are respected', () => {
  const page = pageGeometry({ ...template, paper_size: 1, orientation: 'landscape', scale: 0.75,
    horizontal_centered: false, margins_mm: { top: 12, right: 13, bottom: 14, left: 15 } }, 600, 400);
  assert.equal(page.mmWidth, 279.4);
  assert.equal(page.mmHeight, 215.9);
  assert.equal(page.scale, 0.75);
  assert.ok(Math.abs(page.x * 25.4 / 72 - 15) < 0.001);
});
test('unsupported or overflowing layouts are reported rather than silently rescaled', () => {
  assert.throws(() => pageGeometry({ ...template, paper_size: 999 }, 472, 804));
  assert.throws(() => pageGeometry(template, 1200, 1800), /한 페이지/);
});

test('print area includes empty rows and columns beyond the used cells', () => {
  const geometry = sheetGeometry({ ...template, ranges: ['B3:AP44'] }, {
    '!ref': 'A1:AH14', '!cols': [{ wpx: 10 }, { wpx: 20 }],
  });
  assert.equal(geometry.region.x, 7.5);
  assert.equal(geometry.region.y, 30);
  assert.equal(geometry.region.width, 15 + 40 * 54.75);
  assert.equal(geometry.region.height, 42 * 15);
  assert.ok(Object.values(geometry.region).every(Number.isFinite));
});

test('missing and multiple print areas fail before selecting a partial area', () => {
  assert.throws(() => sheetGeometry({ ...template, ranges: [] }, {}), /인쇄 영역이 없습니다/);
  assert.throws(() => sheetGeometry({ ...template, ranges: ['A2:AP20', 'A25:AP44'] }, {}), /한 개/);
});

test('hidden rows and columns consume no printable space', () => {
  const geometry = sheetGeometry({ ...template, ranges: ['A1:B3'], row_heights_pt: [10, 0, 20] }, {
    '!ref': 'A1:B3', '!cols': [{ wpx: 10, hidden: true }, { wpx: 20 }],
  });
  assert.equal(geometry.region.width, 15);
  assert.equal(geometry.region.height, 30);
});

test('a one inch square stays square after reading XLSX pixel column widths', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['square']]);
  sheet['!cols'] = [{ wpx: 96 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Square');
  const restored = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    type: 'buffer', cellStyles: true,
  }).Sheets.Square;
  const geometry = sheetGeometry({ ...template, ranges: ['A1:A1'], row_heights_pt: [72] }, restored);
  assert.equal(geometry.region.width, 72);
  assert.equal(geometry.region.height, 72);
  assert.equal(geometry.region.width * 25.4 / 72, 25.4);
});

test('fit to one page uses the printable page size and overrides percentage scale', () => {
  const page = pageGeometry({ ...template, fit_to_page: true, scale: 0.2 }, 1200, 1800);
  const expected = Math.min((210 - 12) * 72 / 25.4 / 1200, (297 - 38) * 72 / 25.4 / 1800);
  assert.ok(Math.abs(page.scale - expected) < 1e-10);
});

test('fit to width preserves automatic height and checks the one page limit', () => {
  const layout = { ...template, fit_to_page: true, fit_to_width: 1, fit_to_height: 0 };
  const page = pageGeometry(layout, 1200, 800);
  assert.ok(Math.abs(page.scale - (210 - 12) * 72 / 25.4 / 1200) < 1e-10);
  assert.throws(() => pageGeometry(layout, 1200, 3000), /한 페이지/);
  assert.throws(() => pageGeometry({ ...layout, fit_to_width: 2 }, 1200, 800), /한 페이지/);
});

test('vertical centering follows the template and invalid geometry cannot enable printing', () => {
  const page = pageGeometry({ ...template, vertical_centered: true }, 400, 600);
  assert.ok(Math.abs(page.y - (page.pageHeight - 600 * template.scale) / 2) < 1e-10);
  for (const [width, height] of [[NaN, 600], [400, NaN], [Infinity, 600], [0, 600]]) {
    assert.throws(() => pageGeometry(template, width, height), /크기를 계산/);
  }
});
