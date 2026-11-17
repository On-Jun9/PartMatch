const templateFonts = [
  { family: '돋움', source: 'url(/api/excel/fonts/dotum.woff2?v=2)' },
  { family: '굴림', source: 'url(/api/excel/fonts/gulim.woff2?v=2)' },
];

export function getPrintFonts(cells: readonly { text: string; font: { family: string } }[]) {
  const used = new Set(cells.filter((cell) => cell.text.trim()).map((cell) => cell.font.family));
  // react-to-print waits for every supplied font, including unused faces that
  // the browser never starts loading. Only supply fonts used by printed text.
  return templateFonts.filter((font) => used.has(font.family));
}
