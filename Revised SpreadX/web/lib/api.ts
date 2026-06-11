/** Client-side fetch helpers for the Python-backed write ops (Phase 3). */

import type { BalanceCheck } from "@/lib/db";

export interface ResolveResult {
  coa_mapping_id: string;
  learned_mapping_id: string;
  remaining_unmapped: number;
  balance: BalanceCheck;
}
export interface SaveMappingsResult {
  saved: number;
  results: { unmappedItemId: string; ok: boolean; error?: string }[];
  remaining_unmapped: number | null;
  balance: BalanceCheck;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `request failed (${res.status})`);
  return data as T;
}

export function resolveUnmapped(
  docId: string,
  itemId: string,
  coaId: string,
  rationale: string
): Promise<ResolveResult> {
  return postJSON(`/api/spread/${docId}/resolve-unmapped`, { itemId, coaId, rationale });
}

export function saveMappings(
  docId: string,
  mappings: { unmappedItemId: string; coaId: string; rationale?: string }[]
): Promise<SaveMappingsResult> {
  return postJSON(`/api/spread/${docId}/mappings`, { mappings });
}

export interface OverrideResult {
  coa_mapping_id: string;
  balance: BalanceCheck;
}

export function overrideMapping(
  docId: string,
  mappingId: string,
  newCoaId: string,
  rationale: string
): Promise<OverrideResult> {
  return postJSON(`/api/spread/${docId}/override`, { mappingId, newCoaId, rationale });
}

export async function uploadPdf(file: File): Promise<{ documentId: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "upload failed");
  return data as { documentId: string };
}
