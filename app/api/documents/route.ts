import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { documents, mappingRules } from '@/lib/db/schema';
import { classifyPdfPages } from '@/lib/pdf/page-classifier';
import { filterFinancialPages } from '@/lib/pdf/page-filter';
import { classifyColumnHeaders } from '@/lib/pdf/column-classifier';
import { rasterizePage, rasterizePages } from '@/lib/pdf/page-rasterizer';
import { classifyStatementType, classifyScannedPages } from '@/lib/pdf/statement-classifier';
import { classifyDocument } from '@/lib/claude/classify';
import { extractStatement } from '@/lib/claude/extract';
import { extractStatementFromImage } from '@/lib/claude/extract-vision';
import { extractNote } from '@/lib/claude/extract-notes';
import { runMappingEngine, type ExtractedRowInput } from '@/lib/mapping';
import { claudeMapLabel } from '@/lib/claude/map';
import { normalizeLabel } from '@/lib/mapping/label-normalizer';
import { linkNotesToRows, parseNoteNumber } from '@/lib/mapping/entity-linker';
import { detectScope } from '@/lib/mapping/scope-detector';
import {
  createDocument,
  listDocuments,
  updateDocumentStatus,
  updateDocumentValidation,
} from '@/lib/db/queries/documents';
import { insertPageClassifications } from '@/lib/db/queries/document-pages';
import { insertExtractedRows } from '@/lib/db/queries/extracted-rows';
import { insertMappedRows } from '@/lib/db/queries/mapped-rows';
import { insertNoteEntries } from '@/lib/db/queries/note-entries';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const STATEMENT_TYPES = [
  'income_statement',
  'balance_sheet',
  'cash_flow',
  'equity_statement',
] as const;

// ── GET /api/documents ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = await listDocuments({
    page: Math.max(1, parseInt(searchParams.get('page') ?? '1')),
    limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20'))),
    status: searchParams.get('status') ?? undefined,
    templateType: searchParams.get('template_type') ?? undefined,
  });
  return NextResponse.json(result);
}

