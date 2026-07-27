// Login gate. Renders a full-screen email/password form and resolves once the
// user is authenticated. If auth isn't configured (blank config.js), it skips
// straight through so the app still runs locally with no login.

import { authEnabled } from './amplify-setup.js';
import { currentUser, login, completeNewPassword } from './auth.js';
import { esc } from '../templates/_helpers.js';

const NEW_PW_STEP = 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';

// Resolves when signed in (or immediately if auth is disabled).
export async function ensureSignedIn() {
  if (!(await authEnabled())) return { skipped: true };

  const existing = await currentUser();
  if (existing) return { user: existing };

  return new Promise((resolve) => mountLogin(resolve));
}

function mountLogin(resolve) {
  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <form class="login-card" id="login-form" novalidate>
      <h1>Minute Book</h1>
      <p class="login-sub">Sign in to your corporate records</p>
      <div class="login-err" id="login-err" hidden></div>

      <div class="login-stage" data-stage="signin">
        <label for="login-email">Email</label>
        <input id="login-email" type="email" autocomplete="username" required />
        <label for="login-pass">Password</label>
        <input id="login-pass" type="password" autocomplete="current-password" required />
        <button type="submit" class="btn btn-primary login-btn">Sign in</button>
      </div>

      <div class="login-stage" data-stage="newpass" hidden>
        <p class="login-note">First sign-in: choose a new password.</p>
        <label for="login-newpass">New password</label>
        <input id="login-newpass" type="password" autocomplete="new-password" />
        <button type="button" class="btn btn-primary login-btn" id="set-newpass">Set password &amp; continue</button>
      </div>
    </form>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#login-form');
  const errEl = overlay.querySelector('#login-err');
  const stageSignin = overlay.querySelector('[data-stage="signin"]');
  const stageNewpass = overlay.querySelector('[data-stage="newpass"]');

  const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
  const clearErr = () => { errEl.hidden = true; };
  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (on) { btn._label = btn.textContent; btn.textContent = 'Working…'; }
    else { btn.textContent = label || btn._label; }
  };

  const finish = () => { overlay.remove(); resolve({ user: true }); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErr();
    const email = overlay.querySelector('#login-email').value.trim();
    const password = overlay.querySelector('#login-pass').value;
    if (!email || !password) { showErr('Enter your email and password.'); return; }
    const btn = form.querySelector('.login-btn');
    busy(btn, true);
    try {
      const res = await login(email, password);
      if (res.isSignedIn) return finish();
      if (res.nextStep && res.nextStep.signInStep === NEW_PW_STEP) {
        stageSignin.hidden = true;
        stageNewpass.hidden = false;
        overlay.querySelector('#login-newpass').focus();
        return;
      }
      showErr(`Additional step required: ${esc(res.nextStep?.signInStep || 'unknown')}. Contact the administrator.`);
    } catch (err) {
      showErr(friendly(err));
    } finally {
      busy(btn, false, 'Sign in');
    }
  });

  overlay.querySelector('#set-newpass').addEventListener('click', async () => {
    clearErr();
    const np = overlay.querySelector('#login-newpass').value;
    if (!np) { showErr('Enter a new password.'); return; }
    const btn = overlay.querySelector('#set-newpass');
    busy(btn, true);
    try {
      const res = await completeNewPassword(np);
      if (res.isSignedIn) return finish();
      showErr('Could not complete sign-in. Please try again.');
    } catch (err) {
      showErr(friendly(err));
    } finally {
      busy(btn, false, 'Set password & continue');
    }
  });
}

function friendly(err) {
  const name = err && (err.name || err.code);
  switch (name) {
    case 'NotAuthorizedException': return 'Incorrect email or password.';
    case 'UserNotFoundException': return 'No account found for that email.';
    case 'UserNotConfirmedException': return 'This account isn’t confirmed yet.';
    case 'PasswordResetRequiredException': return 'A password reset is required — reset it in the AWS console, then sign in.';
    case 'InvalidPasswordException': return 'Password doesn’t meet the pool’s requirements.';
    case 'NetworkError': return 'Network error — check your connection.';
    default: return (err && err.message) ? err.message : 'Sign-in failed.';
  }
}
