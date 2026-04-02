'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { StatCard } from '@/components/ui/StatCard';
import { TemplateBadge } from '@/components/ui/TemplateBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { HealthBar } from '@/components/ui/HealthBar';

interface Doc {
  id: string;
  companyName: string | null;
  fileName: string;
  reportYear: number[] | null;
  templateType: string | null;
  currencyCode: string | null;
  status: string | null;
  ocrRequired: boolean | null;
  pageClassificationSummary: Record<string, number> | null;
  statementScopes: string[] | null;
  classificationConfidence: number | null;
  validationResults: Record<string, { status: string }> | null;
}

type FilterKey = 'all' | 'ready_for_review' | 'error' | 'exported';

function healthScore(doc: Doc): number {
  if (!doc.validationResults) return 100;
  const checks = Object.values(doc.validationResults);
  if (!checks.length) return 100;
  const passed = checks.filter((c) => c.status === 'passed').length;
  const notSkipped = checks.filter((c) => c.status !== 'skipped').length;
  return notSkipped > 0 ? Math.round((passed / notSkipped) * 100) : 100;
}

function actionLabel(status: string | null) {
  if (status === 'ready_for_review') return 'Review \u2192';
  if (status === 'error') return 'Fix \u2192';
  return 'Export \u2192';
}

function actionHref(doc: Doc) {
  if (doc.status === 'ready_for_review') return `/review/${doc.id}`;
  if (doc.status === 'error') return `/validation/${doc.id}`;
  return `/export/${doc.id}`;
}

function ocrPages(doc: Doc): number {
  const s = doc.pageClassificationSummary;
  return s ? (s.scanned ?? 0) + (s.hybrid ?? 0) : 0;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  ready_for_review: 'Review',
  error: 'Errors',
  exported: 'Exported',
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    const res = await apiFetch(`/api/documents${params}`);
    if (res.ok) {
      const data = await res.json();
      setDocs(data.rows ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const needsReview = docs.filter((d) => d.status === 'ready_for_review').length;
  const errors = docs.filter((d) => d.status === 'error').length;
  const approved = docs.filter((d) =>
    ['reviewed', 'exported'].includes(d.status ?? ''),
  ).length;

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <span className="text-[12.5px] font-medium text-[#1a1917]">Document Library</span>
        <div className="flex items-center gap-1.5">
          <Link
            href="/upload"
            className="inline-flex items-center rounded-[5px] border border-[#ccc9bf] bg-white px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
          >
            + Upload PDF
          </Link>
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
        {/* Stat cards */}
        <div className="mb-2.5 grid grid-cols-4 gap-1.5">
          <StatCard label="Total" value={total} subLabel="8 template families" />
          <StatCard
            label="Processed"
            value={approved}
            subLabel="auto-approved"
            valueColor={approved > 0 ? '#166534' : undefined}
          />
          <StatCard
            label="Needs review"
            value={needsReview}
            subLabel="rows flagged"
            valueColor={needsReview > 0 ? '#92400e' : undefined}
          />
          <StatCard
            label="Val. failures"
            value={errors}
            subLabel="Click to fix"
            valueColor={errors > 0 ? '#991b1b' : undefined}
          />
        </div>

        {/* Table card */}
        <div className="overflow-hidden rounded-lg border border-[#e4e2dc] bg-white">
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-[#e4e2dc] px-3 py-2">
            <span className="text-[11px] font-medium text-[#1a1917]">
              {filter === 'all' ? `All ${total} documents` : FILTER_LABELS[filter]}
            </span>
            <div className="flex gap-1">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className="rounded-[20px] border px-2 py-0.5 text-[10px] font-medium"
                  style={
                    filter === k
                      ? { background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }
                      : { background: '#fff', color: '#4a4844', borderColor: '#ccc9bf' }
                  }
                >
                  {FILTER_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-center text-[11px] text-[#8a8880]">Loading…</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: '#f9f8f5' }}>
                  {['Company', 'Year', 'Template', 'Scope', 'Status', 'Health', 'OCR', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-[#e4e2dc] px-2.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-[0.05em] text-[#8a8880]"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-[#e4e2dc] last:border-none hover:bg-[#fafaf8]"
                  >
                    <td className="px-2.5 py-1.5">
                      <div className="text-[11px] font-medium text-[#1a1917]">
                        {doc.companyName ?? doc.fileName}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-[11px] text-[#4a4844]">
                      {doc.reportYear?.join(', ') ?? '—'}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <TemplateBadge templateType={doc.templateType} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex gap-0.5">
                        {(doc.statementScopes ?? []).map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-[20px] px-1 py-px text-[9px] font-semibold"
                            style={
                              s === 'consolidated'
                                ? { background: '#ccfbf1', color: '#134e4a' }
                                : { background: '#ede9fe', color: '#4c1d95' }
                            }
                          >
                            {s === 'consolidated' ? 'Con.' : 'Std.'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <HealthBar value={healthScore(doc)} />
                    </td>
                    <td className="px-2.5 py-1.5 text-[10px] text-[#8a8880]">
                      {ocrPages(doc) > 0 ? (
                        <span className="inline-flex items-center rounded-[3px] bg-[#fef3c7] px-1 py-px text-[8.5px] font-semibold text-[#92400e]">
                          {ocrPages(doc)} pg
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <Link
                        href={actionHref(doc)}
                        className="text-[10px] font-medium text-blue-700"
                      >
                        {actionLabel(doc.status)}
                      </Link>
                    </td>
                  </tr>
                ))}
                {docs.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-[11px] text-[#8a8880]"
                    >
                      No documents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
