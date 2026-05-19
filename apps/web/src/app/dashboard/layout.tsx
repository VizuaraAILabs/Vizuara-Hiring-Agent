import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import Sidebar from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="dashboard-main flex-1 py-8 pl-8 pr-4">
        {children}
      </main>
    </div>
  );
}
