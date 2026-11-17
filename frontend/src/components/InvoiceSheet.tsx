import type { TemplateCell } from '../utils/invoiceLayout';

export interface SheetCell extends TemplateCell {
  x: number; y: number; width: number; height: number;
  text: string; lines: string[]; textWidth: number; fontSize: number;
  merged: boolean; overflowWidth: number; numeric: boolean;
}
export interface SheetPreview {
  cells: SheetCell[];
  columns: number[]; rows: number[];
  region: { x: number; y: number; width: number; height: number };
  page: { pageWidth: number; pageHeight: number; mmWidth: number; mmHeight: number; x: number; y: number; scale: number };
  fontWarning: boolean;
}

const weights: Record<string, number> = { hair: 0.25, thin: 0.5, medium: 1.5, thick: 2, double: 0.5 };

export function InvoiceSheet({ preview }: { preview: SheetPreview }) {
  const { page, region } = preview;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${page.pageWidth} ${page.pageHeight}`} width="100%" height="100%" role="img" aria-label="거래명세서 인쇄 양식">
    <rect width={page.pageWidth} height={page.pageHeight} fill="white" />
    <svg x={page.x} y={page.y} width={region.width * page.scale} height={region.height * page.scale}
      viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`} overflow="hidden">
      {preview.cells.filter((cell) => cell.fill).map((cell) => <rect key={`fill-${cell.r}-${cell.c}`} x={cell.x} y={cell.y}
        width={cell.width} height={cell.height} fill={cell.fill!} />)}
      {preview.cells.map((cell) => <g key={`border-${cell.r}-${cell.c}`}>
        {Object.entries(cell.borders).map(([edge, border]) => {
          const left = cell.x, top = cell.y;
          const right = cell.x + cell.width, bottom = cell.y + cell.height;
          const x1 = edge === 'right' ? right : left, y1 = edge === 'bottom' ? bottom : top;
          const x2 = edge === 'left' ? left : right, y2 = edge === 'top' ? top : bottom;
          return <line key={edge} x1={x1} y1={y1} x2={x2} y2={y2} stroke={border.color} strokeWidth={weights[border.style] ?? 0.5}
            strokeDasharray={border.style === 'dotted' ? '1 1' : border.style.toLowerCase().includes('dash') ? '3 2' : undefined} />;
        })}
      </g>)}
      {preview.cells.filter((cell) => cell.text).map((cell) => {
        const right = cell.align === 'right' || (cell.align === 'general' && cell.numeric);
        const center = cell.align === 'center';
        const x = center ? cell.x + cell.width / 2 : right ? cell.x + cell.width - 2 : cell.x + 2;
        const lineHeight = cell.fontSize * 1.4;
        const blockHeight = cell.lines.length * lineHeight;
        const top = cell.vertical === 'top' ? cell.y + 1 : cell.vertical === 'center' ? cell.y + (cell.height - blockHeight) / 2 : cell.y + cell.height - blockHeight - 1;
        // A local viewport keeps clipping intact when react-to-print clones the
        // SVG into another document; fragment clip-path URLs can lose all text.
        return <svg key={`text-${cell.r}-${cell.c}`} x={cell.x} y={cell.y} width={cell.overflowWidth} height={cell.height}
          viewBox={`${cell.x} ${cell.y} ${cell.overflowWidth} ${cell.height}`} overflow="hidden">
          <text x={x} fontFamily={`"${cell.font.family}", Arial, sans-serif`} fontSize={cell.fontSize}
            fontWeight={cell.font.bold ? 700 : 400} fontStyle={cell.font.italic ? 'italic' : 'normal'} fill={cell.font.color}
            textAnchor={center ? 'middle' : right ? 'end' : 'start'} xmlSpace="preserve">
            {cell.lines.map((line, index) => <tspan key={index} x={x} y={top + index * lineHeight + cell.fontSize * 1.05}>{line || '\u00a0'}</tspan>)}
          </text>
        </svg>;
      })}
    </svg>
  </svg>;
}
