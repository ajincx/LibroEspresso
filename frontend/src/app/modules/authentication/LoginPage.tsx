import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Lock, Mail, ShieldCheck, X } from "lucide-react";
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

export function forgotPasswordEmailValidationMessage(email:string) {
  const normalizedEmail=email.trim();
  if(!normalizedEmail)return "Enter your email address.";
  if(!SIMPLE_EMAIL_PATTERN.test(normalizedEmail))return "Enter a valid email address.";
  return null;
}

export function loginErrorMessage(reason: unknown) {
  const error = reason as { message?: unknown; response?: { data?: { error?: { code?: unknown } } } } | null;
  const code = typeof error?.response?.data?.error?.code === "string" ? error.response.data.error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (code === "INVALID_CREDENTIALS" || code === "ACCOUNT_NOT_FOUND" || code === "INVALID_PASSWORD") {
    return "Unable to sign in with those credentials.";
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
  const [resetToken]=useState(()=>new URLSearchParams(window.location.search).get("token")??"");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [recoveryBusy,setRecoveryBusy]=useState(false);
  const [recoveryFeedback,setRecoveryFeedback]=useState<{type:"success"|"error";message:string}|null>(null);
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

  const submitRecovery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recoveryBusy) return;
    setRecoveryFeedback(null);
    setRecoveryBusy(true);
    try {
      if (resetToken) {
        if (newPassword.length < 10 || newPassword !== confirmPassword) {
          const message = "Use at least 10 characters and make both passwords match.";
          setRecoveryFeedback({ type: "error", message });
          toast.error(message);
          return;
        }
        const result = await authService.resetPassword(resetToken,newPassword,confirmPassword);
        toast.success(result.message);
        window.history.replaceState({},"","/");
        window.location.reload();
      } else {
        await authService.forgotPassword(email.trim());
        setRecoveryFeedback({ type: "success", message: genericRecoveryMessage });
        toast.success(genericRecoveryMessage);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to complete password recovery.";
      setRecoveryFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const openForgotPassword = () => {
    const validationError=forgotPasswordEmailValidationMessage(email);
    if(validationError){setError(validationError);return;}
    setError("");
    setRecoveryFeedback(null);
    setForgotOpen(true);
  };

  const closeRecovery = () => {
    if (recoveryBusy || resetToken) return;
    setForgotOpen(false);
    setRecoveryFeedback(null);
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
              <button type="button" onClick={openForgotPassword}>Forgot Password?</button>
            </div>

            {formError && <div className="login-error" role="alert" aria-live="polite">{formError}</div>}

            <button className="login-submit" type="submit" disabled={submitting}>{submitting && <LoaderCircle className="login-spinner" size={17} aria-hidden="true" />}{submitting ? "Signing In..." : "Sign In"}</button>
            <div className="login-security"><ShieldCheck size={15} aria-hidden="true" /><span>Authorized Personnel Only. All Access is Logged.</span></div>
          </form>
        </div>
      </section>
      {(forgotOpen||resetToken)&&(
        <div className="auth-recovery" role="dialog" aria-modal="true" aria-labelledby="auth-recovery-title">
          <form className="auth-recovery__card" onSubmit={submitRecovery}>
            {!resetToken&&(
              <button className="auth-recovery__close" type="button" onClick={closeRecovery} aria-label="Close password recovery" disabled={recoveryBusy}>
                <X size={19} aria-hidden="true" />
              </button>
            )}
            <div className="auth-recovery__icon" aria-hidden="true">{resetToken?<KeyRound size={25}/>:<Mail size={25}/>}</div>
            <header className="auth-recovery__header">
              <p className="auth-recovery__eyebrow">ACCOUNT RECOVERY</p>
              <h2 id="auth-recovery-title">{resetToken?"Create a new password":"Forgot Password?"}</h2>
              <p>{resetToken?"Choose a secure new password for your Libro Espresso account.":<>A password reset link will be sent to the registered email address associated with this account: <strong>{email.trim()}</strong>.</>}</p>
            </header>

            <div className="auth-recovery__body">
              {resetToken?(
                <>
                  <label className="auth-recovery__field" htmlFor="reset-new-password">
                    <span>New Password</span>
                    <input id="reset-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event=>{setNewPassword(event.target.value);setRecoveryFeedback(null);}} placeholder="Enter your new password" disabled={recoveryBusy}/>
                  </label>
                  <label className="auth-recovery__field" htmlFor="reset-confirm-password">
                    <span>Confirm Password</span>
                    <input id="reset-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);setRecoveryFeedback(null);}} placeholder="Re-enter your new password" disabled={recoveryBusy}/>
                  </label>
                </>
              ):null}

              {recoveryFeedback&&(
                <div className={`auth-recovery__feedback auth-recovery__feedback--${recoveryFeedback.type}`} role={recoveryFeedback.type==="error"?"alert":"status"} aria-live="polite">
                  {recoveryFeedback.type==="success"?<CheckCircle2 size={18} aria-hidden="true"/>:<AlertCircle size={18} aria-hidden="true"/>}
                  <span>{recoveryFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="auth-recovery__actions">
              {!resetToken&&<button type="button" className="auth-recovery__secondary" onClick={closeRecovery} disabled={recoveryBusy}>Cancel</button>}
              <button type="submit" disabled={recoveryBusy||(!resetToken&&recoveryFeedback?.type==="success")} className="auth-recovery__primary">
                {recoveryBusy&&<LoaderCircle className="login-spinner" size={17} aria-hidden="true"/>}
                {recoveryBusy?"Please wait…":resetToken?"Reset Password":"Proceed"}
              </button>
            </div>
            <p className="auth-recovery__security"><ShieldCheck size={15} aria-hidden="true"/>Your account recovery information is securely protected.</p>
          </form>
        </div>
      )}
    </main>
  );
}
