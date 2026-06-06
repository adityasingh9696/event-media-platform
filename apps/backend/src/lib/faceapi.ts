/**
 * Face API setup for Node.js
 * Uses @vladmandic/face-api — runs 100% locally, no API key, completely free
 *
 * Models are downloaded automatically on first run via downloadModels()
 */

import { Canvas, Image, ImageData, loadImage } from '@napi-rs/canvas';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as tf from '@tensorflow/tfjs';
import path from 'path';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any, ImageData: ImageData as any });

const MODELS_DIR = path.join(__dirname, '../../models');
let modelsLoaded = false;

// ── Load models (call once at startup) ────────────────────────────────────────
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  try {
    await tf.ready();
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR);
    modelsLoaded = true;
    console.info('✅ Face-API models loaded');
  } catch (err: any) {
    console.error('Error loading face models:', err);
    console.warn('⚠️  Face-API models not found — facial recognition disabled. Run: pnpm --filter backend run download-models');
  }
}

// ── Detect faces in an image and return 128-d descriptors ────────────────────
export async function detectFaceDescriptors(imageUrl: string): Promise<Float32Array[]> {
  if (!modelsLoaded) return [];

  const img = await loadImage(imageUrl);
  const detections = await faceapi
    .detectAllFaces(img as unknown as HTMLImageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map(d => d.descriptor);
}

// ── Extract single face descriptor (for enrollment selfie) ───────────────────
export async function extractSelfieDescriptor(imageUrl: string): Promise<Float32Array | null> {
  if (!modelsLoaded) return null;

  const img = await loadImage(imageUrl);
  const detection = await faceapi
    .detectSingleFace(img as unknown as HTMLImageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.7 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor ?? null;
}

// ── Compare a descriptor against a list of stored descriptors ─────────────────
export function findMatchingFaces(
  queryDescriptor: Float32Array,
  storedDescriptors: Array<{ userId: string; descriptor: Float32Array }>,
  threshold = 0.5
): Array<{ userId: string; distance: number }> {
  const matcher = new faceapi.FaceMatcher(
    storedDescriptors.map(s => new faceapi.LabeledFaceDescriptors(s.userId, [s.descriptor])),
    threshold
  );

  const match = matcher.findBestMatch(queryDescriptor);
  if (match.label === 'unknown') return [];

  return [{ userId: match.label, distance: match.distance }];
}

// ── Serialize / deserialize descriptor for DB storage ─────────────────────────
export function descriptorToString(d: Float32Array): string {
  return Array.from(d).join(',');
}

export function stringToDescriptor(s: string): Float32Array {
  return new Float32Array(s.split(',').map(Number));
}

export { faceapi };
