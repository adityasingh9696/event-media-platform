/**
 * Hugging Face Inference API client
 * FREE tier — no credit card required
 * Sign up at https://huggingface.co → Settings → Access Tokens
 *
 * Models used:
 *  - Image classification: google/vit-large-patch16-224
 *  - Image captioning:     Salesforce/blip-image-captioning-large
 *  - NSFW detection:       Falconsai/nsfw_image_detection
 */

const HF_API = 'https://api-inference.huggingface.co/models';
const HF_KEY = process.env.HUGGINGFACE_API_KEY;

function headers() {
  return {
    Authorization: `Bearer ${HF_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Retry with backoff when model is loading (HF free tier cold starts)
async function hfRequest<T>(url: string, body: object, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json() as T;

    const errorBody = await res.json().catch(() => ({}));

    // Model is loading — wait and retry
    if (res.status === 503 && (errorBody as { estimated_time?: number }).estimated_time) {
      const wait = ((errorBody as { estimated_time?: number }).estimated_time ?? 20) * 1000;
      console.info(`HF model loading, waiting ${wait / 1000}s... (attempt ${attempt}/${retries})`);
      await new Promise(r => setTimeout(r, Math.min(wait, 30000)));
      continue;
    }

    throw new Error(`HF API error ${res.status}: ${JSON.stringify(errorBody)}`);
  }
  throw new Error('HF API: max retries exceeded');
}

// ── Image Classification (Smart Tagging) ──────────────────────────────────────
export interface HFLabel {
  label: string;
  score: number;
}

export async function classifyImage(imageUrl: string): Promise<HFLabel[]> {
  try {
    const results = await hfRequest<HFLabel[]>(
      `${HF_API}/google/vit-large-patch16-224`,
      { inputs: imageUrl }
    );
    // Return labels with score > 0.05, max 15
    return results.filter(r => r.score > 0.05).slice(0, 15);
  } catch (err) {
    console.error('classifyImage failed:', err);
    return [];
  }
}

// ── Image Captioning ──────────────────────────────────────────────────────────
export async function captionImage(imageUrl: string): Promise<string> {
  try {
    const results = await hfRequest<Array<{ generated_text: string }>>(
      `${HF_API}/Salesforce/blip-image-captioning-large`,
      { inputs: imageUrl }
    );
    return results[0]?.generated_text ?? '';
  } catch (err) {
    console.error('captionImage failed:', err);
    return '';
  }
}

// ── NSFW / Moderation Detection ───────────────────────────────────────────────
export interface ModerationResult {
  label: string;
  score: number;
}

export async function moderateImage(imageUrl: string): Promise<boolean> {
  try {
    const results = await hfRequest<ModerationResult[][]>(
      `${HF_API}/Falconsai/nsfw_image_detection`,
      { inputs: imageUrl }
    );
    const flat = results.flat();
    const nsfwEntry = flat.find(r => r.label === 'nsfw');
    return (nsfwEntry?.score ?? 0) > 0.85;
  } catch (err) {
    console.error('moderateImage failed:', err);
    return false; // fail safe — don't block on moderation error
  }
}
