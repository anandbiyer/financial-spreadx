"use client";

/**
 * Sidebar — persistent navigation shell (Frontend Spec §3, FrontendDesign §9.5).
 *
 * Phase 0: section grouping + active-route highlight. Index routes (Documents, Upload,
 * Cost, Settings) are live; document-scoped screens are shown disabled until their phase
 * (they are reached by selecting a document, built in later phases).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  dot: string;
  count?: string;
  enabled: boolean;
}
interface NavGroup {
  label: string;
  spread?: boolean;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Settings",
    items: [{ label: "Settings", href: "/settings", dot: "#e879f9", enabled: true }],
  },
  {
    label: "Ingestion",
    items: [
      { label: "Upload & Classify", href: "/upload", dot: "#60a5fa", enabled: true },
    ],
  },
  {
    label: "Extract",
    items: [
      { label: "Document Library", href: "/", dot: "#34d399", enabled: true },
      { label: "Review Workbench", href: "/review", dot: "#f59e0b", enabled: false },
      { label: "Statement Tree", href: "/tree", dot: "#5eead4", enabled: false },
      { label: "Validation", href: "/validation", dot: "#f87171", enabled: false },
    ],
  },
  {
    label: "Spread",
    spread: true,
    items: [
      { label: "Spread Review", href: "/spread", dot: "#f472b6", enabled: false },
      { label: "Compare View", href: "/compare", dot: "#fb923c", enabled: false },
      { label: "Unmapped Resolver", href: "/resolver", dot: "#c084fc", enabled: false },
    ],
  },
  {
    label: "Output",
    items: [
      { label: "Export Centre", href: "/export", dot: "#86efac", enabled: false },
      { label: "LLM Cost", href: "/cost", dot: "#a78bfa", enabled: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside id="sidebar">
      <div className="sb-logo">
        <div className="sb-m">Financial SpreadX</div>
        <div className="sb-sub">Statement Normalisation</div>
        <div className="sb-demo">v1 · Stage 11 Spreading</div>
      </div>
      <div className="sb-nav">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className={group.spread ? "sg sg-spread" : "sg"}>{group.label}</div>
            {group.items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const className = `si${active ? " active" : ""}${
                item.enabled ? "" : " disabled"
              }`;
              const inner = (
                <>
                  <span className="si-dot" style={{ background: item.dot }} />
                  {item.label}
                  {item.count && <span className="si-ct">{item.count}</span>}
                </>
              );
              return item.enabled ? (
                <Link key={item.label} href={item.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <div key={item.label} className={className} title="Available in a later phase">
                  {inner}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <div className="sb-user">
          <div className="av">AS</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>Anand S.</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>Single-user</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
