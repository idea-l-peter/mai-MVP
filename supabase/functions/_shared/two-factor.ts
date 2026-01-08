/**
 * 2FA Verification System for Tier 1 Critical Actions
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Verification code settings
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;

// Generate a random verification code
export function generateVerificationCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

// Store verification code in database
export async function createVerificationCode(
  userId: string,
  actionType: string
): Promise<{ code: string; expiresAt: Date }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const code = generateVerificationCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CODE_EXPIRY_MINUTES);
  
  // Delete any existing codes for this user/action
  await supabase
    .from('verification_codes')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', actionType);
  
  // Insert new code
  const { error } = await supabase
    .from('verification_codes')
    .insert({
      user_id: userId,
      action_type: actionType,
      code_hash: await hashCode(code),
      expires_at: expiresAt.toISOString(),
    });
  
  if (error) {
    console.error('[2FA] Failed to store verification code:', error);
    throw new Error('Failed to create verification code');
  }
  
  return { code, expiresAt };
}

// Verify a code
export async function verifyCode(
  userId: string,
  actionType: string,
  inputCode: string
): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Get the stored code
  const { data, error } = await supabase
    .from('verification_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .single();
  
  if (error || !data) {
    console.log('[2FA] No verification code found for user/action');
    return false;
  }
  
  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    console.log('[2FA] Verification code expired');
    // Delete expired code
    await supabase
      .from('verification_codes')
      .delete()
      .eq('id', data.id);
    return false;
  }
  
  // Verify the code
  const inputHash = await hashCode(inputCode.trim());
  if (inputHash !== data.code_hash) {
    console.log('[2FA] Verification code mismatch');
    return false;
  }
  
  // Delete the used code
  await supabase
    .from('verification_codes')
    .delete()
    .eq('id', data.id);
  
  console.log('[2FA] Verification successful');
  return true;
}

// Simple hash function for codes (in production, use proper crypto)
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code + 'mai_2fa_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Send verification code via email
export async function sendVerificationEmail(
  userEmail: string,
  code: string,
  actionDescription: string
): Promise<boolean> {
  // In a production environment, this would send an actual email
  // For now, we'll just log it and return the code in the response
  console.log(`[2FA] Verification code for ${userEmail}: ${code} (action: ${actionDescription})`);
  
  // TODO: Integrate with email service (SendGrid, Resend, etc.)
  // For now, the AI will display the code requirement in chat
  
  return true;
}

// Check and update rate limiting
export async function checkRateLimit(userId: string): Promise<{
  isLocked: boolean;
  lockoutUntil: string | null;
  failedAttempts: number;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('user_preferences')
    .select('failed_security_attempts, security_lockout_until')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return { isLocked: false, lockoutUntil: null, failedAttempts: 0 };
  }
  
  const lockoutUntil = data.security_lockout_until;
  const isLocked = lockoutUntil && new Date(lockoutUntil) > new Date();
  
  return {
    isLocked: !!isLocked,
    lockoutUntil: lockoutUntil,
    failedAttempts: data.failed_security_attempts || 0,
  };
}

// Record a failed security attempt
export async function recordFailedAttempt(userId: string): Promise<{
  newAttemptCount: number;
  isNowLocked: boolean;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_MINUTES = 15;
  
  // Get current attempts
  const { data } = await supabase
    .from('user_preferences')
    .select('failed_security_attempts')
    .eq('user_id', userId)
    .single();
  
  const currentAttempts = (data?.failed_security_attempts || 0) + 1;
  const isNowLocked = currentAttempts >= MAX_ATTEMPTS;
  
  // Update attempts and possibly set lockout
  const updateData: Record<string, unknown> = {
    failed_security_attempts: currentAttempts,
  };
  
  if (isNowLocked) {
    const lockoutUntil = new Date();
    lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_MINUTES);
    updateData.security_lockout_until = lockoutUntil.toISOString();
  }
  
  await supabase
    .from('user_preferences')
    .update(updateData)
    .eq('user_id', userId);
  
  return { newAttemptCount: currentAttempts, isNowLocked };
}

// Reset failed attempts after successful verification
export async function resetFailedAttempts(userId: string): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  await supabase
    .from('user_preferences')
    .update({
      failed_security_attempts: 0,
      security_lockout_until: null,
    })
    .eq('user_id', userId);
}
