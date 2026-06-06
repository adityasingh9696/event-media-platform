import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── MediaMetadata Model ──────────────────────────────────────────────────────

export interface IMediaMetadata extends Document {
  mediaId: string;
  s3Key: string;
  thumbnails: {
    sm?: string;
    md?: string;
    lg?: string;
  };
  aiCaption?: string;
  aiTags?: string[];
  processingStatus: 'pending' | 'processing' | 'done' | 'failed';
  processingError?: string;
  perceptualHash?: string;
  uploadedAt: Date;
  updatedAt: Date;
}

const MediaMetadataSchema = new Schema<IMediaMetadata>(
  {
    mediaId: { type: String, required: true, unique: true, index: true },
    s3Key: { type: String, required: true },
    thumbnails: {
      sm: { type: String },
      md: { type: String },
      lg: { type: String },
    },
    aiCaption: { type: String },
    aiTags: [{ type: String }],
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    processingError: { type: String },
    perceptualHash: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'media_metadata',
  }
);

export const MediaMetadata: Model<IMediaMetadata> =
  mongoose.models.MediaMetadata ||
  mongoose.model<IMediaMetadata>('MediaMetadata', MediaMetadataSchema);

// ─── Connection ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectMongoDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.info('✅ MongoDB connected');
      return;
    } catch (err) {
      attempt++;
      const error = err as Error;
      console.error(
        `MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`
      );
      if (attempt < MAX_RETRIES) {
        console.info(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.info('✅ MongoDB reconnected');
});

export default mongoose;
