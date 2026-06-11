/**
 * Topbar — per-screen header bar (Frontend Spec §2 height chain: flex-shrink:0).
 */
import type { ReactNode } from "react";

export function Topbar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="tb">
      <span className="pg-t">{title}</span>
      {subtitle && <span className="pg-s">{subtitle}</span>}
      {right && <div className="tb-r">{right}</div>}
    </div>
  );
}
