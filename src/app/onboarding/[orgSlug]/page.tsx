import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import OnboardingWizardClient from './OnboardingWizardClient';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin } = await requireOrgAccess(orgSlug);

  if (!isAdmin) {
    redirect(`/w/${org.slug}`);
  }

  return <OnboardingWizardClient org={org} />;
}
