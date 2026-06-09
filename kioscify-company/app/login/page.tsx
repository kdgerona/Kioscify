import { headers } from 'next/headers';
import LoginForm from './LoginForm';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  slug: string;
  primaryColor?: string;
}

async function fetchCompanyInfo(slug: string): Promise<CompanyInfo | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const res = await fetch(`${apiUrl}/companies/validate-subdomain/${slug}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.valid || !data.isActive) return null;
    return { name: data.name, logoUrl: data.logoUrl, slug, primaryColor: data.themeColors?.primary };
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get('x-company-slug');

  // No subdomain or the generic fallback portal — show slug input
  if (!companySlug || companySlug === 'company') {
    return <LoginForm companySlug={null} company={null} />;
  }

  const company = await fetchCompanyInfo(companySlug);
  return <LoginForm companySlug={company ? companySlug : null} company={company} primaryColor={company?.primaryColor} />;
}
