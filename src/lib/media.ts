import { supabase } from "@/integrations/supabase/client";

const BUCKET = "event-media";

export function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * For images, we use Supabase's image transformation endpoint to deliver
 * a low-quality preview (LQIP) and an optimized full-size image.
 */
export function thumbUrl(path: string, w = 600): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
    transform: { width: w, quality: 70, resize: "cover" },
  });
  return data.publicUrl;
}

export function lqipUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
    transform: { width: 32, quality: 30, resize: "cover" },
  });
  return data.publicUrl;
}

export function inferMediaType(file: File): "image" | "video" {
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}
