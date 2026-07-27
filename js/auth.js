// Thin wrapper over Amplify Auth (Cognito user pool). Uses the existing pool
// configured in js/config.js. In-app email/password flow (USER_SRP_AUTH) —
// no hosted-UI redirect. Handles the common "admin-created user must set a new
// password on first login" challenge.

import { ensureAmplifyConfigured } from './amplify-setup.js';

const AUTH_ESM = 'https://esm.sh/aws-amplify@6/auth';

async function authMod() {
  await ensureAmplifyConfigured();
  return import(AUTH_ESM);
}

// Returns the signed-in user, or null. Also treats a restored session as
// signed-in so the user isn't prompted every visit.
export async function currentUser() {
  try {
    const { getCurrentUser } = await authMod();
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function currentEmail() {
  try {
    const { fetchUserAttributes } = await authMod();
    const attrs = await fetchUserAttributes();
    return attrs.email || null;
  } catch {
    return null;
  }
}

// Returns the raw Amplify signIn result: { isSignedIn, nextStep }.
// Callers inspect nextStep.signInStep for challenges.
export async function login(email, password) {
  const { signIn } = await authMod();
  return signIn({ username: email, password });
}

// Complete the NEW_PASSWORD_REQUIRED challenge (first login for admin-created
// users). Returns { isSignedIn, nextStep }.
export async function completeNewPassword(newPassword) {
  const { confirmSignIn } = await authMod();
  return confirmSignIn({ challengeResponse: newPassword });
}

export async function logout() {
  const { signOut } = await authMod();
  await signOut();
}
