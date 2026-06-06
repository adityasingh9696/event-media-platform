import { Canvas, Image, ImageData, loadImage } from '@napi-rs/canvas';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as tf from '@tensorflow/tfjs';
import path from 'path';

// ─── Monkey-patch for Node.js ─────────────────────────────────────────────────
// face-api.js requires a browser-like canvas environment; we supply it via the
// `@napi-rs/canvas` npm package.
faceapi.env.monkeyPatch({
  Canvas: Canvas as unknown as typeof HTMLCanvasElement,
  Image: Image as unknown as typeof HTMLImageElement,
  ImageData: ImageData as unknown as typeof globalThis.ImageData,
});

// ─── Model Directory ──────────────────────────────────────────────────────────
export const MODEL_DIR = path.resolve(process.cwd(), 'models');

// ─── Model Loader (idempotent) ────────────────────────────────────────────────
let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  await tf.ready();
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR),
  ]);

  modelsLoaded = true;
  console.info('✅ face-api.js models loaded');
}

// ─── Detection Options ────────────────────────────────────────────────────────
export const faceDetectionOptions = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.5,
});

// ─── Descriptor Serialization ─────────────────────────────────────────────────

/**
 * Serialize a Float32Array face descriptor to a comma-separated string for DB storage.
 */
export function descriptorToString(descriptor: Float32Array): string {
  return Array.from(descriptor).join(',');
}

/**
 * Deserialize a comma-separated descriptor string back to Float32Array.
 */
export function stringToDescriptor(str: string): Float32Array {
  return new Float32Array(str.split(',').map(Number));
}

/**
 * Compute Euclidean distance between two 128-d face descriptors.
 * Distance < 0.6 → same person (standard threshold).
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Load an image from a URL or file path into a canvas Image object.
 */
export async function loadImageFromUrl(url: string): Promise<Image> {
  return loadImage(url);
}

export { faceapi };
