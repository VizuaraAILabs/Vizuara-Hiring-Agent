'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ChallengesAdminPage } from '../AdminSections';

function AdminChallengesContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id') ?? undefined;

  return <ChallengesAdminPage initialCompanyId={companyId} />;
}

export default function AdminChallengesPage() {
  return (
    <Suspense fallback={null}>
      <AdminChallengesContent />
    </Suspense>
  );
}
