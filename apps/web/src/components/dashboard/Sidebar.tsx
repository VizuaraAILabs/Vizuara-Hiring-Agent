'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import VizuaraLogo from '@/components/VizuaraLogo';

const navItems = [
  { label: 'Challenges', href: '/dashboard', icon: '{}' },
  { label: 'New Challenge', href: '/dashboard/challenges/new', icon: '+' },
  { label: 'Costs', href: '/dashboard/costs', icon: '$' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/login');
  }

  return (
    <aside className="w-64 bg-[#111] border-r border-white/5 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <VizuaraLogo size={26} />
          <span className="text-lg font-semibold text-white">
            Arc<span className="text-[#00a854]">Eval</span>
          </span>
        </Link>
        <p className="text-xs text-neutral-600 mt-1">Powered by Vizuara AI</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#00a854]/10 text-[#00a854]'
                  : 'text-neutral-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-lg font-mono">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-3 rounded-xl text-sm text-neutral-500 hover:text-white hover:bg-white/5 transition-all"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
