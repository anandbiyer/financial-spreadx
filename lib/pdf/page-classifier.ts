// pdf-parse v1 has a known issue where `require('pdf-parse')` tries to read a test PDF.
// Import directly from its lib to avoid this.
async function getPdfParse() {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  return (mod as any).default ?? mod;
}

export type PageClassification = 'digital' | 'scanned' | 'hybrid';

export interface ClassifiedPage {
  pageNumber: number;
  classification: PageClassification;
  wordCount: number;
  asciiRatio: number;
  textContent: string;
  requiresOCR: boolean;
}

/**
 * Classify every page of a PDF as digital, scanned, or hybrid.
 *
 * Thresholds (deterministic — no AI call):
 *   digital : wordCount >= 80  AND  asciiRatio >= 0.90
 *   hybrid  : wordCount 20–79  (partial text layer)
 *   scanned : wordCount < 20   (text layer absent / garbage)
 */
export async function classifyPdfPages(
  pdfBuffer: Buffer,
): Promise<ClassifiedPage[]> {
  const pages: ClassifiedPage[] = [];
  let currentPage = 0;

  const pdfParse = await getPdfParse();
  await pdfParse(pdfBuffer, {
    // pdf-parse calls pagerender for every page in the document
    pagerender: async (pageData: any) => {
      currentPage++;
      const textContent = await pageData.getTextContent();
      const text: string = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      const words = text
        .trim()
        .split(/\s+/)
        .filter((w: string) => w.length > 1);
      const wordCount = words.length;

      const asciiCount = [...text].filter(
        (ch) => ch.charCodeAt(0) < 128,
      ).length;
      const asciiRatio = text.length > 0 ? asciiCount / text.length : 0;

      let classification: PageClassification;
      if (wordCount >= 80 && asciiRatio >= 0.9) {
        classification = 'digital';
      } else if (wordCount >= 20) {
        classification = 'hybrid';
      } else {
        classification = 'scanned';
      }

      pages.push({
        pageNumber: currentPage,
        classification,
        wordCount,
        asciiRatio,
        textContent: classification !== 'scanned' ? text : '',
        requiresOCR: classification === 'scanned',
      });

      // pdf-parse expects a string return from pagerender
      return text;
    },
  });

  // Sort by page number (pagerender order is generally sequential but be safe)
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  return pages;
}

/**
 * Produce a summary object from classified pages.
 */
export function summarizeClassifications(
  pages: ClassifiedPage[],
): { digital: number; scanned: number; hybrid: number; total: number } {
  return {
    digital: pages.filter((p) => p.classification === 'digital').length,
    scanned: pages.filter((p) => p.classification === 'scanned').length,
    hybrid: pages.filter((p) => p.classification === 'hybrid').length,
    total: pages.length,
  };
}
