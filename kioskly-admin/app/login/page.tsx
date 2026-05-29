import { headers } from 'next/headers';
import LoginForm from './LoginForm';
import CompanySlugForm from './CompanySlugForm';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
}

async function fetchCompanyInfo(slug: string): Promise<CompanyInfo | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const res = await fetch(`${apiUrl}/companies/validate-subdomain/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.valid || !data.isActive) return null;
    return { name: data.name, logoUrl: data.logoUrl };
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get('x-company-slug');

  // No company subdomain — show generic portal (company slug entry + redirect)
  if (!companySlug) {
    return <CompanySlugForm />;
  }

  const company = await fetchCompanyInfo(companySlug);
  return <LoginForm companySlug={companySlug} company={company} />;
}
