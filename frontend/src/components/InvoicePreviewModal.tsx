import { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useReactToPrint } from 'react-to-print';
import { readCellValue } from '../utils/invoiceFormulas';
import { getPrintFonts } from '../utils/invoiceFonts';
import { pageGeometry, sheetGeometry } from '../utils/invoiceLayout';
import { InvoiceSheet } from './InvoiceSheet';
import type { SheetPreview, SheetCell } from './InvoiceSheet';
import type { PrintLayout } from '../utils/invoiceLayout';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  excelBlob: Blob | null;
  isLoading: boolean;
}

let templateFonts: Promise<boolean> | undefined;

function loadTemplateFonts(): Promise<boolean> {
  templateFonts ??= Promise.all([['돋움', 'dotum'], ['굴림', 'gulim']].map(async ([family, file]) => {
    try {
      const font = new FontFace(family, `url(/api/excel/fonts/${file}.woff2?v=2)`);
      await font.load();
      document.fonts.add(font);
      return false;
    } catch { return true; }
  })).then((warnings) => {
    const warning = warnings.some(Boolean);
    if (warning) templateFonts = undefined;
    return warning;
  });
  return templateFonts;
}

async function parseExcelBlob(blob: Blob): Promise<SheetPreview> {
  // cellStyles also loads the original column widths and row heights.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
  let metadata = (workbook.Custprops as Record<string, unknown> | undefined)?.PartMatchPrintLayout;
  // SheetJS 0.18 drops custom values when the XML namespace is declared
  // on the value element (the valid form written by openpyxl).
  if (typeof metadata !== 'string') {
    const archive = XLSX.CFB.read(bytes, { type: 'array' });
    const propertyFile = XLSX.CFB.find(archive, '/docProps/custom.xml');
    if (propertyFile?.content) {
      const xml = new DOMParser().parseFromString(new TextDecoder().decode(propertyFile.content as Uint8Array), 'application/xml');
      metadata = xml.querySelector('property[name="PartMatchPrintLayout"]')?.textContent;
    }
  }
  if (typeof metadata !== 'string') throw new Error('인쇄 설정이 없는 이전 파일입니다. 작성 화면에서 다시 생성해주세요.');
  const layout = JSON.parse(metadata) as PrintLayout;
  const source = workbook.Sheets[layout.sheet_name];
  if (!source || !layout.cells) throw new Error('서식 정보가 없는 이전 파일입니다. 다시 생성해주세요.');
  const { area, bounds, columns, rows, region } = sheetGeometry(layout, source);
  const page = pageGeometry(layout, region.width, region.height);
  // Fonts are local assets, kept outside Git and supplied with the template.
  const fontWarning = await loadTemplateFonts();
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('글자 크기를 계산할 수 없습니다.');
  const cells: SheetCell[] = layout.cells.filter((style) => {
    const merge = source['!merges']?.find((m) => m.s.r === style.r && m.s.c === style.c);
    return style.r <= area.e.r && (merge?.e.r ?? style.r) >= area.s.r
      && style.c <= area.e.c && (merge?.e.c ?? style.c) >= area.s.c
      && columns[(merge?.e.c ?? style.c) + 1] > columns[style.c]
      && rows[(merge?.e.r ?? style.r) + 1] > rows[style.r];
  }).map((style) => {
    const merge = source['!merges']?.find((m) => m.s.r === style.r && m.s.c === style.c);
    const lastRow = merge?.e.r ?? style.r, lastCol = merge?.e.c ?? style.c;
    const x = columns[style.c], y = rows[style.r];
    const width = columns[lastCol + 1] - x, height = rows[lastRow + 1] - y;
    const value = readCellValue(source, XLSX.utils.encode_cell({ r: style.r, c: style.c }));
    const numeric = typeof value === 'number';
    const text: string = value == null ? '' : numeric ? XLSX.SSF.format(style.format, value) : String(value);
    measure.font = `${style.font.bold ? 'bold ' : ''}${style.font.size}pt "${style.font.family}", Arial, sans-serif`;
    const textWidth = measure.measureText(text).width * 72 / 96;
    const fontSize = style.shrink && textWidth > width - 4 ? style.font.size * (width - 4) / textWidth : style.font.size;
    let lines = text.split(/\r?\n/);
    if (style.wrap) {
      lines = lines.flatMap((line) => {
        const wrapped: string[] = []; let current = '';
        for (const char of line) {
          if (current && measure.measureText(current + char).width * 72 / 96 > width - 4) { wrapped.push(current); current = char; }
          else current += char;
        }
        wrapped.push(current); return wrapped;
      });
    }
    let overflowWidth = width;
    if (!merge && !style.wrap && !numeric && text) {
      let end = style.c;
      while (end < bounds.e.c) {
        const next = source[XLSX.utils.encode_cell({ r: style.r, c: end + 1 })];
        if (next?.v != null || next?.f || source['!merges']?.some((m) => style.r >= m.s.r && style.r <= m.e.r && end + 1 >= m.s.c && end + 1 <= m.e.c)) break;
        end++;
      }
      overflowWidth = columns[end + 1] - x;
    }
    return { ...style, x, y, width, height, text, lines, textWidth, fontSize, numeric, merged: !!merge, overflowWidth };
  });
  return { cells, columns, rows, region, page, fontWarning };
}

