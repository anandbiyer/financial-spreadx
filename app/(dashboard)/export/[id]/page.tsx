'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { TemplateBadge } from '@/components/ui/TemplateBadge';

const XLSX_TABS = ['Summary', 'Income Statement', 'Balance Sheet', 'Cash Flow', 'Equity Statement', 'Validation', 'Raw Extraction', 'Metadata'];

type Tier = 'raw' | 'canonical' | 'reviewed';

interface Document {
  id: string;
  companyName: string | null;
  templateType: string | null;
  currencyCode: string | null;
  reportYear: number[] | null;
  ocrRequired: boolean | null;
}

const FX_RATES: Record<string, number> = {
  GBP: 1.2653,
  INR: 0.01203,
  CNY: 0.14062,
  NTD: 0.03182,
  HKD: 0.12796,
  USD: 1.0,
};

export default function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const [doc, setDoc] = useState<Document | null>(null);
  const [tier, setTier] = useState<Tier>('canonical');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [tierCounts, setTierCounts] = useState<Record<Tier, number>>({ raw: 0, canonical: 0, reviewed: 0 });
  const [stmtCounts, setStmtCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    apiFetch(`/api/documents/${docId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setDoc(d);
        const total = d._counts?.mappedRows ?? 0;
        const autoApproved = total - (d._counts?.needsReview ?? 0);
        setTierCounts({ raw: total, canonical: total, reviewed: autoApproved });
        // Fetch statement-type breakdown from mapped rows
        apiFetch(`/api/documents/${docId}/mapped?limit=1000`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (!data) return;
            const rows: { statementType: string }[] = Array.isArray(data) ? data : (data.rows ?? []);
            const counts: Record<string, number> = {};
            rows.forEach((r) => { counts[r.statementType] = (counts[r.statementType] ?? 0) + 1; });
            setStmtCounts(counts);
          })
          .catch(() => {});
      });
  }, [docId]);

  const download = async (format: 'xlsx' | 'json' | 'raw-json') => {
    setDownloading(format);
    try {
      const res = await apiFetch(`/api/export/${docId}/${format}?tier=${tier}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = format === 'xlsx' ? 'xlsx' : 'json';
      const filename = `export_${docId.slice(0, 8)}_${tier}.${ext}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setDownloading(null);
    }
  };

  const currency = doc?.currencyCode ?? 'USD';
  const fxRate = FX_RATES[currency] ?? 1;

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <div className="flex items-center gap-2">
          <Link href="/documents" className="text-[10px] text-blue-700">
            ← Documents
          </Link>
          <span className="text-[#ccc9bf]">/</span>
          <span className="text-[12.5px] font-medium text-[#1a1917]">Export Centre</span>
          {doc && <TemplateBadge templateType={doc.templateType} />}
        </div>
        <Link
          href={`/validation/${docId}`}
          className="rounded-[5px] border border-[#ccc9bf] px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
        >
          Validation
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Document meta */}
        {doc && (
          <div className="mb-3 flex items-center gap-3 text-[11px] text-[#8a8880]">
            <span className="font-medium text-[#1a1917]">{doc.companyName ?? doc.id}</span>
            <span>{doc.reportYear?.join(', ')}</span>
            <span>{currency}</span>
          </div>
        )}

        {/* Tier selector */}
        <div className="mb-1 flex overflow-hidden rounded-[5px] border border-[#ccc9bf] w-fit">
          {(['raw', 'canonical', 'reviewed'] as Tier[]).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="border-r border-[#ccc9bf] px-3 py-1.5 text-[10.5px] font-medium capitalize last:border-none"
              style={tier === t
                ? { background: '#1d4ed8', color: '#fff' }
                : { background: '#fff', color: '#4a4844' }}
            >
              {t}
              <span className="ml-1 opacity-70">({tierCounts[t]})</span>
            </button>
          ))}
        </div>
        {tierCounts[tier] === 0 && (
          <div className="mb-3 rounded-[5px] border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-800">
            No rows available for <strong>{tier}</strong> tier — switch to <button className="underline font-medium" onClick={() => setTier('canonical')}>canonical</button> to export all mapped rows.
          </div>
        )}
        {tierCounts[tier] > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-[#8a8880]">
            <span>{tierCounts[tier]} rows total</span>
            {(['income_statement','balance_sheet','cash_flow','equity_statement'] as const).map((st) => (
              <span key={st} className={stmtCounts[st] ? '' : 'opacity-40'}>
                · {st.replace('_',' ').replace('_',' ')}: <strong>{stmtCounts[st] ?? 0}</strong>
              </span>
            ))}
          </div>
        )}
        {doc?.ocrRequired && !stmtCounts['equity_statement'] && (
          <div className="mb-3 rounded-[5px] border border-[#e4e2dc] bg-[#f9f8f5] px-2.5 py-1.5 text-[10px] text-[#8a8880]">
            Equity statement not detected — this scanned document has no dedicated equity statement page with a clear heading. Equity movements may be embedded in the Income Statement or Balance Sheet tabs.
          </div>
        )}

        {/* Format cards */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          {/* XLSX card */}
          <div className="overflow-hidden rounded-[7px] border-2 border-blue-600 bg-white">
            <div className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-2.5">
              <div className="flex h-[29px] w-[29px] flex-shrink-0 items-center justify-center rounded-[5px] bg-green-600 text-[12px] font-bold text-white">
                X
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#1a1917]">XLSX Workbook</div>
                <span className="inline-flex items-center rounded-[3px] bg-blue-50 px-1.5 py-px text-[9.5px] font-medium text-blue-700">
                  Recommended
                </span>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="mb-1.5 text-[10px] leading-snug text-[#8a8880]">
                8 sheets: summary, all 4 statement types, validation scorecard, raw extraction audit trail, metadata.
              </div>
              {/* Tab pills */}
              <div className="mb-3 flex flex-wrap gap-0.5 rounded-[3px] bg-[#f4f3f0] p-0.5">
                {XLSX_TABS.map((tab, i) => (
                  <span
                    key={tab}
                    className="rounded-[2px] px-1 py-0.5 font-mono text-[8px]"
                    style={i === 0 ? { background: '#1d4ed8', color: '#fff' } : { background: '#fff', color: '#8a8880' }}
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <button
                onClick={() => download('xlsx')}
                disabled={!!downloading}
                className="w-full rounded-[5px] bg-blue-700 py-1.5 text-[10.5px] font-medium text-white disabled:opacity-60"
              >
                {downloading === 'xlsx' ? 'Generating…' : 'Download XLSX'}
              </button>
            </div>
          </div>

          {/* JSON card */}
          <div className="overflow-hidden rounded-[7px] border border-[#e4e2dc] bg-white">
            <div className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-2.5">
              <div className="flex h-[29px] w-[29px] flex-shrink-0 items-center justify-center rounded-[5px] bg-amber-500 text-[12px] font-bold text-white">
                {'{'}
              </div>
              <div className="text-[11px] font-medium text-[#1a1917]">Canonical JSON</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="mb-3 text-[10px] leading-snug text-[#8a8880]">
                Structured JSON with canonical fields, normalized values, USD conversion, and validation summary.
              </div>
              {/* FX rates */}
              <div className="mb-3 flex flex-wrap gap-1">
                {Object.entries(FX_RATES).map(([ccy, rate]) => (
                  <span key={ccy} className="font-mono text-[9px] text-[#8a8880]">
                    {ccy}={rate}
                  </span>
                ))}
              </div>
              <button
                onClick={() => download('json')}
                disabled={!!downloading}
                className="w-full rounded-[5px] border border-[#ccc9bf] bg-white py-1.5 text-[10.5px] font-medium text-[#4a4844] disabled:opacity-60"
              >
                {downloading === 'json' ? 'Generating…' : 'Download JSON'}
              </button>
            </div>
          </div>

          {/* CSV (deferred) */}
          <div className="overflow-hidden rounded-[7px] border border-dashed border-[#ccc9bf] bg-white opacity-55">
            <div className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-2.5">
              <div className="flex h-[29px] w-[29px] flex-shrink-0 items-center justify-center rounded-[5px] bg-gray-200 text-[12px] font-bold text-gray-500">
                C
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#1a1917]">CSV Export</div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-2 py-1.5 text-[9.5px] text-amber-800">
                Deferred — not yet implemented.
              </div>
            </div>
          </div>

          {/* PDF (deferred) */}
          <div className="overflow-hidden rounded-[7px] border border-dashed border-[#ccc9bf] bg-white opacity-55">
            <div className="flex items-center gap-2 border-b border-[#e4e2dc] px-3 py-2.5">
              <div className="flex h-[29px] w-[29px] flex-shrink-0 items-center justify-center rounded-[5px] bg-red-200 text-[12px] font-bold text-red-600">
                P
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#1a1917]">PDF Report</div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-2 py-1.5 text-[9.5px] text-amber-800">
                Deferred — not yet implemented.
              </div>
            </div>
          </div>
        </div>

        {/* FX rate info */}
        {currency !== 'USD' && (
          <div className="rounded-[6px] border border-[#e4e2dc] bg-[#f9f8f5] px-3 py-2 text-[10.5px] text-[#8a8880]">
            FX conversion: 1 {currency} = {fxRate} USD (hardcoded demo rates)
          </div>
        )}
      </div>
    </>
  );
}
