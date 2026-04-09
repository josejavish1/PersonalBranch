'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RadioTower, Rss, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    label: 'Radar Diario',
    href: '/radar',
    icon: RadioTower,
  },
  {
    label: 'Mis Fuentes',
    href: '/sources',
    icon: Rss,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-56 flex-shrink-0 h-full"
      style={{
        backgroundColor: 'hsl(var(--sidebar))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/15 border border-primary/25">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-foreground tracking-tight">AI Radar</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 tracking-wide uppercase font-medium">Executive</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Navegación
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-primary' : '')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Settings className="w-3 h-3 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">MVP v0.1</p>
            <p className="text-[10px] text-muted-foreground">Gemini API Ready</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
