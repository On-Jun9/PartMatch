import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCell, readCellValue } from '../src/utils/invoiceFormulas.ts';

const invoice = (supply) => ({
  O14: { v: 2 }, R14: { v: 15000 },
  X14: supply === undefined ? { f: '$O14*$R14' } : { v: supply },
  AH14: { f: 'X14*0.1' },
  X38: { f: 'SUM(X14:AG37)' }, AH38: { f: 'SUM(AH14:AP37)' },
  AH11: { f: 'X38+AH38' }, L11: { f: 'AH11' },
});
test('invoice tax, range totals and grand total without cached formula values', () => {
  const sheet = invoice();
  assert.equal(calculateCell(sheet, 'AH14'), 3000);
  assert.equal(calculateCell(sheet, 'L11'), 33000);
});
test('manual supply price and zero take precedence over quantity times price', () => {
  assert.equal(calculateCell(invoice(10000), 'L11'), 11000);
  assert.equal(calculateCell(invoice(0), 'L11'), 0);
});
test('circular and unsupported formulas fail explicitly', () => {
  assert.throws(() => calculateCell({ A1: { f: 'A2' }, A2: { f: 'A1' } }, 'A1'), /순환/);
  assert.throws(() => calculateCell({ A1: { f: 'NOW()' } }, 'A1'), /계산할 수 없/);
});

test('an oversized SUM fails before iterating through the workbook', () => {
  let reads = 0;
  const source = new Proxy({ A1: { f: 'SUM(A100:XFD1048576)' } }, {
    get(target, key) {
      if (typeof key === 'string' && /^[A-Z]+\d+$/.test(key) && ++reads > 20000) {
        throw new Error('test stopped excessive cell reads');
      }
      return target[key];
    },
  });
  assert.throws(() => calculateCell(source, 'A1'), /계산 범위가 너무/);
  assert.ok(reads < 10);
});

test('Excel error codes cannot become amounts or referenced totals', () => {
  const source = { A1: { t: 'e', v: 42 }, B1: { f: 'A1+100' } };
  assert.throws(() => calculateCell(source, 'A1'), /엑셀 오류/);
  assert.throws(() => calculateCell(source, 'B1'), /엑셀 오류/);
  assert.throws(() => readCellValue(source, 'A1'), /엑셀 오류/);
});

test('literal user text stays text while template formulas still calculate', () => {
  const source = { A1: { t: 's', v: '#N/A' }, A2: { t: 's', v: '=SUM(A100:XFD1048576)' }, B1: { f: '2*15000' } };
  assert.equal(readCellValue(source, 'A1'), '#N/A');
  assert.equal(readCellValue(source, 'A2'), '=SUM(A100:XFD1048576)');
  assert.equal(readCellValue(source, 'B1'), 30000);
});

test('deep formula chains fail without overflowing the call stack', () => {
  const source = {};
  for (let row = 1; row <= 200; row++) source[`A${row}`] = { f: `A${row + 1}` };
  source.A201 = { v: 1 };
  assert.throws(() => calculateCell(source, 'A1'), /참조가 너무 깊/);
});
