import * as XLSX from 'xlsx';

// The invoice template uses references, products, sums, and SUM ranges.
// Resolve these without executing formula text as JavaScript.
export function calculateCell(source: XLSX.WorkSheet, address: string): number {
  let remaining = 10000;
  function resolve(current: string, visiting = new Set<string>()): number {
    if (--remaining < 0) throw new Error('수식 계산 범위가 너무 큽니다. 엑셀 파일에서 확인해주세요.');
    const cell = source[current];
    if (!cell) return 0;
    if (cell.t === 'e') throw new Error(`${current} 셀에 엑셀 오류가 있습니다. 엑셀 파일에서 확인해주세요.`);
    if (!cell.f) return typeof cell.v === 'number' ? cell.v : 0;
    if (visiting.has(current)) throw new Error('엑셀 수식에 순환 참조가 있습니다.');
    if (visiting.size >= 100) throw new Error('수식 참조가 너무 깊습니다. 엑셀 파일에서 확인해주세요.');
    const next = new Set(visiting).add(current);
    const formula = String(cell.f).replace(/\$/g, '').toUpperCase();
    const sum = /^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/.exec(formula);
    if (sum) {
      const range = XLSX.utils.decode_range(`${sum[1]}:${sum[2]}`);
      if ((range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > remaining) {
        throw new Error('수식 계산 범위가 너무 큽니다. 엑셀 파일에서 확인해주세요.');
      }
      let value = 0;
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) value += resolve(XLSX.utils.encode_cell({ r, c }), next);
      }
      return value;
    }
    const numberOrCell = (token: string): number => {
      if (/^[A-Z]+\d+$/.test(token)) return resolve(token, next);
      if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
      throw new Error('이 양식의 수식을 미리보기에서 계산할 수 없습니다. 엑셀 파일에서 확인해주세요.');
    };
    return formula.split('+').reduce((total, term) => total + term.split('*').reduce((product, token) => product * numberOrCell(token), 1), 0);
  }
  return resolve(address);
}

export function readCellValue(source: XLSX.WorkSheet, address: string) {
  const cell = source[address];
  if (cell?.t === 'e') throw new Error(`${address} 셀에 엑셀 오류가 있습니다. 엑셀 파일에서 확인해주세요.`);
  return cell?.f ? calculateCell(source, address) : cell?.v;
}
