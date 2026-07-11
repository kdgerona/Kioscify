/**
 * Slugify `name` and append a numeric suffix until `exists` reports the
 * candidate is free. Shared by ProductsService (new product ids) and
 * MenusService (cloned product ids) — both need the exact same collision
 * behavior since Product ids are globally unique across the whole
 * collection, not scoped per menu.
 */
export async function generateUniqueSlugId(
  name: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let slug = baseSlug;
  let counter = 1;

  while (await exists(slug)) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}
