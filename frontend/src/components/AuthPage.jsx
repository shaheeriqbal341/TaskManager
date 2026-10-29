import { useState } from "react";

export default function AuthPage({ mode, onModeChange, onAuthenticate, initialError = "" }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (isSignup && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAuthenticate(
        isSignup ? "/api/auth/signup" : "/api/auth/login",
        isSignup
          ? { fullName: fullName.trim(), email: email.trim(), password }
          : { email: email.trim(), password },
      );
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-main">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-mark" aria-hidden="true">m</div>
        <p className="eyebrow">{isSignup ? "START MAKING PROGRESS" : "WELCOME BACK"}</p>
        <h1 id="auth-heading">{isSignup ? "Create your account" : "Sign in to MiniTask Pro"}</h1>
        <p className="auth-copy">
          {isSignup
            ? "Keep your plans organized and moving forward."
            : "Your tasks are ready when you are."}
        </p>
        {(error || initialError) && (
          <p className="auth-error" role="alert">{error || initialError}</p>
        )}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {isSignup && (
            <>
              <label htmlFor="auth-name">Full name</label>
              <input
                autoComplete="name"
                id="auth-name"
                maxLength={100}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </>
          )}
          <label htmlFor="auth-email">Email address</label>
          <input
            autoComplete="email"
            id="auth-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="auth-password">Password</label>
          <input
            autoComplete={isSignup ? "new-password" : "current-password"}
            id="auth-password"
            maxLength={72}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {isSignup && (
            <>
              <span className="password-hint">At least 10 characters, including uppercase, lowercase, and a number.</span>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                autoComplete="new-password"
                id="auth-confirm-password"
                maxLength={72}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </>
          )}
          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Please wait..."
              : isSignup ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to MiniTask Pro?"}{" "}
          <button type="button" onClick={() => onModeChange(isSignup ? "login" : "signup")}>
            {isSignup ? "Log in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}
