let kokoroInstance: any = null;
let isInitializing = false;

async function initKokoro(): Promise<boolean> {
  if (kokoroInstance) return true;
  if (isInitializing) return false;

  isInitializing = true;
  try {
    // Dynamic import to avoid crash if native onnx runtime isn't ready
    const { KokoroTTS } = await import('kokoro-js');
    console.log('[KokoroTTS] Initializing Kokoro-82M on CPU...');
    kokoroInstance = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype: 'fp32',
      },
    );
    console.log('[KokoroTTS] Kokoro-82M loaded successfully.');
    isInitializing = false;
    return true;
  } catch (err: any) {
    console.warn(
      `[KokoroTTS] Local ONNX Kokoro initialization skipped (${err.message}). Falling back to client-side Web Speech.`,
    );
    isInitializing = false;
    return false;
  }
}

export async function synthesizeSpeechWav(
  text: string,
  voice: string = 'af_bella',
): Promise<Buffer | null> {
  try {
    if (!kokoroInstance) {
      await initKokoro();
    }
    if (!kokoroInstance) {
      return null;
    }

    const audio = await kokoroInstance.generate(text, {
      voice: voice,
    });

    const wavBuffer = await audio.toWav();
    return Buffer.from(wavBuffer);
  } catch (err: any) {
    console.warn(`[KokoroTTS] Speech synthesis error: ${err.message}`);
    return null;
  }
}
