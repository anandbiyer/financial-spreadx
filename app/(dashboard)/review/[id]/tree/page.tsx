'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { TemplateBadge } from '@/components/ui/TemplateBadge';

interface MappedRow {
  id: string;
  canonicalField: string | null;
  canonicalGroup: string | null;
  statementType: string | null;
  normalizedValues: Record<string, number | null> | null;
  reviewStatus: string | null;
  mappingConfidence: number | null;
  statementScope: string | null;
}

interface Document {
  id: string;
  companyName: string | null;
  templateType: string | null;
  currencyCode: string | null;
  reportYear: number[] | null;
}

const STATEMENT_LABELS: Record<string, string> = {
  income_statement: 'Income Statement',
  balance_sheet: 'Balance Sheet',
  cash_flow: 'Cash Flow',
  equity_statement: 'Equity Statement',
};

const STATEMENT_ORDER = ['income_statement', 'balance_sheet', 'cash_flow', 'equity_statement'];

function primaryYear(rows: MappedRow[]): string | null {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const k of Object.keys(r.normalizedValues ?? {})) {
      if (/^\d{4}$/.test(k)) counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function statusDot(row: MappedRow) {
  if (row.reviewStatus === 'auto_approved' || row.reviewStatus === 'reviewed') {
    return <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />;
  }
  if (row.reviewStatus === 'needs_review' || (row.mappingConfidence ?? 1) < 0.8) {
    return <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />;
  }
  return <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-gray-300" />;
}

function StatementSection({
  label,
  rows,
  year,
  defaultOpen,
}: {
  label: string;
  rows: MappedRow[];
  year: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const prevYear = year ? String(Number(year) - 1) : null;

  return (
    <div className="mb-1.5">
      {/* Accordion header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-[5px] px-2.5 py-1.5"
        style={{ background: '#f4f3f0' }}
      >
        <span className="text-[11.5px] font-medium text-[#1a1917]">{label}</span>
        <span className="text-[10px] text-[#8a8880]">{open ? '▲' : '▼'} {rows.length} rows</span>
      </button>

      {open && (
        <div className="mt-px overflow-hidden rounded-b-[5px] border border-[#e4e2dc] bg-white">
          {/* Column header */}
          <div className="flex items-center border-b border-[#e4e2dc] bg-[#f9f8f5] px-2.5 py-1">
            <span className="flex-1 text-[8.5px] font-semibold uppercase tracking-[0.05em] text-[#8a8880]">
              Field
            </span>
            <span className="w-24 text-right text-[8.5px] font-semibold uppercase tracking-[0.05em] text-[#8a8880]">
              {year ?? 'Current'}
            </span>
            {prevYear && (
              <span className="w-24 text-right text-[8.5px] font-semibold uppercase tracking-[0.05em] text-[#8a8880]">
                {prevYear}
              </span>
            )}
            <span className="w-4" />
          </div>

          {rows.map((row) => {
            const isSubtotal = row.canonicalGroup === row.canonicalField || row.reviewStatus === 'auto_approved';
            const curVal = year ? (row.normalizedValues?.[year] ?? null) : null;
            const prevVal = prevYear ? (row.normalizedValues?.[prevYear] ?? null) : null;

            return (
              <div
                key={row.id}
                className="flex items-center border-b border-[#e4e2dc] px-2.5 py-1 last:border-none text-[10.5px]"
                style={isSubtotal ? { background: '#f9f8f5', fontWeight: 500 } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[#1a1917]">{row.canonicalField ?? '—'}</div>
                  {row.statementScope && (
                    <span
                      className="inline-flex items-center rounded-[20px] px-1 py-px text-[8.5px] font-semibold"
                      style={row.statementScope === 'consolidated'
                        ? { background: '#ccfbf1', color: '#134e4a' }
                        : { background: '#ede9fe', color: '#4c1d95' }}
                    >
                      {row.statementScope === 'consolidated' ? 'Con.' : 'Std.'}
                    </span>
                  )}
                </div>
                <div className="w-24 text-right font-mono text-[10px] text-[#4a4844]">
                  {curVal != null ? curVal.toLocaleString() : '—'}
                </div>
                {prevYear && (
                  <div className="w-24 text-right font-mono text-[10px] text-[#8a8880]">
                    {prevVal != null ? prevVal.toLocaleString() : '—'}
                  </div>
                )}
                <div className="flex w-4 justify-end">{statusDot(row)}</div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="px-3 py-3 text-center text-[11px] text-[#8a8880]">No rows.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StatementTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const [doc, setDoc] = useState<Document | null>(null);
  const [rows, setRows] = useState<MappedRow[]>([]);

  useEffect(() => {
    apiFetch(`/api/documents/${docId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setDoc(d));
    apiFetch(`/api/documents/${docId}/mapped`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setRows(Array.isArray(d) ? d : (d.rows ?? [])));
  }, [docId]);

  const year = primaryYear(rows);

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <div className="flex items-center gap-2">
          <Link href={`/review/${docId}`} className="text-[10px] text-blue-700">
            ← Workbench
          </Link>
          <span className="text-[#ccc9bf]">/</span>
          <span className="text-[12.5px] font-medium text-[#1a1917]">Statement Tree</span>
          {doc && <TemplateBadge templateType={doc.templateType} />}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/validation/${docId}`}
            className="rounded-[5px] border border-[#ccc9bf] px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
          >
            Validation
          </Link>
          <Link
            href={`/export/${docId}`}
            className="rounded-[5px] bg-blue-700 px-2.5 py-1 text-[10.5px] font-medium text-white"
          >
            Export
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {STATEMENT_ORDER.map((stmtType, i) => {
          const stmtRows = rows.filter((r) => r.statementType === stmtType);
          return (
            <StatementSection
              key={stmtType}
              label={STATEMENT_LABELS[stmtType]}
              rows={stmtRows}
              year={year}
              defaultOpen={i === 0}
            />
          );
        })}
        {rows.length === 0 && (
          <div className="mt-10 text-center text-[11px] text-[#8a8880]">
            {docId ? 'Loading rows…' : 'No document selected.'}
          </div>
        )}
      </div>
    </>
  );
}
