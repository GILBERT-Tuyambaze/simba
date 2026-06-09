import { supabase } from './supabase';

export const STORAGE_BUCKETS = {
  productImages: 'product-images',
  blogMedia: 'blog-media',
  privateDocuments: 'private-documents',
} as const;

export async function uploadProductImage(file: File, pathPrefix = 'products'): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const objectPath = `${pathPrefix}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.productImages)
    .upload(objectPath, file, {
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.productImages)
    .getPublicUrl(objectPath);

  return data.publicUrl;
}

export async function deleteProductImage(objectPath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.productImages)
    .remove([objectPath]);

  if (error) {
    throw error;
  }
}
