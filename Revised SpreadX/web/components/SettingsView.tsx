"use client";

import { useState } from "react";
import { Topbar } from "@/components/Topbar";
import { useToast } from "@/components/Toast";

interface Settings {
  llm_provider: string;
  llm_model: string;
  confidence_threshold: number;
}

const MODELS = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", desc: "Best balance of accuracy and speed", price: "$3 / $15 per M" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", desc: "Fastest and cheapest", price: "$1 / $5 per M" },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", desc: "Highest accuracy", price: "$5 / $25 per M" },
];

const READONLY_TOGGLES = [
  { label: "Skip equity statement", on: true, note: "always on (no CoA target for SOCE rows)" },
  { label: "Auto-run Stage 11", on: true, note: "always on (every upload runs spreading)" },
  { label: "Auto-apply learned mappings", on: true, note: "always on" },
  { label: "Prompt caching", on: false, note: "unused in v1" },
];

export function SettingsView({ initial }: { initial: Settings }) {
  const [model, setModel] = useState(initial.llm_model);
  const [provider, setProvider] = useState(initial.llm_provider);
  const [threshold, setThreshold] = useState(initial.confidence_threshold);
  const [saving, setSaving] = useState(false);
  const show = useToast((s) => s.show);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmProvider: provider, llmModel: model, confidenceThreshold: threshold }),
      });
      if (!res.ok) throw new Error("save failed");
      show("✓ Settings saved · applied to the next run");
    } catch (e) {
      show(e instanceof Error ? e.message : "save failed", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <Topbar
        title="Settings"
        subtitle="· functional: model · provider · threshold"
        right={
          <button className="btn bp btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />
      <div className="screen-body">
        {/* Model — full width */}
        <div className="card">
          <div className="card-h"><div className="card-t">LLM Model</div></div>
          <div style={{ padding: 12 }}>
            <div className="model-grid">
              {MODELS.map((m) => (
                <div key={m.id} className={`model-card${model === m.id ? " sel" : ""}`} onClick={() => setModel(m.id)}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {m.name} {model === m.id && <span className="badge b-blue">Selected</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "3px 0" }}>{m.desc}</div>
                  <div className="mono" style={{ fontSize: 10 }}>{m.price}</div>
                </div>
              ))}
            </div>
            <div className="set-row" style={{ marginTop: 10 }}>
              <span>Provider</span>
              <select className="path-input" style={{ width: 200 }} value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="anthropic">Anthropic API</option>
                <option value="bedrock">AWS Bedrock</option>
              </select>
            </div>
            <div className="set-row">
              <span style={{ color: "var(--text-muted)", fontSize: 10.5 }}>API key managed via environment variables only.</span>
            </div>
          </div>
        </div>

        <div className="settings-grid">
          {/* Confidence threshold — functional */}
          <div className="card">
            <div className="card-h"><div className="card-t">Confidence Threshold</div></div>
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                <span>COA-mapping gate (below → unmapped)</span>
                <strong className="mono">{threshold.toFixed(2)}</strong>
              </div>
              <input
                className="slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
              />
              <div className="placeholder-note" style={{ marginTop: 8 }}>
                Single gate (Q4). The spec&rsquo;s 4-band model is out of scope; lower → more
                lines accepted, higher → more routed to the unmapped queue.
              </div>
            </div>
          </div>

          {/* Pipeline defaults — read-only */}
          <div className="card">
            <div className="card-h"><div className="card-t">Pipeline Defaults (read-only)</div></div>
            <div style={{ padding: 12 }}>
              {READONLY_TOGGLES.map((t) => (
                <div key={t.label} className="set-row" title={t.note}>
                  <span>{t.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{t.note}</span>
                    <span className={`tog locked${t.on ? " on" : ""}`}><span className="tog-k" /></span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Output paths — read-only */}
        <div className="card">
          <div className="card-h"><div className="card-t">Output Paths (read-only in web build)</div></div>
          <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {["XLSX output", "JSON output", "Logs directory", "Learning store DB"].map((p) => (
              <div key={p}>
                <div className="sl">{p}</div>
                <input className="path-input" disabled value="(managed by backend)" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
