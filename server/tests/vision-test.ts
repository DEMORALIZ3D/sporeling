import { analyzeNatureImage, checkLlamaHealth } from '../src/ai/gemma-client.js';

async function runVisionTest() {
  console.log('Testing connection to local Gemma 4 E2B llama-server...');
  const isHealthy = await checkLlamaHealth();
  console.log(`Llama-server health status: ${isHealthy ? 'ONLINE' : 'OFFLINE'}`);

  // 1x1 green pixel base64 as minimal test payload
  const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  console.log('Dispatching test image frame to vision pipeline...');
  const result = await analyzeNatureImage(testBase64, 'image/png');
  console.log('Analysis result:');
  console.dir(result, { depth: null });
}

runVisionTest();
