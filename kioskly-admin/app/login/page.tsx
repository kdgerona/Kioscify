import { headers } from 'next/headers';
import LoginForm from './LoginForm';
import BrandSlugForm from './BrandSlugForm';

interface BrandInfo {
  name: string;
  logoUrl: string | null;
  themeColors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  } | null;
}

async function fetchBrandInfo(companySlug: string, brandSlug: string): Promise<BrandInfo | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const res = await fetch(
      `${apiUrl}/brands/validate-subdomain?companySlug=${encodeURIComponent(companySlug)}&brandSlug=${encodeURIComponent(brandSlug)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.valid || !data.brand) return null;
    return data.brand;
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get('x-company-slug');
  const brandSlug = headersList.get('x-brand-slug');
  const preSelectedStoreSlug = headersList.get('x-store-slug') ?? undefined;

  // No subdomain context — show generic portal (company + brand slug entry)
  if (!companySlug || !brandSlug) {
    return <BrandSlugForm />;
  }

  const brand = await fetchBrandInfo(companySlug, brandSlug);
  return (
    <LoginForm
      companySlug={companySlug}
      brandSlug={brandSlug}
      brand={brand}
      preSelectedStoreSlug={preSelectedStoreSlug}
    />
  );
}
