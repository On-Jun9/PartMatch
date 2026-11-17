import { useEffect, useRef } from 'react';

interface InvoicePreviewFailureProps {
  onClose: () => void;
  onDownload: () => void;
}

export function InvoicePreviewFailure({ onClose, onDownload }: InvoicePreviewFailureProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
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
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="preview-failure-title" tabIndex={-1}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 id="preview-failure-title" className="text-lg font-semibold">미리보기를 불러오지 못했습니다.</h2>
        <p role="alert" className="mt-3 text-sm text-gray-700">작성 내용은 유지됩니다. 엑셀 파일을 다운로드해 확인해주세요.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-4 py-2">작성 화면으로</button>
          <button type="button" onClick={onDownload} className="rounded bg-blue-600 px-4 py-2 text-white">엑셀 다운로드</button>
        </div>
      </div>
    </div>;
}
