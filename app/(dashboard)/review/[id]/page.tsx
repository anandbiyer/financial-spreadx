'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { TemplateBadge } from '@/components/ui/TemplateBadge';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface MappedRow {
  id: string;
  documentId: string;
  rawLabel: string | null;
  canonicalField: string | null;
  canonicalGroup: string | null;
  mappingMethod: string | null;
  mappingConfidence: number | null;
  reviewStatus: string | null;
  statementType: string | null;
  statementScope: string | null;
  normalizedValues: Record<string, number | null> | null;
  validationResults: Record<string, string> | null;
  noteRef?: string | null;
}

interface Document {
  id: string;
  companyName: string | null;
  templateType: string | null;
  currencyCode: string | null;
  blobUrl: string | null;
  reportYear: number[] | null;
  statementScopes: string[] | null;
}

interface NoteEntry {
  id: string;
  noteNumber: number | null;
  noteTitle: string | null;
  summary: string | null;
  pages: number[] | null;
  extractedSubtables: unknown[] | null;
}

interface CanonicalField {
  canonicalField: string;
  displayName: string;
  statementType: string;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function isFlagged(row: MappedRow) {
  return row.reviewStatus === 'needs_review' || (row.mappingConfidence ?? 1) < 0.8;
}

function primaryValue(row: MappedRow): string {
  if (!row.normalizedValues) return '—';
  const entries = Object.entries(row.normalizedValues).filter(([k]) => /^\d{4}$/.test(k));
  if (!entries.length) return '—';
  const [, val] = entries.sort((a, b) => Number(b[0]) - Number(a[0]))[0];
  return val == null ? '—' : val.toLocaleString();
}

/* ── Note Drawer ─────────────────────────────────────────────────────────── */

function NoteDrawer({
  note,
  onClose,
}: {
  note: NoteEntry | null;
  onClose: () => void;
}) {
  if (!note) return null;
  return (
    <div className="flex w-[290px] flex-shrink-0 flex-col overflow-hidden rounded-[7px] border border-[#e4e2dc] bg-white">
      <div className="flex items-center justify-between border-b border-[#e4e2dc] px-3 py-2.5">
        <div>
          <div className="font-mono text-[10px] text-[#8a8880]">Note {note.noteNumber}</div>
          <div className="text-[12px] font-medium text-[#1a1917]">{note.noteTitle ?? '—'}</div>
        </div>
        <button
          onClick={onClose}
          className="text-[10px] text-[#8a8880] hover:text-[#1a1917]"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {note.summary && (
          <div className="mb-3">
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
              Summary
            </div>
            <div className="text-[11px] leading-relaxed text-[#4a4844]">{note.summary}</div>
          </div>
        )}
        {note.pages && note.pages.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
              Pages
            </div>
            <div className="text-[11px] text-[#4a4844]">{note.pages.join(', ')}</div>
          </div>
        )}
        {Array.isArray(note.extractedSubtables) && note.extractedSubtables.length > 0 && (
          <div>
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
              Sub-tables
            </div>
            <div className="text-[10px] text-[#8a8880]">
              {note.extractedSubtables.length} table(s) extracted
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Explain Panel ───────────────────────────────────────────────────────── */

function ExplainPanel({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setText('');
    setDone(false);

    const es = new EventSource(`/api/review/${rowId}/explain`);
    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        setDone(true);
        es.close();
        return;
      }
      try {
        const { text: chunk } = JSON.parse(e.data);
        setText((prev) => prev + chunk);
      } catch {
        /* ignore malformed chunks */
      }
    };
    es.onerror = () => { setDone(true); es.close(); };
    return () => es.close();
  }, [rowId]);

  return (
    <div className="rounded-[7px] border border-[#e4e2dc] bg-white p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a8880]">
          Mapping Explanation
        </div>
        <button onClick={onClose} className="text-[10px] text-[#8a8880] hover:text-[#1a1917]">
          ✕
        </button>
      </div>
      <div className="text-[11px] leading-relaxed text-[#4a4844]">
        {text || <span className="text-[#8a8880]">Generating explanation…</span>}
        {!done && <span className="ml-0.5 animate-pulse">▌</span>}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function ReviewWorkbench({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const [doc, setDoc] = useState<Document | null>(null);
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [stmtFilter, setStmtFilter] = useState<string>('all');
  const [openNote, setOpenNote] = useState<NoteEntry | null>(null);
  const [explainRowId, setExplainRowId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Load document + rows
  useEffect(() => {
    apiFetch(`/api/documents/${docId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setDoc(d))
      .catch(() => {});

    setRowsLoading(true);
    setFetchError(null);
    apiFetch(`/api/documents/${docId}/mapped`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRows(Array.isArray(d) ? d : (d.rows ?? []));
        setRowsLoading(false);
      })
      .catch((e) => {
        setFetchError(e.message ?? 'Failed to load rows');
        setRowsLoading(false);
      });
  }, [docId]);

  const openNoteDrawer = useCallback(async (noteRef: string) => {
    const num = parseInt(noteRef.replace(/\D/g, ''), 10);
    if (!num) return;
    const res = await apiFetch(`/api/notes/${docId}/${num}`);
    if (res.ok) setOpenNote(await res.json());
  }, [docId]);

  const submitOverride = useCallback(async (rowId: string) => {
    setSaving(true);
    await apiFetch(`/api/review/${rowId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_canonical_field: editValue, reason: 'Manual override' }),
    });
    setSaving(false);
    setEditRowId(null);
    // Refresh rows
    apiFetch(`/api/documents/${docId}/mapped`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setRows(Array.isArray(d) ? d : (d.rows ?? [])))
      .catch(() => {});
  }, [docId, editValue]);

  // Filters
  const scopes = ['all', ...Array.from(new Set(rows.map((r) => r.statementScope).filter(Boolean) as string[]))];
  const stmts = ['all', ...Array.from(new Set(rows.map((r) => r.statementType).filter(Boolean) as string[]))];

  const filtered = rows.filter((r) => {
    if (scopeFilter !== 'all' && r.statementScope !== scopeFilter) return false;
    if (stmtFilter !== 'all' && r.statementType !== stmtFilter) return false;
    return true;
  });

  const flaggedCount = rows.filter(isFlagged).length;

  return (
    <>
      {/* Topbar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#e4e2dc] bg-white px-3.5">
        <div className="flex items-center gap-2">
          <Link href="/documents" className="text-[10px] text-blue-700">
            ← Documents
          </Link>
          <span className="text-[#ccc9bf]">/</span>
          <span className="text-[12.5px] font-medium text-[#1a1917]">
            {doc?.companyName ?? 'Review Workbench'}
          </span>
          {doc && <TemplateBadge templateType={doc.templateType} />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8a8880]">{flaggedCount} flagged</span>
          <Link
            href={`/review/${docId}/tree`}
            className="rounded-[5px] border border-[#ccc9bf] px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
          >
            Statement Tree
          </Link>
          <Link
            href={`/validation/${docId}`}
            className="rounded-[5px] border border-[#ccc9bf] px-2.5 py-1 text-[10.5px] font-medium text-[#4a4844]"
          >
            Validation
          </Link>
          <Link
            href={`/export/${docId}`}
            className="rounded-[5px] border border-blue-600 bg-blue-600 px-2.5 py-1 text-[10.5px] font-medium text-white"
          >
            Export
          </Link>
        </div>
      </div>

      {/* Content: split pane */}
      <div className="flex flex-1 gap-2.5 overflow-hidden p-3">
        {/* PDF Pane */}
        <div className="flex w-[232px] flex-shrink-0 flex-col overflow-hidden rounded-[7px] border border-[#e4e2dc] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4e2dc] px-2.5 py-1.5">
            <span className="text-[10px] font-medium text-[#1a1917]">Source PDF</span>
            {doc?.blobUrl && (
              <a
                href={doc.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9.5px] text-blue-700"
              >
                Open ↗
              </a>
            )}
          </div>
          <div className="flex flex-1 items-center justify-center bg-slate-500 p-2">
            {doc?.blobUrl ? (
              <iframe
                src={doc.blobUrl}
                className="h-full w-full rounded bg-white"
                title="Source PDF"
              />
            ) : (
              <div className="text-[10px] text-white/60">
                {docId ? 'PDF not available' : 'Loading…'}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-[#e4e2dc] px-2.5 py-1.5 text-[9.5px] text-[#8a8880]">
            <span>{doc?.currencyCode ?? '—'}</span>
            <span>{doc?.reportYear?.join(', ') ?? '—'}</span>
          </div>
        </div>

        {/* Mapping pane */}
        <div className="flex flex-1 flex-col gap-2 min-w-0 overflow-hidden">
          {/* Explain panel */}
          {explainRowId && (
            <ExplainPanel rowId={explainRowId} onClose={() => setExplainRowId(null)} />
          )}

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-[5px] overflow-hidden border border-[#ccc9bf]">
              {scopes.map((s) => (
                <button
                  key={s}
                  onClick={() => setScopeFilter(s)}
                  className="border-r border-[#ccc9bf] px-2.5 py-1 text-[10px] font-medium last:border-none"
                  style={scopeFilter === s
                    ? { background: '#1d4ed8', color: '#fff' }
                    : { background: '#fff', color: '#4a4844' }}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            <div className="flex rounded-[5px] overflow-hidden border border-[#ccc9bf]">
              {stmts.map((s) => (
                <button
                  key={s}
                  onClick={() => setStmtFilter(s)}
                  className="border-r border-[#ccc9bf] px-2.5 py-1 text-[10px] font-medium last:border-none"
                  style={stmtFilter === s
                    ? { background: '#1d4ed8', color: '#fff' }
                    : { background: '#fff', color: '#4a4844' }}
                >
                  {s === 'all' ? 'All' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Mapping table */}
          <div className="flex-1 overflow-auto rounded-[7px] border border-[#e4e2dc] bg-white">
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr style={{ background: '#f9f8f5' }}>
                  {['Raw Label', 'Canonical Field', 'Method', 'Confidence', 'Value', 'Scope', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[#e4e2dc] px-2 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-[0.05em] text-[#8a8880]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const flagged = isFlagged(row);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[#e4e2dc] last:border-none"
                      style={flagged ? { background: '#fffbeb' } : undefined}
                    >
                      <td className="px-2 py-1.5">
                        <span className="font-mono text-[9px] text-[#8a8880]">
                          {row.rawLabel ?? '—'}
                        </span>
                        {row.mappingMethod === 'claude' && (
                          <span className="ml-1 rounded-[3px] bg-amber-100 px-1 py-px text-[8.5px] font-semibold text-amber-800">
                            Claude
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editRowId === row.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="rounded border border-[#ccc9bf] px-1.5 py-0.5 text-[10px]"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                            />
                            <button
                              onClick={() => submitOverride(row.id)}
                              disabled={saving}
                              className="rounded bg-blue-700 px-1.5 py-0.5 text-[9px] font-medium text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditRowId(null)}
                              className="text-[9px] text-[#8a8880]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="font-medium text-[#1a1917]">
                            {row.canonicalField ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[9.5px] text-[#8a8880]">
                        {row.mappingMethod ?? '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <ConfidenceBar value={row.mappingConfidence ?? 0} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] text-[#4a4844]">
                        {primaryValue(row)}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.statementScope && (
                          <span
                            className="inline-flex items-center rounded-[20px] px-1 py-px text-[9px] font-semibold"
                            style={row.statementScope === 'consolidated'
                              ? { background: '#ccfbf1', color: '#134e4a' }
                              : { background: '#ede9fe', color: '#4c1d95' }}
                          >
                            {row.statementScope === 'consolidated' ? 'Con.' : 'Std.'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditRowId(row.id); setEditValue(row.canonicalField ?? ''); }}
                            className="text-[9.5px] font-medium text-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setExplainRowId(explainRowId === row.id ? null : row.id)}
                            className="text-[9.5px] text-[#8a8880]"
                          >
                            Explain
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[11px] text-[#8a8880]">
                      {fetchError
                        ? <span className="text-red-600">{fetchError}</span>
                        : rowsLoading
                          ? 'Loading rows…'
                          : rows.length === 0
                            ? 'No mapped rows found for this document.'
                            : 'No rows match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Note drawer */}
        {openNote && (
          <NoteDrawer note={openNote} onClose={() => setOpenNote(null)} />
        )}
      </div>
    </>
  );
}
