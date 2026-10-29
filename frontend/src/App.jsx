import { useCallback, useEffect, useState } from "react";
import CompanyWorkspace from "./components/CompanyWorkspace.jsx";
import AuthPage from "./components/AuthPage.jsx";
import EmployeeAvatar, { getDisplayName } from "./components/EmployeeAvatar.jsx";
import PersonalTasks from "./components/PersonalTasks.jsx";

const API_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "")
).replace(/\/$/, "");

async function request(path, options = {}, csrfToken = "") {
  if (!API_URL && !import.meta.env.DEV) {
    throw new Error("The API URL is not configured. Set VITE_API_BASE_URL and rebuild the frontend.");
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the API. Check that the backend is running.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [showPersonalTasks, setShowPersonalTasks] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem("minitask-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const { csrfToken: token } = await request("/api/auth/csrf");
        if (!active) return;
        setCsrfToken(token);
        try {
          const { user: currentUser } = await request("/api/auth/me");
          if (active) setUser(currentUser);
        } catch (error) {
          if (error.status !== 401) throw error;
        }
      } catch (error) {
        if (active) setStartupError(error.message);
      } finally {
        if (active) setAuthReady(true);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    setNotice("");
    try {
      setTasks(await request("/api/tasks"));
    } catch (error) {
      setPageError(error.message);
      if (error.status === 401) setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("minitask-theme", theme);
    } catch {
      // The selected theme remains available for the current page if storage is disabled.
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (user?.role === "employee" && csrfToken && showPersonalTasks) loadTasks();
    else {
      setTasks([]);
      setIsLoading(false);
    }
  }, [user, csrfToken, showPersonalTasks, loadTasks]);

  async function authenticate(path, credentials) {
    if (!csrfToken) throw new Error("Security token is not ready. Refresh and try again.");
    const { user: authenticatedUser } = await request(
      path,
      { method: "POST", body: JSON.stringify(credentials) },
      csrfToken,
    );
    setStartupError("");
    setPageError("");
    setUser(authenticatedUser);
  }

  async function logout() {
    setPageError("");
    try {
      await request("/api/auth/logout", { method: "POST" }, csrfToken);
      setUser(null);
      setTasks([]);
      setAuthMode("login");
      setShowPersonalTasks(false);
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function addTask(task) {
    setIsSaving(true);
    setPageError("");
    setNotice("");
    try {
      const created = await request(
        "/api/tasks",
        { method: "POST", body: JSON.stringify(task) },
        csrfToken,
      );
      setTasks((current) => [created, ...current]);
      setNotice("Task added.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleTask(task) {
    if (!task?._id) {
      setPageError("The selected task could not be updated.");
      return;
    }

    setBusyId(task._id);
    setPageError("");
    setNotice("");
    try {
      const updated = await request(
        `/api/tasks/${task._id}`,
        { method: "PATCH", body: JSON.stringify({ completed: !task.completed }) },
        csrfToken,
      );
      setTasks((current) => current.map((item) => item._id === updated._id ? updated : item));
      setNotice(updated.completed ? "Task completed." : "Task moved to pending.");
    } catch (error) {
      setPageError(error.message);
      if (error.status === 401) setUser(null);
    } finally {
      setBusyId(null);
    }
  }

  async function updateTask(task, changes) {
    if (!task?._id) {
      setPageError("The selected task could not be updated.");
      return false;
    }

    setBusyId(task._id);
    setPageError("");
    setNotice("");
    try {
      const updated = await request(
        `/api/tasks/${task._id}`,
        { method: "PATCH", body: JSON.stringify(changes) },
        csrfToken,
      );
      setTasks((current) => current.map((item) => item._id === updated._id ? updated : item));
      setNotice("Task updated.");
      return true;
    } catch (error) {
      setPageError(error.message);
      if (error.status === 401) setUser(null);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(task) {
    if (!task?._id) {
      setPageError("The selected task could not be deleted.");
      return;
    }
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

    setBusyId(task._id);
    setPageError("");
    setNotice("");
    try {
      await request(`/api/tasks/${task._id}`, { method: "DELETE" }, csrfToken);
      setTasks((current) => current.filter((item) => item._id !== task._id));
      setNotice("Task deleted.");
    } catch (error) {
      setPageError(error.message);
      if (error.status === 401) setUser(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="MiniTask Pro home">
          <span className="brand-mark" aria-hidden="true"><span>m</span></span>
          <span>mini<span className="brand-light">task</span><b>pro</b></span>
        </a>
        <div className="topbar-actions">
          {user ? (
            <div className="account-controls">
              <EmployeeAvatar className="account-avatar" email={user.email} name={user.fullName} />
              <span className="account-name">{getDisplayName(user.fullName, user.email)}</span>
              {user.role === "employee" && showPersonalTasks && (
                <button className="logout-button" onClick={() => setShowPersonalTasks(false)} type="button">Company workspace</button>
              )}
              <button className="logout-button" onClick={logout} type="button">Log out</button>
            </div>
          ) : (
            <div className="topbar-note"><span className="online-dot" /> YOUR DAY, IN FOCUS</div>
          )}
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {!authReady ? (
        <main className="loading-state auth-loading"><span className="spinner" /> Restoring your session...</main>
      ) : !user ? (
        <AuthPage
          mode={authMode}
          onModeChange={(mode) => {
            setAuthMode(mode);
            setStartupError("");
          }}
          onAuthenticate={authenticate}
          initialError={startupError}
        />
      ) : (
        <>
          {user.role === "admin" || !showPersonalTasks ? (
            <CompanyWorkspace
              user={user}
              csrfToken={csrfToken}
              apiRequest={request}
              onShowPersonalTasks={user.role === "employee" ? () => setShowPersonalTasks(true) : null}
            />
          ) : (
            <PersonalTasks
              tasks={tasks}
              isLoading={isLoading}
              isSaving={isSaving}
              busyId={busyId}
              pageError={pageError}
              notice={notice}
              onAdd={addTask}
              onToggle={toggleTask}
              onUpdate={updateTask}
              onDelete={deleteTask}
              onRetry={loadTasks}
            />
          )}
        </>
      )}
    </div>
  );
}
