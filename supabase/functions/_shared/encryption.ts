// AES-GCM encryption using Web Crypto API
// Tokens are encrypted before storage and decrypted on retrieval

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM (recommended)

// Import the encryption key from environment
async function getKey(): Promise<CryptoKey> {
  const keyBase64 = Deno.env.get('ENCRYPTION_KEY');
  if (!keyBase64) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  
  // Decode base64 key to bytes
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  
  // Validate key length (256 bits = 32 bytes for AES-256)
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${keyBytes.length}`);
  }
  
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns base64 encoded string containing IV + ciphertext
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  
  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encode plaintext to bytes
  const encodedText = new TextEncoder().encode(plaintext);
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encodedText
  );
  
  // Combine IV + ciphertext into single array
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 encoded string (IV + ciphertext) back to plaintext
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await getKey();
  
  // Decode base64 to bytes
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );
  
  // Decode bytes back to string
  return new TextDecoder().decode(decrypted);
}
