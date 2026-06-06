import fs from 'fs';
import path from 'path';

const MODEL_DIR = path.resolve(__dirname, '../../models');
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

async function downloadFile(url: string, destPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

async function main() {
  console.info(`📥 Downloading face-api.js models to ${MODEL_DIR}...`);
  
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  for (const file of files) {
    const dest = path.join(MODEL_DIR, file);
    if (fs.existsSync(dest)) {
      console.info(` - ${file} already exists, skipping`);
      continue;
    }
    
    const url = `${BASE_URL}/${file}`;
    console.info(` - Downloading ${file}...`);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`❌ Error downloading ${file}:`, err);
    }
  }

  console.info('✅ Model download complete.');
}

main().catch(console.error);