export function InvoicePreviewModal({ isOpen, onClose, onDownload, excelBlob, isLoading }: InvoicePreviewModalProps) {
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fit, setFit] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !excelBlob) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    parseExcelBlob(excelBlob).then((data) => {
      if (!cancelled) setPreview(data);
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : '엑셀을 읽지 못했습니다. 원본 파일을 다운로드해주세요.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, excelBlob]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isOpen]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: '거래명세서',
    pageStyle: preview ? `@page { size: ${preview.page.mmWidth}mm ${preview.page.mmHeight}mm; margin: 0; } body { margin: 0; } .invoice-print { width: ${preview.page.mmWidth}mm; height: ${preview.page.mmHeight}mm; } .invoice-print svg { display: block; }` : undefined,
    fonts: getPrintFonts(preview?.cells ?? []),
    onPrintError: () => setError('인쇄를 준비하지 못했습니다. 엑셀 파일을 다운로드해 인쇄해주세요.'),
  });
  if (!isOpen) return null;
  const pageWidth = preview ? preview.page.pageWidth * 96 / 72 : 0;
  const pageHeight = preview ? preview.page.pageHeight * 96 / 72 : 0;
  const scale = preview && fit ? Math.min(1, Math.max(0.1, (viewportWidth - 32) / pageWidth)) : 1;
  const ready = !!preview && !loading && !isLoading;
  const buttonClass = 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="preview-modal-title" aria-describedby="preview-description" tabIndex={-1}
        onClick={(event) => event.stopPropagation()} className="flex h-[92dvh] w-[96vw] max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl outline-none">
        <header className="flex items-center justify-between bg-[#217346] px-4 py-3 text-white">
          <h2 id="preview-modal-title" className="text-lg font-semibold">거래명세서 미리보기</h2>
          <button type="button" onClick={onClose} aria-label="미리보기 닫기" className="rounded px-3 py-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2">닫기</button>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <p id="preview-description" className="text-sm text-gray-600">내용 수정은 작성 화면에서 해주세요.</p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} aria-pressed={fit} onClick={() => setFit(true)}>너비 맞춤</button>
            <button type="button" className={buttonClass} aria-pressed={!fit} onClick={() => setFit(false)}>100%</button>
          </div>
        </div>
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto bg-gray-200 p-4" aria-busy={loading || isLoading}>
          {(loading || isLoading) && <p role="status" className="p-8 text-center text-gray-700">미리보기를 준비하고 있습니다…</p>}
          {error && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
          {preview?.fontWarning && <p role="status" className="mb-4 bg-amber-50 p-3 text-sm text-amber-900">템플릿 글꼴이 없어 대체 글꼴로 표시됩니다. 원본과 동일하게 보려면 서버에 템플릿 글꼴을 설치해주세요.</p>}
          {preview && <div className="mx-auto bg-white" style={{ width: pageWidth * scale, height: pageHeight * scale }}>
            <div style={{ width: pageWidth, height: pageHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <InvoiceSheet preview={preview} />
            </div>
          </div>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t bg-gray-50 px-4 py-3">
          <button type="button" onClick={onClose} className={buttonClass}>작성 화면으로</button>
          <button type="button" onClick={handlePrint} disabled={!ready} className={buttonClass}>인쇄</button>
          <button type="button" onClick={onDownload} disabled={!excelBlob || isLoading} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">엑셀 다운로드</button>
        </footer>
        <div style={{ display: 'none' }}>
          <div ref={printRef} className="invoice-print">
            {preview && <InvoiceSheet preview={preview} />}
          </div>
        </div>
      </div>
    </div>
  );
}
