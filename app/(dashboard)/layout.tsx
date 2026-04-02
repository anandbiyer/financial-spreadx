import { SidebarNav } from './_components/SidebarNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f4f3f0' }}>
      {/* ── Sidebar ── */}
      <aside
        className="flex w-[185px] flex-shrink-0 flex-col"
        style={{ background: '#0f1117' }}
      >
        {/* Logo */}
        <div className="px-[11px] py-3 border-b border-white/[0.08]">
          <div className="text-[11.5px] font-semibold text-white">Financial SpreadX</div>
          <div className="mt-px text-[8px] text-white/30">Statement Normalisation</div>
          <div className="mt-px text-[8px] font-medium text-amber-400">Demo v1.1 · 19 docs seeded</div>
        </div>

        {/* Nav */}
        <SidebarNav />

        {/* Footer */}
        <div className="mt-auto border-t border-white/[0.08] p-1">
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <div className="flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-[8.5px] font-semibold text-white">
              AS
            </div>
            <div>
              <div className="text-[10px] text-white/65">Anand S.</div>
              <div className="text-[8px] text-white/30">Demo session</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
