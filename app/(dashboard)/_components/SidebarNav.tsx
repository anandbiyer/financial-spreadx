'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href?: string;
  /** For doc-scoped items: build href from current doc ID */
  docHref?: (id: string) => string;
  dot: string;
  count?: number;
  matchPrefix?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Ingestion',
    items: [
      { label: 'Upload', href: '/upload', dot: '#60a5fa' },
    ],
  },
  {
    title: 'Review',
    items: [
      { label: 'Documents', href: '/documents', dot: '#34d399' },
      { label: 'Workbench', dot: '#f59e0b', matchPrefix: '/review', docHref: (id) => `/review/${id}` },
      { label: 'Statement Tree', dot: '#5eead4', matchPrefix: '/review', docHref: (id) => `/review/${id}/tree` },
      { label: 'Validation', dot: '#f87171', matchPrefix: '/validation', docHref: (id) => `/validation/${id}` },
    ],
  },
  {
    title: 'Output',
    items: [
      { label: 'Export Centre', dot: '#86efac', matchPrefix: '/export', docHref: (id) => `/export/${id}` },
    ],
  },
];

/** Extract document ID from doc-scoped routes: /review/[id], /validation/[id], /export/[id] */
function extractDocId(pathname: string): string | null {
  const match = pathname.match(/^\/(review|validation|export)\/([^/]+)/);
  return match ? match[2] : null;
}

export function SidebarNav() {
  const pathname = usePathname();
  const docId = extractDocId(pathname);

  function isActive(item: NavItem) {
    if (item.href) return pathname === item.href;
    if (item.matchPrefix) {
      if (item.label === 'Statement Tree') return pathname.endsWith('/tree');
      if (item.label === 'Export Centre') return pathname.startsWith('/export');
      if (item.label === 'Validation') return pathname.startsWith('/validation');
      if (item.label === 'Workbench') return pathname.startsWith('/review') && !pathname.endsWith('/tree');
    }
    return false;
  }

  return (
    <nav className="flex-1 px-1 py-1.5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="px-1.5 py-2 pt-3 text-[8px] font-medium uppercase tracking-[0.1em] text-white/30">
            {group.title}
          </div>
          {group.items.map((item) => {
            const active = isActive(item);
            const resolvedHref = item.href ?? (item.docHref && docId ? item.docHref(docId) : null);
            const inner = (
              <div
                className="flex items-center gap-1.5 rounded px-1.5 py-[5px] mb-px text-[10.5px]"
                style={{
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: active ? '#fff' : resolvedHref ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.20)',
                  cursor: resolvedHref ? 'pointer' : 'default',
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: item.dot }}
                />
                {item.label}
                {item.count !== undefined && (
                  <span className="ml-auto rounded-[7px] bg-white/10 px-1 py-px text-[8.5px] text-white/50">
                    {item.count}
                  </span>
                )}
              </div>
            );

            return resolvedHref ? (
              <Link key={item.label} href={resolvedHref} className="block">
                {inner}
              </Link>
            ) : (
              <div key={item.label}>{inner}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
