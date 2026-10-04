import { useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import "./LoginPage.css";

export const REMEMBER_ME_ENABLED = false;
export const LOGIN_PASSWORD_MIN_LENGTH = 8;
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
            <h1>AN AI-DRIVEN WEB-BASED COST OF GOODS ANALYSIS SYSTEM FOR MONITORING OF INVENTORY SHRINKAGE</h1>
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
              <button type="button" onClick={() => toast.info("Password recovery is not configured yet. Please contact the system administrator.")}>Forgot Password?</button>
            </div>

            {formError && <div className="login-error" role="alert" aria-live="polite">{formError}</div>}

            <button className="login-submit" type="submit" disabled={submitting}>{submitting && <LoaderCircle className="login-spinner" size={17} aria-hidden="true" />}{submitting ? "Signing In..." : "Sign In"}</button>
            <div className="login-security"><ShieldCheck size={15} aria-hidden="true" /><span>Authorized Personnel Only. All Access is Logged.</span></div>
          </form>
        </div>
      </section>
    </main>
  );
}
