"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsageDetail } from "@/lib/db";
import { Topbar } from "@/components/Topbar";
import { fmtMoney, fmtNum } from "@/lib/format";

const EXTRACTION = "#1d4ed8";
const SPREADING = "#7c3aed";
const INPUT = "#1d4ed8";
const OUTPUT = "#a78bfa";

function short(name: string) {
  return name.length > 14 ? name.slice(0, 13) + "…" : name;
}

export function CostView({ usage }: { usage: UsageDetail }) {
  const { kpis, perDoc, byStage, byType } = usage;

  const costData = perDoc.map((d) => ({
    name: short(d.company),
    Extraction: +d.extractionCost.toFixed(3),
    Spreading: +d.spreadingCost.toFixed(3),
  }));
  const stageData = [
    { name: "Extraction", value: +byStage.extraction.toFixed(3) },
    { name: "Spreading", value: +byStage.spreading.toFixed(3) },
  ];
  const tokenData = perDoc.map((d) => ({
    name: short(d.company),
    Input: d.inputTokens,
    Output: d.outputTokens,
  }));
  const typeData = [
    { name: `Scanned (${byType.scanned.n})`, cost: +byType.scanned.avg.toFixed(3) },
    { name: `Digital (${byType.digital.n})`, cost: +byType.digital.avg.toFixed(3) },
  ];

  return (
    <div className="screen">
      <Topbar title="LLM Cost" subtitle="· estimated at Anthropic list price" />
      <div className="screen-body">
        <div className="stats-row stats-5">
          <Kpi label="Input Tokens" value={fmtNum(kpis.totalInputTokens)} />
          <Kpi label="Output Tokens" value={fmtNum(kpis.totalOutputTokens)} />
          <Kpi label="Estimated Total" value={fmtMoney(kpis.totalCost)} />
          <Kpi label="Avg / Report" value={fmtMoney(kpis.avgPerReport)} />
          <Kpi label="Documents" value={String(kpis.docCount)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
          <Card title="Cost per Document (stacked)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={costData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive={false} dataKey="Extraction" stackId="a" fill={EXTRACTION} />
                <Bar isAnimationActive={false} dataKey="Spreading" stackId="a" fill={SPREADING} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Stage Breakdown">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie isAnimationActive={false} data={stageData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} label>
                  <Cell fill={EXTRACTION} />
                  <Cell fill={SPREADING} />
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Token Breakdown (input vs output)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tokenData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtNum(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive={false} dataKey="Input" fill={INPUT} />
                <Bar isAnimationActive={false} dataKey="Output" fill={OUTPUT} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Scanned vs Digital (avg cost / doc)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Bar isAnimationActive={false} dataKey="cost" fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="placeholder-note" style={{ marginTop: 8 }}>
          List-price estimates (ignores Bedrock pricing, volume discounts, caching).
          &ldquo;Saved via Learning&rdquo; is omitted in v1 (not computed).
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="sl">{label}</div>
      <div className="sn">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">{title}</div></div>
      <div style={{ padding: 10 }}>{children}</div>
    </div>
  );
}
