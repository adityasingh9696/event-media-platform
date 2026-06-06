const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';

export const cloudinaryUrl = (publicId: string, transforms = ''): string =>
  `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transforms ? transforms + '/' : ''}${publicId}`;

export const thumbnailUrl = (publicId: string): string =>
  cloudinaryUrl(publicId, 'w_400,h_300,c_fill,q_auto,f_auto');

export const squareThumbUrl = (publicId: string, size = 200): string =>
  cloudinaryUrl(publicId, `w_${size},h_${size},c_fill,q_auto,f_auto`);

export const fullUrl = (publicId: string): string =>
  cloudinaryUrl(publicId, 'q_auto,f_auto');

export const blurUrl = (publicId: string): string =>
  cloudinaryUrl(publicId, 'w_20,h_15,c_fill,e_blur:500,q_30');

export const heroUrl = (publicId: string): string =>
  cloudinaryUrl(publicId, 'w_1920,h_600,c_fill,q_auto,f_auto,g_auto');

export const avatarUrl = (publicId: string, size = 80): string =>
  cloudinaryUrl(publicId, `w_${size},h_${size},c_fill,g_face,q_auto,f_auto,r_max`);

export const getCloudinaryUrl = cloudinaryUrl;
