import { useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { authService } from "../../services/auth.service";
import "./LoginPage.css";

export const REMEMBER_ME_ENABLED = false;
export const LOGIN_PASSWORD_MIN_LENGTH = 8;
export const isPasswordResetPath = (pathname: string) => pathname === "/reset-password";
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function loginValidationMessage(email: string, password: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail && !password) return "Enter your email address and password.";
  if (!normalizedEmail) return "Enter your email address.";
  if (!password) return "Enter your password.";
  if (!SIMPLE_EMAIL_PATTERN.test(normalizedEmail)) return "Enter a valid email address.";
  if (password.length < LOGIN_PASSWORD_MIN_LENGTH) return "Password must be at least 8 characters.";
  return null;
}

export function loginErrorMessage(reason: unknown) {
  const error = reason as { message?: unknown; response?: { data?: { error?: { code?: unknown } } } } | null;
  const code = typeof error?.response?.data?.error?.code === "string" ? error.response.data.error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (code === "ACCOUNT_NOT_FOUND") {
    return "Account not found. Please check your email address.";
  }
  if (code === "INVALID_PASSWORD") {
    return "Incorrect password. Please try again.";
  }
  if (code === "ACCOUNT_INACTIVE" || message.toLowerCase().includes("account is inactive")) {
    return "This account is inactive. Please contact your administrator.";
  }
  if (code === "ACCOUNT_TEMPORARILY_LOCKED" || code === "LOGIN_RATE_LIMITED" || message.toLowerCase().includes("too many")) return message;
  return "Unable to sign in. Please try again.";
}

interface LoginPageProps {
  onLogin: (identifier: string, password: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen,setForgotOpen]=useState(false);
  const [recoveryEmail,setRecoveryEmail]=useState("");
  const [resetToken]=useState(()=>new URLSearchParams(window.location.search).get("token")??"");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [recoveryBusy,setRecoveryBusy]=useState(false);
  const genericRecoveryMessage="If an active account uses that email, a password reset link will be sent.";
  const emailError = error === "Enter your email address." || error === "Enter a valid email address.";
  const passwordError = error === "Enter your password." || error === "Password must be at least 8 characters.";
  const formError = error && !emailError && !passwordError ? error : "";

  useEffect(() => {
    const message = sessionStorage.getItem("libro.auth.message");
    if (!message) return;
    sessionStorage.removeItem("libro.auth.message");
    toast.error(message);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const validationError = loginValidationMessage(email, password);
    if (validationError) return setError(validationError);
    setError("");
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (reason) {
      setError(loginErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Libro Espresso sign in">
        <div className="login-visual">
          <div className="login-visual__overlay" />
          <div className="login-brand">
            <img src="/images/logo.jpg" alt="Libro Espresso Cafe logo" className="login-brand__logo" />
            <div>
              <p className="login-brand__name">Libro Espresso Cafe</p>
              <p className="login-brand__branches">Gulod • Lipa • Tagaytay • Evo • Vermosa</p>
            </div>
          </div>
          <div className="login-visual__content">
            <h1>AI-ASSISTED WEB-BASED COST OF GOODS ANALYSIS AND INVENTORY SHRINKAGE MONITORING SYSTEM FOR LIBRO ESPRESSO CAFE</h1>
            <p>“Smarter Costing Better Control”</p>
          </div>
        </div>

        <div className="login-form-panel">
          <form className="login-form" onSubmit={submit} noValidate autoComplete="off">
            <header className="login-form__header">
              <div className="login-form__eyebrow"><span /> SECURE MANAGEMENT PORTAL</div>
              <h2>Welcome Back</h2>
              <p>Sign In to your Libro Espresso Account</p>
            </header>

            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <div className="login-input">
                <Mail size={18} aria-hidden="true" />
                <input id="login-email" name="libro-login-email" type="email" autoComplete="off" value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }} placeholder="Enter your email" aria-invalid={emailError} aria-describedby={emailError ? "login-email-error" : undefined} disabled={submitting} />
              </div>
              {emailError && <p id="login-email-error" className="login-field__error">{error}</p>}
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input login-password">
                <Lock size={18} aria-hidden="true" />
                <input id="login-password" name="libro-login-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }} placeholder="Enter your password" aria-invalid={passwordError} aria-describedby={passwordError ? "login-password-error" : undefined} disabled={submitting} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} disabled={submitting}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordError && <p id="login-password-error" className="login-field__error">{error}</p>}
            </div>

            <div className="login-options">
              <button type="button" onClick={() => setForgotOpen(true)}>Forgot Password?</button>
            </div>

            {formError && <div className="login-error" role="alert" aria-live="polite">{formError}</div>}

            <button className="login-submit" type="submit" disabled={submitting}>{submitting && <LoaderCircle className="login-spinner" size={17} aria-hidden="true" />}{submitting ? "Signing In..." : "Sign In"}</button>
            <div className="login-security"><ShieldCheck size={15} aria-hidden="true" /><span>Authorized Personnel Only. All Access is Logged.</span></div>
          </form>
        </div>
      </section>
      {(forgotOpen||resetToken)&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><form className="w-full max-w-md rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" onSubmit={async event=>{event.preventDefault();if(recoveryBusy)return;setRecoveryBusy(true);try{if(resetToken){if(newPassword.length<10||newPassword!==confirmPassword){toast.error("Use at least 10 characters and make both passwords match.");return;}const result=await authService.resetPassword(resetToken,newPassword,confirmPassword);toast.success(result.message);window.history.replaceState({},"","/");window.location.reload();}else{await authService.forgotPassword(recoveryEmail);toast.success(genericRecoveryMessage);setForgotOpen(false);}}catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to complete password recovery.");}finally{setRecoveryBusy(false);}}}>
        <h2 className="text-lg font-bold">{resetToken?"Choose a new password":"Forgot Password"}</h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">{resetToken?"This secure link can be used once before it expires.":"Enter your registered email. The response is intentionally the same for every address."}</p>
        {resetToken?<><label className="mt-4 block text-sm font-medium">New password<input className="field mt-1.5" type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label><label className="mt-3 block text-sm font-medium">Confirm password<input className="field mt-1.5" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label></>:<label className="mt-4 block text-sm font-medium">Email<input className="field mt-1.5" type="email" value={recoveryEmail} onChange={event=>setRecoveryEmail(event.target.value)} required/></label>}
        <div className="mt-6 flex justify-end gap-2">{!resetToken&&<button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={()=>setForgotOpen(false)}>Cancel</button>}<button type="submit" disabled={recoveryBusy} className="rounded-xl bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{recoveryBusy?"Please wait…":resetToken?"Reset Password":"Send Reset Link"}</button></div>
      </form></div>}
    </main>
  );
}
