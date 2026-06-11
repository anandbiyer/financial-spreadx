"use client";

/**
 * PdfPane — page-level PDF viewer (Q20). Uses the browser's native PDF viewer via an
 * iframe + `#page=N` fragment; remounting on `page` change forces a jump to that page.
 * (Line-level highlighting was cut from v1, so react-pdf/pdfjs isn't needed.)
 */
export function PdfPane({ docId, page }: { docId: string; page: number }) {
  const src = `/api/documents/${docId}/pdf#page=${page}&view=FitH`;
  return (
    <>
      <iframe
        key={page}
        src={src}
        title="Extracted page"
        style={{ flex: 1, width: "100%", border: "none", background: "#475569", minHeight: 0 }}
      />
      <div className="pdf-nav">
        <span>Source PDF</span>
        <span>page {page}</span>
      </div>
    </>
  );
}
