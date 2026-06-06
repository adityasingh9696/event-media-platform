import sharp from 'sharp';
import { prisma } from '../lib/prisma';

interface WatermarkParams {
  imageUrl: string;
  userId: string;
  mediaId: string;
  userRole: string;
  eventName: string;
  clubId: string;
}

export async function applyWatermark(params: WatermarkParams): Promise<Buffer> {
  const { imageUrl, userId, mediaId, userRole, eventName, clubId } = params;

  // 1. Fetch watermark configuration for the club
  const config = await prisma.watermarkConfig.findUnique({
    where: { clubId },
  }) || {
    includeClubName: true,
    includeEventName: true,
    includeUserRole: true,
    includeTimestamp: false,
    memberOpacity: 0.5,
    adminOpacity: 0.3,
    memberDiagonal: true,
    adminDiagonal: false,
    position: 'southeast',
  };

  // Fetch the club details for name
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  const clubName = club?.name || 'PixelVault';

  // 2. Fetch the image from Cloudinary
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from Cloudinary for watermarking: ${response.statusText}`);
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // 3. Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 800;

  // 4. Construct watermark text parts
  const textParts: string[] = [];
  if (config.includeClubName) textParts.push(clubName);
  if (config.includeEventName) textParts.push(eventName);
  if (config.includeUserRole) textParts.push(`[${userRole.toUpperCase()}]`);
  if (config.includeTimestamp) textParts.push(new Date().toLocaleDateString());

  const watermarkText = textParts.join(' • ') || 'PixelVault';

  // Determine diagonal or corner styling
  const isDiagonal = userRole === 'admin' || userRole === 'photographer' 
    ? config.adminDiagonal 
    : config.memberDiagonal;

  const opacity = userRole === 'admin' || userRole === 'photographer'
    ? config.adminOpacity
    : config.memberOpacity;

  // 5. Generate SVG overlay
  let svgOverlay = '';
  if (isDiagonal) {
    // Center diagonal text
    const fontSize = Math.max(16, Math.round(width * 0.035));
    svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <style>
          .wm-text {
            fill: #ffffff;
            fill-opacity: ${opacity};
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: bold;
            font-size: ${fontSize}px;
            text-anchor: middle;
            dominant-baseline: middle;
            filter: drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.5));
          }
        </style>
        <text x="50%" y="50%" transform="rotate(-30, ${width / 2}, ${height / 2})" class="wm-text">
          ${watermarkText}
        </text>
      </svg>
    `;
  } else {
    // Bottom-right / Southeast text
    const fontSize = Math.max(12, Math.round(width * 0.02));
    const paddingX = Math.round(width * 0.03);
    const paddingY = Math.round(height * 0.04);
    svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <style>
          .wm-text {
            fill: #ffffff;
            fill-opacity: ${opacity};
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: bold;
            font-size: ${fontSize}px;
            text-anchor: end;
            dominant-baseline: auto;
            filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.6));
          }
        </style>
        <text x="${width - paddingX}" y="${height - paddingY}" class="wm-text">
          ${watermarkText}
        </text>
      </svg>
    `;
  }

  // 6. Apply composite
  return sharp(imageBuffer)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .toBuffer();
}
