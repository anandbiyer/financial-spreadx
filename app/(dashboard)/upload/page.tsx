'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { TemplateBadge } from '@/components/ui/TemplateBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STAGES = [
  'Upload to storage',
  'Page classification',
  'Financial page filter',
  'Template classification (Claude)',
  'Row extraction',
  'Note extraction',
  'Mapping engine (M1–M9)',
  'Entity linking',
  'Validation (V01–V12)',
  'Status update',
];

interface ClassifyResult {
  template_type: string;
  confidence: number;
  detected_currency: string;
  detected_unit_scale: string;
  statement_types_found: string[];
  statement_scopes: string[];
  signals_matched: string[];
}

interface UploadResult {
  documentId: string;
  companyName?: string;
  templateType?: string;
  currencyCode?: string;
  pageCount?: number;
  ocrRequired?: boolean;
  classification?: ClassifyResult;
}

interface RecentDoc {
  id: string;
  companyName: string | null;
  fileName: string;
  status: string | null;
  templateType: string | null;
}

type StageStatus = 'pending' | 'running' | 'done' | 'ocr';

function stageColor(s: StageStatus) {
  if (s === 'done') return { bg: '#dcfce7', fg: '#166534' };
  if (s === 'running') return { bg: '#dbeafe', fg: '#1e40af' };
  if (s === 'ocr') return { bg: '#fef3c7', fg: '#92400e' };
  return { bg: '#f4f3f0', fg: '#8a8880' };
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentStage, setCurrentStage] = useState<number>(-1);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch('/api/documents?limit=5')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setRecents(d.rows ?? []));
  }, [result]);

  const simulateStages = useCallback((hasOcr: boolean) => {
    let stage = 0;
    const tick = () => {
      setCurrentStage(stage);
      stage++;
      if (stage < STAGES.length) {
        stageTimerRef.current = setTimeout(tick, 280);
      }
    };
    tick();
  }, []);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setResult(null);
    setError(null);
    setCurrentStage(0);
    simulateStages(false);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/documents', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
      }
      const { documentId } = await res.json();
      setCurrentStage(STAGES.length - 1);

      // Fetch the full document record to populate the result card
      const docRes = await apiFetch(`/api/documents/${documentId}`);
      const doc = docRes.ok ? await docRes.json() : {};
      setResult({
        documentId,
        companyName: doc.companyName,
        templateType: doc.templateType,
        currencyCode: doc.currencyCode,
        pageCount: doc.pageCount,
        ocrRequired: doc.ocrRequired,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [simulateStages]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type === 'application/pdf') upload(file);
    },
    [upload],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <span className="text-[12.5px] font-medium text-[#1a1917]">Upload &amp; Classify</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-[5px] border border-[#ccc9bf] bg-white px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
          >
            + Upload PDF
          </button>
          <Link
            href="/export"
            className="inline-flex items-center rounded-[5px] bg-blue-700 px-2.5 py-1 text-[10.5px] font-medium text-white"
          >
            Export Centre
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Sync banner */}
        <div className="mb-2.5 flex items-center gap-2 rounded-[6px] border border-amber-600 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <div className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-400" />
          <strong className="mr-1">Synchronous processing</strong>— 10-stage pipeline runs in one request. ~30–90 sec.
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Left column: drop zone + pipeline */}
          <div>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className="mb-2.5 rounded-[7px] border-2 border-dashed px-4 py-7 text-center"
              style={{
                borderColor: dragging ? '#1d4ed8' : '#ccc9bf',
                background: dragging ? '#eff6ff' : '#f9f8f5',
              }}
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-[6px] bg-blue-100 text-[15px] font-bold text-blue-700">
                +
              </div>
              <div className="mb-0.5 text-[12px] font-semibold text-[#1a1917]">
                Drop PDF here or click to browse
              </div>
              <div className="mb-3 text-[10.5px] text-[#8a8880]">One PDF at a time · Max 50 MB</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center rounded-[5px] bg-blue-700 px-3 py-1.5 text-[10.5px] font-medium text-white disabled:opacity-50"
              >
                {uploading ? 'Processing…' : 'Choose file'}
              </button>
            </div>

            {/* Pipeline steps */}
            {uploading && (
              <div className="rounded-[7px] border border-[#e4e2dc] bg-white p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
                  10-Stage Pipeline
                </div>
                {STAGES.map((label, i) => {
                  const status: StageStatus =
                    i < currentStage ? 'done' : i === currentStage ? 'running' : 'pending';
                  const c = stageColor(status);
                  return (
                    <div
                      key={label}
                      className="flex items-start gap-2 border-b border-[#f4f3f0] py-[5px] last:border-none"
                    >
                      <div
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                        style={{ background: c.bg, color: c.fg }}
                      >
                        {i < currentStage ? '✓' : i + 1}
                      </div>
                      <div className="text-[11px] leading-snug text-[#4a4844]">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-[6px] border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right column: result + recents */}
          <div>
            {/* Classification result */}
            {result ? (
              <div className="mb-3 rounded-[7px] border border-[#e4e2dc] bg-white overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-2.5">
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-[3px] text-[10px] font-semibold"
                    style={{ borderColor: '#166534', color: '#166534' }}
                  >
                    {result.classification
                      ? `${Math.round(result.classification.confidence * 100)}%`
                      : 'OK'}
                  </div>
                  <div>
                    <div className="text-[11.5px] font-medium text-[#1a1917]">
                      {result.companyName ?? 'Document processed'}
                    </div>
                    <div className="text-[9.5px] text-[#8a8880]">Classification complete</div>
                  </div>
                </div>
                <div className="divide-y divide-[#e4e2dc]">
                  {[
                    ['Template', <TemplateBadge key="t" templateType={result.templateType} />],
                    ['Currency', result.currencyCode ?? '—'],
                    ['Pages', result.pageCount ?? '—'],
                    ['OCR required', result.ocrRequired ? 'Yes' : 'No'],
                    ...(result.classification?.statement_types_found?.length
                      ? [['Statements', result.classification.statement_types_found.join(', ')]]
                      : []),
                    ...(result.classification?.signals_matched?.length
                      ? [['Signals', result.classification.signals_matched.slice(0, 3).join(', ')]]
                      : []),
                  ].map(([k, v], i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1 text-[11px]">
                      <span className="text-[#8a8880]">{k}</span>
                      <span className="font-medium text-[#1a1917]">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#e4e2dc] px-3 py-2">
                  <Link
                    href={`/review/${result.documentId}`}
                    className="text-[10.5px] font-medium text-blue-700"
                  >
                    Open in Review Workbench →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mb-3 rounded-[7px] border border-dashed border-[#ccc9bf] bg-[#f9f8f5] p-6 text-center text-[11px] text-[#8a8880]">
                Classification result will appear here after upload.
              </div>
            )}

            {/* Recent uploads */}
            <div className="rounded-[7px] border border-[#e4e2dc] bg-white overflow-hidden">
              <div className="border-b border-[#e4e2dc] px-3 py-2 text-[11px] font-medium text-[#1a1917]">
                Recent uploads
              </div>
              {recents.length === 0 ? (
                <div className="px-3 py-4 text-center text-[10.5px] text-[#8a8880]">No uploads yet.</div>
              ) : (
                recents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-1.5 last:border-none"
                  >
                    <div
                      className="flex h-[25px] w-[25px] flex-shrink-0 items-center justify-center rounded-[4px] text-[11px] font-bold"
                      style={{ background: '#f4f3f0', color: '#4a4844' }}
                    >
                      P
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[10.5px] font-medium text-[#1a1917]">
                        {doc.companyName ?? doc.fileName}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <TemplateBadge templateType={doc.templateType} />
                        <StatusBadge status={doc.status} />
                      </div>
                    </div>
                    <Link href={`/review/${doc.id}`} className="text-[9.5px] text-blue-700">
                      Open →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
