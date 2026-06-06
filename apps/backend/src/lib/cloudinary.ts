import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Generate a signed upload signature for direct browser upload to Cloudinary.
 * The browser POSTs directly to https://api.cloudinary.com/v1_1/<cloud>/auto/upload
 * with these params (no server-side file transfer needed).
 */
export async function generateUploadSignature(folder: string): Promise<{
  timestamp: number;
  signature: string;
  cloudName: string | undefined;
  apiKey: string | undefined;
  folder: string;
  eager: string;
}> {
  const timestamp = Math.round(Date.now() / 1000);
  const eager = 'w_200,h_200,c_fill|w_600,h_600,c_fill|w_1200,h_1200,c_fill';
  const params: Record<string, string | number> = { timestamp, folder, eager };

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    timestamp,
    signature,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
    eager,
  };
}

/**
 * Delete a media item from Cloudinary by its public ID.
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<{ result: string }> {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Get an optimised delivery URL for a given public ID.
 * Uses auto format and quality, fill crop to exact dimensions.
 */
export function getOptimizedUrl(publicId: string, width: number): string {
  return cloudinary.url(publicId, {
    width,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto',
  });
}

/**
 * Get resource details (width, height, format, bytes, etc.) from Cloudinary.
 */
export async function getResourceDetails(publicId: string): Promise<{
  width: number;
  height: number;
  format: string;
  bytes: number;
  secure_url: string;
}> {
  const result = await cloudinary.api.resource(publicId, {
    resource_type: 'image',
  });
  return {
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
    secure_url: result.secure_url,
  };
}

/**
 * Upload a buffer directly to Cloudinary (used server-side for selfie uploads etc.)
 */
export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<{ public_id: string; secure_url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          width: result.width ?? 0,
          height: result.height ?? 0,
        });
      }
    );
    stream.end(buffer);
  });
}

export { cloudinary };
