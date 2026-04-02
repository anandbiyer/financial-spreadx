'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { TemplateBadge } from '@/components/ui/TemplateBadge';

interface ValidationCheck {
  checkId: string;
  name: string;
  formula: string;
  status: 'passed' | 'failed' | 'skipped';
  lhs?: number | null;
  rhs?: number | null;
  message?: string;
}

interface ValidationReport {
  documentId: string;
  templateType: string | null;
  primaryYear: string | null;
  healthScore: number;
  summary: { passed: number; failed: number; skipped: number; total: number };
  checks: ValidationCheck[];
}

interface Document {
  companyName: string | null;
  templateType: string | null;
  currencyCode: string | null;
}

function checkBorderColor(status: string) {
  if (status === 'passed') return '#15803d';
  if (status === 'failed') return '#b91c1c';
  return '#d1d5db';
}

function healthBarColor(score: number) {
  if (score >= 90) return '#15803d';
  if (score >= 60) return '#b45309';
  return '#b91c1c';
}

export default function ValidationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const [doc, setDoc] = useState<Document | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/documents/${docId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setDoc(d));
    apiFetch(`/api/documents/${docId}/validation`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { d && setReport(d); setLoading(false); });
  }, [docId]);

  const score = report?.healthScore ?? 0;

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <div className="flex items-center gap-2">
          <Link href={`/review/${docId}`} className="text-[10px] text-blue-700">
            ← Workbench
          </Link>
          <span className="text-[#ccc9bf]">/</span>
          <span className="text-[12.5px] font-medium text-[#1a1917]">
            Validation Dashboard
          </span>
          {doc && <TemplateBadge templateType={doc.templateType} />}
        </div>
        <Link
          href={`/export/${docId}`}
          className="rounded-[5px] bg-blue-700 px-2.5 py-1 text-[10.5px] font-medium text-white"
        >
          Export
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="mt-10 text-center text-[11px] text-[#8a8880]">Loading validation…</div>
        ) : (
          <>
            {/* Health gauge */}
            <div className="mb-3 flex items-center gap-4 rounded-[7px] bg-[#f4f3f0] px-4 py-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
                  Health Score
                </div>
                <div
                  className="mt-0.5 text-[28px] font-medium leading-none"
                  style={{ color: healthBarColor(score) }}
                >
                  {report ? `${report.summary.passed} / ${report.summary.total - report.summary.skipped}` : '—'}
                </div>
                <div className="mt-1 text-[9.5px] text-[#8a8880]">checks passed</div>
              </div>
              <div className="flex-1">
                <div
                  className="overflow-hidden rounded-full"
                  style={{ height: 8, background: '#e4e2dc', width: 200 }}
                >
                  <div
                    style={{
                      width: `${score}%`,
                      height: '100%',
                      background: healthBarColor(score),
                      borderRadius: 9999,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <div className="mt-1.5 flex gap-3 text-[9.5px] text-[#8a8880]">
                  <span className="text-green-700">{report?.summary.passed ?? 0} passed</span>
                  <span className="text-red-700">{report?.summary.failed ?? 0} failed</span>
                  <span>{report?.summary.skipped ?? 0} skipped</span>
                </div>
              </div>
              {doc?.currencyCode && (
                <div className="text-[10px] text-[#8a8880]">
                  Currency: <strong>{doc.currencyCode}</strong>
                </div>
              )}
            </div>

            {/* Check grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {(report?.checks ?? []).map((check) => (
                <div
                  key={check.checkId}
                  className="rounded-[0_7px_7px_0] border border-[#e4e2dc] bg-white p-2.5"
                  style={{ borderLeftWidth: 3, borderLeftColor: checkBorderColor(check.status) }}
                >
                  <div className="font-mono text-[10px] text-[#8a8880]">{check.checkId}</div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#1a1917]">{check.name}</div>
                  <div className="mt-0.5 font-mono text-[8.5px] leading-snug text-[#8a8880]">
                    {check.formula}
                  </div>
                  <div
                    className="mt-1 text-[10px] font-medium"
                    style={{
                      color:
                        check.status === 'passed'
                          ? '#15803d'
                          : check.status === 'failed'
                            ? '#b91c1c'
                            : '#8a8880',
                    }}
                  >
                    {check.status === 'passed' && '✓ Passed'}
                    {check.status === 'failed' && (
                      <>
                        ✗ Failed
                        {check.lhs != null && check.rhs != null && (
                          <span className="ml-1 text-[9px] font-normal text-[#8a8880]">
                            ({check.lhs.toLocaleString()} ≠ {check.rhs.toLocaleString()})
                          </span>
                        )}
                      </>
                    )}
                    {check.status === 'skipped' && '— Skipped'}
                  </div>
                  {check.message && (
                    <div className="mt-1 text-[9px] text-[#8a8880]">{check.message}</div>
                  )}
                </div>
              ))}
            </div>

            {!report?.checks.length && (
              <div className="mt-6 text-center text-[11px] text-[#8a8880]">
                No validation checks available.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