// ── POST /api/documents — 10-stage pipeline ─────────────────────────────────
export async function POST(request: NextRequest) {
  let documentId: string | null = null;
  const debugErrors: string[] = [];

  try {
    // ── Stage 1: Upload to Vercel Blob + create DB record ─────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const blob = await put(file.name, buffer, { access: 'private', addRandomSuffix: true });
    const doc = await createDocument({ fileName: file.name, blobUrl: blob.downloadUrl });
    documentId = doc.id;

    // ── Stage 2: Per-page classification ─────────────────────────────────
    await updateDocumentStatus(documentId, 'preprocessing');

    const classifiedPages = await classifyPdfPages(buffer);
    const pageMap = new Map(classifiedPages.map((p) => [p.pageNumber, p]));

    const counts = { digital: 0, scanned: 0, hybrid: 0 };
    for (const p of classifiedPages) counts[p.classification]++;
    const ocrRequired = counts.scanned > 0 || counts.hybrid > 0;

    await insertPageClassifications(
      classifiedPages.map((p) => ({
        documentId: documentId!,
        pageNumber: p.pageNumber,
        classification: p.classification,
        wordCount: p.wordCount,
        isSelected: false,
      })),
    );

    // ── Stage 2b: Statement type classification (digital path) ─────────
    for (const page of classifiedPages) {
      if (page.classification === 'scanned') continue;
      const hits = classifyStatementType(page.textContent ?? '');
      page.section_type = hits[0].statementType;
      page.secondary_section_type = hits[1]?.statementType ?? null;
    }

    // ── Stage 3: Financial page filtering ────────────────────────────────
    const filterResult = filterFinancialPages(classifiedPages);

    // ── Stage 4: Template classification via Claude ───────────────────────
    await updateDocumentStatus(documentId, 'classifying');

    // For all-scanned PDFs, rasterize first pages and extract text via vision
    // to feed into the template classifier instead of empty text.
    const scannedPages = classifiedPages.filter((p) => p.classification === 'scanned');
    const allScanned = scannedPages.length > 0 && scannedPages.length === classifiedPages.length;
    let visionSampleText = '';
    if (allScanned) {
      const probePagesNums = classifiedPages.slice(0, 2).map((p) => p.pageNumber);
      const visionChunks = await Promise.all(
        probePagesNums.map(async (pageNum) => {
          try {
            const png = await rasterizePage(buffer, pageNum, 1.5);
            const probeRows = await extractStatementFromImage(png, 'income_statement', 'T0_unknown', pageNum);
            return probeRows.length > 0 ? probeRows.map((r) => r.raw_label).join('\n') : '';
          } catch (e) { const msg = `[Stage4 probe p${pageNum}] ${e instanceof Error ? e.message : String(e)}`; console.error(msg); debugErrors.push(msg); return ''; }
        }),
      );
      visionSampleText = visionChunks.filter(Boolean).join('\n\n').slice(0, 6000);
    }

    const allSelectedNums = [...filterResult.selectedPages.values()].flat();
    const sampleText = allScanned
      ? visionSampleText
      : allSelectedNums
          .slice(0, 5)
          .map((n) => pageMap.get(n)?.textContent ?? '')
          .join('\n\n')
          .slice(0, 6000);

    const sampleLabels = sampleText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3 && l.length < 80 && !/^\d/.test(l))
      .slice(0, 30);

    const classification = await classifyDocument(sampleLabels, sampleText);
    const templateType = classification.template_type;

    await db.update(documents).set({
      pageCount: classifiedPages.length,
      ocrRequired,
      pageClassificationSummary: { ...counts, total: classifiedPages.length },
      templateType,
      classificationConfidence: classification.confidence,
      currencyCode: classification.detected_currency,
      unitScale: classification.detected_unit_scale,
      statementScopes: classification.statement_scopes,
      companyName: (classification.company_name && !/^unknown$/i.test(classification.company_name.trim())) ? classification.company_name.trim() : null,
      reportYear: classification.report_years?.length ? classification.report_years : null,
    }).where(eq(documents.id, documentId));

    // ── Stage 4b: Statement type classification — scanned (vision) ─────
    if (scannedPages.length > 0) {
      const scannedPageNums = scannedPages.map((p) => p.pageNumber);
      const imageBuffers = await rasterizePages(buffer, scannedPageNums, 1.5);
      const scannedClassifications = await classifyScannedPages(imageBuffers);

      for (const [pageNum, cls] of scannedClassifications) {
        const page = scannedPages.find((p) => p.pageNumber === pageNum)!;
        const [primaryType, secondaryType] = cls.statement_types;

        page.section_type = primaryType;
        page.secondary_section_type = secondaryType ?? null;
        // Store PNG buffer for reuse in Stage 5 — avoids double rasterisation
        page.imageBuffer = imageBuffers.get(pageNum);

        // Add to filterResult so Stage 5 extracts this page
        if (primaryType && primaryType !== 'other' && primaryType !== 'notes') {
          const arr = filterResult.selectedPages.get(primaryType) ?? [];
          arr.push(pageNum);
          filterResult.selectedPages.set(primaryType, arr);
        }
        if (secondaryType && secondaryType !== 'other' && secondaryType !== 'notes') {
          const arr2 = filterResult.selectedPages.get(secondaryType) ?? [];
          arr2.push(pageNum);
          filterResult.selectedPages.set(secondaryType, arr2);
        }
      }
    }

    // ── Stage 5: Row extraction (text + OCR branch) ───────────────────────
    await updateDocumentStatus(documentId, 'extracting');

    const rowsToInsert: Parameters<typeof insertExtractedRows>[0] = [];
    const ocrPageNums = new Set<number>();

    for (const stType of STATEMENT_TYPES) {
      const pageNums = filterResult.selectedPages.get(stType) ?? [];
      if (pageNums.length === 0) continue;

      const firstPageText = pageMap.get(pageNums[0])?.textContent ?? '';
      const scope = detectScope(firstPageText);

      for (const pageNum of pageNums) {
        const pageData = pageMap.get(pageNum);
        if (!pageData) continue;

        type RawRow = { raw_label: string; raw_values: Record<string, number | null>; section_path: string[]; indentation_level: number; is_subtotal: boolean; note_ref: string | null };
        let rows: RawRow[] = [];

        if (pageData.classification === 'digital') {
          rows = await extractStatement(pageData.textContent, stType, templateType);
        } else {
          try {
            // Reuse PNG buffer from Stage 4b if available, otherwise rasterize
            const png = pageData.imageBuffer ?? await rasterizePage(buffer, pageNum, 2.0);
            rows = await extractStatementFromImage(png, stType, templateType, pageNum);
            ocrPageNums.add(pageNum);
          } catch {
            if (pageData.textContent) {
              rows = await extractStatement(pageData.textContent, stType, templateType);
            }
          }
        }

        // M8: column metadata from year keys
        const yearKeys = [...new Set(rows.flatMap((r) => Object.keys(r.raw_values)))];
        const colMeta = Object.fromEntries(
          classifyColumnHeaders(yearKeys).map((m) => [
            String(m.year || m.label),
            { type: m.type, label: m.label },
          ]),
        );

        for (const row of rows) {
          if (!row.raw_label.trim()) continue;
          rowsToInsert.push({
            documentId: documentId!,
            statementType: stType,
            rawLabel: row.raw_label,
            rawValues: row.raw_values as any,
            page: pageNum,
            sectionPath: row.section_path,
            indentationLevel: Math.round(row.indentation_level),
            noteRef: row.note_ref,
            isSubtotal: row.is_subtotal,
            statementScope: scope,
            columnMetadata: colMeta as any,
          });
        }
      }
    }

    const insertedRows = await insertExtractedRows(rowsToInsert);

    // ── Stage 6: Note extraction for referenced notes ─────────────────────
    const referencedNoteNums = new Set<number>();
    for (const row of insertedRows) {
      const n = parseNoteNumber(row.noteRef);
      if (n !== null) referencedNoteNums.add(n);
    }

    const noteInserts: Parameters<typeof insertNoteEntries>[0] = [];

    for (const noteNum of referencedNoteNums) {
      const notePageNums = filterResult.notePageMap.get(noteNum) ?? [];
      if (notePageNums.length === 0) continue;

      const noteText = notePageNums
        .map((n) => pageMap.get(n)?.textContent ?? '')
        .join('\n\n');
      if (!noteText.trim()) continue;

      try {
        const extracted = await extractNote(noteText, noteNum, templateType);
        noteInserts.push({
          documentId: documentId!,
          noteNumber: extracted.note_number,
          noteTitle: extracted.note_title,
          pages: notePageNums,
          rawText: noteText.slice(0, 8000),
          extractedSubtables: extracted.sub_tables as any,
          linkedRowIds: [],
        });
      } catch {
        noteInserts.push({
          documentId: documentId!,
          noteNumber: noteNum,
          noteTitle: `Note ${noteNum}`,
          pages: notePageNums,
          rawText: noteText.slice(0, 8000),
          extractedSubtables: [] as any,
          linkedRowIds: [],
        });
      }
    }

    const insertedNotes = await insertNoteEntries(noteInserts);

    // ── Stage 7: Mapping engine M1-M9 ────────────────────────────────────
    await updateDocumentStatus(documentId, 'mapping');

    const dbRules = await db
      .select({
        templateType: mappingRules.templateType,
        normalizedLabel: mappingRules.normalizedLabel,
        canonicalField: mappingRules.canonicalField,
        confidence: mappingRules.confidence,
      })
      .from(mappingRules)
      .where(eq(mappingRules.active, true));

    const engineInput: ExtractedRowInput[] = insertedRows.map((r) => ({
      id: r.id,
      rawLabel: r.rawLabel,
      rawValues: (r.rawValues as Record<string, number | null>) ?? {},
      statementType: r.statementType,
      sectionPath: r.sectionPath ?? [],
      indentationLevel: r.indentationLevel ?? 0,
      isSubtotal: r.isSubtotal ?? false,
      noteRef: r.noteRef,
      statementScope: r.statementScope ?? 'unknown',
      ocrMethod: ocrPageNums.has(r.page ?? -1) ? 'claude_vision' : 'none',
    }));

    const { mappedRows: mappingResults, validationChecks, unmatchedIndices } = runMappingEngine(
      engineInput,
      templateType,
      documentId,
      dbRules.map((r) => ({
        templateType: r.templateType,
        normalizedLabel: r.normalizedLabel,
        canonicalField: r.canonicalField,
        confidence: r.confidence ?? 0.9,
      })),
    );

    // ── Stage 7b: Claude fallback for unmatched rows ──────────────────────
    // Cap at 40 rows to stay within the 300s function timeout budget.
    // Rows beyond the cap remain unmatched (canonical_field='unknown').
    const CLAUDE_FALLBACK_BATCH = 10;
    const CLAUDE_FALLBACK_MAX = 40;
    const cappedUnmatched = unmatchedIndices.slice(0, CLAUDE_FALLBACK_MAX);
    for (let b = 0; b < cappedUnmatched.length; b += CLAUDE_FALLBACK_BATCH) {
      const batch = cappedUnmatched.slice(b, b + CLAUDE_FALLBACK_BATCH);
      await Promise.all(
        batch.map(async (idx) => {
          const row = engineInput[idx];
          const mr = mappingResults[idx];
          try {
            const result = await claudeMapLabel(
              row.rawLabel,
              normalizeLabel(row.rawLabel),
              templateType,
              { statementType: row.statementType, sectionPath: row.sectionPath },
            );
            mr.canonicalField = result.canonical_field;
            mr.mappingMethod = 'claude';
            // Composite confidence: claude result weighted same as dictionary
            const claudeDict = result.confidence;
            mr.mappingConfidence = Math.min(
              claudeDict * 0.5 + 0.90 * 0.2 + 0.80 * 0.2 + 0.80 * 0.1,
              1,
            );
            mr.reviewStatus = mr.mappingConfidence >= 0.92 ? 'auto_approved' : 'needs_review';
          } catch {
            // Leave as unmatched if Claude also fails
          }
        }),
      );
    }

    await insertMappedRows(
      mappingResults.map((mr) => ({
        rowId: mr.rowId!,
        documentId: documentId!,
        canonicalField: mr.canonicalField,
        canonicalGroup: mr.canonicalGroup,
        parentCanonicalField: mr.parentCanonicalField,
        normalizedValues: mr.normalizedValues as any,
        mappingMethod: mr.mappingMethod,
        mappingConfidence: mr.mappingConfidence,
        validationResults: mr.validationResults as any,
        reviewStatus: mr.reviewStatus,
        statementScope: mr.statementScope,
      })),
    );

    // ── Stage 8: Entity linking notes ↔ rows ─────────────────────────────
    await linkNotesToRows(
      documentId,
      insertedRows.map((r) => ({ id: r.id, noteRef: r.noteRef })),
      insertedNotes.map((n) => ({ id: n.id, noteNumber: n.noteNumber })),
    );

    // ── Stage 9: Validation V01-V12 ───────────────────────────────────────
    const validationSummary = Object.fromEntries(
      validationChecks.map((c) => [
        c.checkId,
        { status: c.status, name: c.name, lhs: c.lhs, rhs: c.rhs, diffPct: c.diffPct },
      ]),
    );

    // ── Stage 10: Status update + review queue ────────────────────────────
    await updateDocumentValidation(documentId, validationSummary, 'ready_for_review');

    return NextResponse.json({ documentId, debugErrors: debugErrors.length ? debugErrors : undefined });

  } catch (error) {
    console.error('[POST /api/documents] Pipeline error:', error);
    if (documentId) {
      void updateDocumentValidation(documentId, {}, 'ready_for_review').catch(() => {});
    }
    return NextResponse.json(
      { error: 'Pipeline failed', details: String(error) },
      { status: 500 },
    );
  }
}
