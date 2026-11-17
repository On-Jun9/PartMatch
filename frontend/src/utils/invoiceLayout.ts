import * as XLSX from 'xlsx';

export interface PrintLayout {
  sheet_name: string;
  ranges: string[];
  paper_size: number;
  orientation: string;
  scale: number;
  fit_to_page: boolean;
  fit_to_width: number;
  fit_to_height: number;
  margins_mm: { top: number; right: number; bottom: number; left: number };
  horizontal_centered: boolean;
  vertical_centered: boolean;
  default_row_height_pt: number;
  row_heights_pt: number[];
  cells?: TemplateCell[];
}

export interface TemplateCell {
  r: number; c: number;
  font: { family: string; size: number; bold: boolean; italic: boolean; color: string };
  align: string; vertical: string; wrap: boolean; shrink: boolean; format: string;
  fill: string | null;
  borders: Record<string, { style: string; color: string }>;
}

export function sheetGeometry(layout: PrintLayout, source: XLSX.WorkSheet) {
  if (!layout.ranges?.length) throw new Error('템플릿에 인쇄 영역이 없습니다. 엑셀에서 인쇄 영역을 지정해주세요.');
  if (layout.ranges.length !== 1) throw new Error('미리보기는 인쇄 영역 한 개만 지원합니다. 엑셀에서 인쇄 영역을 하나로 지정해주세요.');
  const area = XLSX.utils.decode_range(layout.ranges[0]);
  const bounds = XLSX.utils.decode_range(source['!ref'] ?? layout.ranges[0]);
  const columns = [0];
  const rows = [0];
  for (let c = 0; c <= Math.max(bounds.e.c, area.e.c); c++) {
    const column = source['!cols']?.[c];
    // SheetJS widths are screen pixels; SVG layout, fonts and rows use points.
    columns.push(columns[c] + (column?.hidden ? 0 : (column?.wpx ?? 73) * 72 / 96));
  }
  for (let r = 0; r <= Math.max(bounds.e.r, area.e.r); r++) {
    rows.push(rows[r] + (layout.row_heights_pt[r] ?? layout.default_row_height_pt));
  }
  const region = {
    x: columns[area.s.c], y: rows[area.s.r],
    width: columns[area.e.c + 1] - columns[area.s.c],
    height: rows[area.e.r + 1] - rows[area.s.r],
  };
  return { area, bounds, columns, rows, region };
}

export function pageGeometry(layout: PrintLayout, width: number, height: number) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('템플릿의 인쇄 영역 크기를 계산할 수 없습니다. 엑셀에서 인쇄 영역을 확인해주세요.');
  }
  const sizes: Record<number, [number, number]> = { 1: [215.9, 279.4], 5: [215.9, 355.6], 8: [297, 420], 9: [210, 297], 11: [148, 210] };
  const size = sizes[layout.paper_size];
  if (!size) throw new Error('이 템플릿의 용지 크기는 지원하지 않습니다.');
  const [mmWidth, mmHeight] = layout.orientation === 'landscape' ? [size[1], size[0]] : size;
  const pageWidth = mmWidth * 72 / 25.4;
  const pageHeight = mmHeight * 72 / 25.4;
  const m = layout.margins_mm;
  const availableWidth = pageWidth - (m.left + m.right) * 72 / 25.4;
  const availableHeight = pageHeight - (m.top + m.bottom) * 72 / 25.4;
  if (availableWidth <= 0 || availableHeight <= 0) throw new Error('템플릿의 여백이 용지 크기를 넘습니다.');
  let scale = layout.scale;
  if (layout.fit_to_page) {
    if (layout.fit_to_width > 1 || layout.fit_to_height > 1) {
      throw new Error('미리보기는 한 페이지 양식만 지원합니다. 엑셀에서 페이지 설정을 확인해주세요.');
    }
    scale = Math.min(1,
      layout.fit_to_width === 1 ? availableWidth / width : Infinity,
      layout.fit_to_height === 1 ? availableHeight / height : Infinity);
  }
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('템플릿의 인쇄 배율이 올바르지 않습니다.');
  if (width * scale > availableWidth + 1 || height * scale > availableHeight + 1) {
    throw new Error('템플릿의 인쇄 영역이 한 페이지를 넘습니다. 엑셀에서 페이지 설정을 확인해주세요.');
  }
  return { pageWidth, pageHeight, mmWidth, mmHeight, scale,
    x: m.left * 72 / 25.4 + (layout.horizontal_centered ? (availableWidth - width * scale) / 2 : 0),
    y: m.top * 72 / 25.4 + (layout.vertical_centered ? (availableHeight - height * scale) / 2 : 0) };
}
