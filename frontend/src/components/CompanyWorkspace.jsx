import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import EmployeeAvatar, { getDisplayName } from "./EmployeeAvatar.jsx";

const adminNavigation = [
  ["overview", "Overview"],
  ["tasks", "Task management"],
  ["employees", "Employees"],
  ["reviews", "Review center"],
  ["reports", "Reports"],
  ["notifications", "Notifications"],
];
const employeeNavigation = [
  ["overview", "Overview"],
  ["tasks", "My tasks"],
  ["notifications", "Notifications"],
];
const statuses = [
  "assigned",
  "in_progress",
  "pending_review",
  "revision_requested",
  "approved",
  "rejected",
];
const statusLabels = {
  assigned: "Assigned",
  in_progress: "In progress",
  pending_review: "Pending review",
  revision_requested: "Revision requested",
  approved: "Approved",
  rejected: "Rejected",
};

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleDateString(undefined, options);
}

function employeeDisplayName(employee) {
  return employee?.displayName || getDisplayName(employee?.fullName, employee?.email);
}

function SummaryCard({ label, value, tone = "purple", caption }) {
  return (
    <article className={`company-stat company-stat-${tone}`}>
      <span className="company-stat-label">{label}</span>
      <strong>{value ?? 0}</strong>
      {caption && <span className="company-stat-caption">{caption}</span>}
    </article>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`workflow-badge workflow-${status || "assigned"}`}>
      {statusLabels[status] || "Personal"}
    </span>
  );
}

function TaskAssignmentForm({ initialTask, loadEmployeeOptions, onSubmit, isSaving }) {
  const initialAssignee = initialTask?.assignedTo && typeof initialTask.assignedTo === "object"
    ? initialTask.assignedTo
    : null;
  const [employeeOptions, setEmployeeOptions] = useState(() => (
    initialAssignee && initialAssignee.isActive !== false ? [initialAssignee] : []
  ));
  const [employeeQuery, setEmployeeQuery] = useState(() => (
    initialAssignee ? employeeDisplayName(initialAssignee) : ""
  ));
  const [values, setValues] = useState(() => ({
    title: initialTask?.title || "",
    description: initialTask?.description || "",
    instructions: initialTask?.instructions || "",
    assignedTo: initialTask?.assignedTo?._id || initialTask?.assignedTo || "",
    priority: initialTask?.priority || "medium",
    startDate: initialTask?.startDate ? new Date(initialTask.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    dueDate: initialTask?.dueDate ? new Date(initialTask.dueDate).toISOString().slice(0, 10) : "",
  }));
  const [formError, setFormError] = useState("");
  const [employeeLoadError, setEmployeeLoadError] = useState("");
  const [isEmployeeLoading, setIsEmployeeLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState(-1);
  const [employeeLoadAttempt, setEmployeeLoadAttempt] = useState(0);
  const dropdownRef = useRef(null);
  const employeeListId = useId();
  const selectedEmployee = employeeOptions.find((employee) => employee._id === values.assignedTo)
    || (initialAssignee?._id === values.assignedTo ? initialAssignee : null);

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    let active = true;
    setEmployeeLoadError("");
    setIsEmployeeLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await loadEmployeeOptions(employeeQuery);
        if (active) {
          setEmployeeOptions((current) => {
            const selected = current.find((employee) => employee._id === values.assignedTo);
            const pinnedAssignee = selected || (initialAssignee?._id === values.assignedTo ? initialAssignee : null);
            return pinnedAssignee?.isActive !== false && pinnedAssignee && !found.some((employee) => employee._id === pinnedAssignee._id)
              ? [pinnedAssignee, ...found]
              : found;
          });
        }
      } catch (error) {
        if (active) setEmployeeLoadError(error.message);
      } finally {
        if (active) setIsEmployeeLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [employeeLoadAttempt, employeeQuery, initialAssignee, isDropdownOpen, loadEmployeeOptions, values.assignedTo]);

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!dropdownRef.current?.contains(event.target)) setIsDropdownOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isDropdownOpen]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function chooseEmployee(employee) {
    update("assignedTo", employee._id);
    setEmployeeQuery(employeeDisplayName(employee));
    setIsDropdownOpen(false);
    setActiveEmployeeIndex(-1);
  }

  function handleEmployeeKeyDown(event) {
    if (event.key === "Escape") {
      setIsDropdownOpen(false);
      setActiveEmployeeIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isDropdownOpen) setIsDropdownOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveEmployeeIndex((current) => {
        const next = current + direction;
        if (next < 0) return employeeOptions.length - 1;
        return next >= employeeOptions.length ? 0 : next;
      });
      return;
    }
    if (event.key === "Enter" && isDropdownOpen && employeeOptions[activeEmployeeIndex]) {
      event.preventDefault();
      chooseEmployee(employeeOptions[activeEmployeeIndex]);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    if (!values.title.trim() || !values.assignedTo || !values.dueDate) {
      setFormError("Add a task title, select an employee, and set a due date.");
      return;
    }
    if (new Date(values.dueDate) < new Date(values.startDate)) {
      setFormError("The due date cannot be before the start date.");
      return;
    }
    try {
      const submittedValues = { ...values };
      const originalAssigneeId = initialTask?.assignedTo?._id || initialTask?.assignedTo;
      if (originalAssigneeId && String(originalAssigneeId) === String(values.assignedTo)) {
        delete submittedValues.assignedTo;
      }
      await onSubmit(submittedValues);
    } catch (error) {
      setFormError(error.message);
    }
  }

  return (
    <form className="company-form" onSubmit={submit}>
      <div className="company-form-grid">
        <label className="company-field company-field-wide">
          Task title
          <input maxLength={120} onChange={(event) => update("title", event.target.value)} required value={values.title} />
        </label>
        <div className={`company-field employee-picker-field${isDropdownOpen ? " employee-picker-field-open" : ""}`} ref={dropdownRef}>
          <label htmlFor={`${employeeListId}-input`}>Assign to</label>
          <div className={`employee-picker${isDropdownOpen ? " employee-picker-open" : ""}`}>
            <input
              aria-activedescendant={activeEmployeeIndex >= 0 ? `${employeeListId}-option-${activeEmployeeIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls={employeeListId}
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
              autoComplete="off"
              id={`${employeeListId}-input`}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setEmployeeQuery(nextQuery);
                setActiveEmployeeIndex(-1);
                if (nextQuery !== employeeDisplayName(selectedEmployee)) update("assignedTo", "");
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onKeyDown={handleEmployeeKeyDown}
              placeholder="Search employees by name or email"
              role="combobox"
              value={employeeQuery}
            />
            <button
              aria-label={isDropdownOpen ? "Close employee list" : "Open employee list"}
              className="employee-picker-toggle"
              onClick={() => setIsDropdownOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true">{isDropdownOpen ? "⌃" : "⌄"}</span>
            </button>
            {isDropdownOpen && (
              <div className="employee-picker-menu" id={employeeListId} role="listbox" aria-label="Available employees">
                {isEmployeeLoading ? (
                  <div className="employee-picker-state"><span className="spinner" /> Loading employees...</div>
                ) : employeeLoadError ? (
                  <div className="employee-picker-state employee-picker-error" role="alert">
                    <span>{employeeLoadError}</span>
                    <button className="secondary-action" onClick={() => setEmployeeLoadAttempt((attempt) => attempt + 1)} type="button">Retry</button>
                  </div>
                ) : employeeOptions.length ? employeeOptions.map((employee, index) => {
                  const selected = employee._id === values.assignedTo;
                  return (
                    <button
                      aria-selected={selected}
                      className={`employee-picker-option${selected ? " employee-picker-option-selected" : ""}${index === activeEmployeeIndex ? " employee-picker-option-active" : ""}`}
                      id={`${employeeListId}-option-${index}`}
                      key={employee._id}
                      onClick={() => chooseEmployee(employee)}
                      onMouseEnter={() => setActiveEmployeeIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      <EmployeeAvatar className="employee-picker-avatar" email={employee.email} name={employeeDisplayName(employee)} />
                      <span className="employee-picker-copy">
                        <strong>{employeeDisplayName(employee)}</strong>
                        {employee.email && <small>{employee.email}</small>}
                      </span>
                      {selected && <span className="employee-picker-check" aria-hidden="true">✓</span>}
                    </button>
                  );
                }) : (
                  <div className="employee-picker-state">
                    {employeeQuery.trim() ? "No active employees match that search." : "No active employees available."}
                  </div>
                )}
              </div>
            )}
          </div>
          {selectedEmployee && (
            <span className="employee-picker-selected">
              Selected: {employeeDisplayName(selectedEmployee)}
              {selectedEmployee.isActive === false ? " · current assignee is inactive" : " · account ID linked"}
            </span>
          )}
        </div>
        <label className="company-field">
          Priority
          <select onChange={(event) => update("priority", event.target.value)} value={values.priority}>
            {["low", "medium", "high", "urgent"].map((priority) => (
              <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="company-field">
          Start date
          <input onChange={(event) => update("startDate", event.target.value)} type="date" value={values.startDate} />
        </label>
        <label className="company-field">
          Due date
          <input onChange={(event) => update("dueDate", event.target.value)} required type="date" value={values.dueDate} />
        </label>
        <label className="company-field company-field-wide">
          Description
          <textarea maxLength={1000} onChange={(event) => update("description", event.target.value)} rows={2} value={values.description} />
        </label>
        <label className="company-field company-field-wide">
          Instructions
          <textarea maxLength={5000} onChange={(event) => update("instructions", event.target.value)} rows={3} value={values.instructions} />
        </label>
      </div>
      {formError && <p className="company-error" role="alert">{formError}</p>}
      <button className="primary-button company-submit" disabled={isSaving || !values.assignedTo} type="submit">
        {isSaving ? "Saving task..." : initialTask ? "Save changes" : "Assign task"}
      </button>
    </form>
  );
}

function TaskCard({ task, isAdmin, onStart, onProgress, onSubmit, onReview, onReopen, onEdit, busy, onOpen }) {
  const [progressValue, setProgressValue] = useState(Number(task.progress) || 0);
  const latestSubmission = task.submissions?.[task.submissions.length - 1];
  const latestReview = task.reviews?.[task.reviews.length - 1];
  const overdue = task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !["approved", "rejected"].includes(task.workflowStatus);

  useEffect(() => {
    setProgressValue(Number(task.progress) || 0);
  }, [task.progress]);

  return (
    <article className="workflow-task-card">
      <div className="workflow-task-top">
        <div className="workflow-task-title-wrap">
          <button className="workflow-task-title" onClick={() => onOpen(task)} type="button">{task.title}</button>
          <div className="workflow-task-badges">
            <StatusBadge status={task.workflowStatus} />
            <span className={`priority-badge priority-${task.priority || "medium"}`}>{task.priority || "—"}</span>
            {overdue && <span className="overdue-badge">Overdue</span>}
          </div>
        </div>
        <span className="workflow-deadline">Due {formatDate(task.dueDate)}</span>
      </div>
      {task.description && <p className="workflow-task-description">{task.description}</p>}
      <div className="workflow-task-meta">
        {task.assignedTo && (
          <span className="task-assignee">
            {isAdmin && <EmployeeAvatar className="task-assignee-avatar" email={task.assignedTo.email} name={task.assignedTo.fullName} />}
            {isAdmin ? `${getDisplayName(task.assignedTo.fullName, task.assignedTo.email)} · ${task.assignedTo.email || ""}` : "Assigned to you"}
          </span>
        )}
        {task.createdBy?.fullName && <span>Created by {task.createdBy.fullName}</span>}
        {task.instructions && <span>Instructions included</span>}
      </div>
      {task.assignedTo && (
        <div className="task-progress">
          <div className="task-progress-label"><span>Work progress</span><strong>{Number(task.progress) || 0}%</strong></div>
          <div className="task-progress-track" role="progressbar" aria-label={`${task.title} work progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(task.progress) || 0}>
            <span style={{ width: `${Number(task.progress) || 0}%` }} />
          </div>
          {!isAdmin && task.workflowStatus === "in_progress" && (
            <div className="task-progress-control">
              <label>
                Update progress
                <input
                  aria-label={`Set progress for ${task.title}`}
                  max={99}
                  min={0}
                  onChange={(event) => setProgressValue(Number(event.target.value))}
                  type="range"
                  value={progressValue}
                />
              </label>
              <button
                className="secondary-action"
                disabled={busy || progressValue === (Number(task.progress) || 0)}
                onClick={() => onProgress(task, progressValue)}
                type="button"
              >
                Save {progressValue}%
              </button>
            </div>
          )}
        </div>
      )}
      {latestSubmission && (
        <div className="task-submission-preview">
          <strong>Latest submission · {formatDate(latestSubmission.submittedAt)}</strong>
          <p>{latestSubmission.notes}</p>
          {latestSubmission.link && (
            <a href={latestSubmission.link} target="_blank" rel="noreferrer">Open submitted link</a>
          )}
        </div>
      )}
      {latestReview?.feedback && (
        <div className={`task-feedback task-feedback-${latestReview.decision}`}>
          <strong>{statusLabels[latestReview.decision] || "Admin feedback"}</strong>
          <p>{latestReview.feedback}</p>
        </div>
      )}
      <div className="workflow-task-actions">
        {!isAdmin && task.workflowStatus === "assigned" && (
          <button className="primary-button small-action" disabled={busy} onClick={() => onStart(task)} type="button">Start work</button>
        )}
        {!isAdmin && ["in_progress", "revision_requested"].includes(task.workflowStatus) && (
          <button className="primary-button small-action" disabled={busy} onClick={() => onSubmit(task)} type="button">
            {task.workflowStatus === "revision_requested" ? "Resubmit work" : "Submit for review"}
          </button>
        )}
        {isAdmin && task.workflowStatus === "pending_review" && (
          <button className="primary-button small-action" disabled={busy} onClick={() => onReview(task)} type="button">Review submission</button>
        )}
        {isAdmin && !["approved", "rejected"].includes(task.workflowStatus) && (
          <button className="secondary-action" disabled={busy} onClick={() => onEdit(task)} type="button">Edit task</button>
        )}
        {isAdmin && task.workflowStatus === "rejected" && (
          <button className="secondary-action" disabled={busy} onClick={() => onReopen(task)} type="button">Reopen task</button>
        )}
      </div>
      {task.activity?.length > 0 && (
        <details className="task-history">
          <summary>Task history ({task.activity.length})</summary>
          <ol>
            {[...task.activity].reverse().map((entry) => (
              <li key={entry._id}>
                <span>{entry.action.replaceAll("_", " ")}</span>
                <small>{entry.actor?.fullName ? `${entry.actor.fullName} · ` : ""}{formatDate(entry.createdAt)}</small>
                {entry.details && <p>{entry.details}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

export default function CompanyWorkspace({
  user,
  csrfToken,
  apiRequest,
  onShowPersonalTasks,
}) {
  const isAdmin = user.role === "admin";
  const navigation = isAdmin ? adminNavigation : employeeNavigation;
  const [page, setPage] = useState("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [isCompactNavigation, setIsCompactNavigation] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const mobileMenuButtonRef = useRef(null);
  const [dashboard, setDashboard] = useState({});
  const [tasks, setTasks] = useState([]);
  const [taskPagination, setTaskPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [employees, setEmployees] = useState([]);
  const [employeePagination, setEmployeePagination] = useState({ page: 1, pages: 1, total: 0 });
  const [reports, setReports] = useState({ dailyCompletions: [], employeeSummaries: [] });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [listPage, setListPage] = useState(1);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePage, setEmployeePage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewTask, setReviewTask] = useState(null);
  const [reviewDecision, setReviewDecision] = useState("approved");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [submissionTask, setSubmissionTask] = useState(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionLink, setSubmissionLink] = useState("");
  const [detailTask, setDetailTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const hasOpenModal = Boolean(reviewTask || submissionTask || detailTask || editTask || assignmentOpen);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    function updateCompactNavigation() {
      setIsCompactNavigation(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileNavigationOpen(false);
    }
    updateCompactNavigation();
    mediaQuery.addEventListener("change", updateCompactNavigation);
    return () => mediaQuery.removeEventListener("change", updateCompactNavigation);
  }, []);

  function navigateToWorkspacePage(nextPage) {
    if (nextPage === "reviews") {
      setStatusFilter("pending_review");
      setPriorityFilter("");
      setSearch("");
      setListPage(1);
    } else if (page === "reviews" && nextPage === "tasks") {
      setStatusFilter("");
    }
    setPage(nextPage);
    closeMobileNavigation();
  }

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector("#workspace-navigation .workspace-nav-link")?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        closeMobileNavigation();
      }
    }
    function closeOnDesktopResize() {
      if (window.innerWidth > 900) setMobileNavigationOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktopResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktopResize);
    };
  }, [mobileNavigationOpen]);

  function closeMobileNavigation() {
    setMobileNavigationOpen(false);
    if (isCompactNavigation) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }

  function toggleMobileNavigation() {
    if (mobileNavigationOpen) closeMobileNavigation();
    else setMobileNavigationOpen(true);
  }

  const callApi = useCallback((path, options = {}) => apiRequest(path, options, csrfToken), [apiRequest, csrfToken]);
  const loadEmployeeOptions = useCallback(async (value) => {
    if (!isAdmin) return [];
    const params = new URLSearchParams({ limit: "50" });
    if (value.trim()) params.set("search", value.trim());
    const result = await callApi(`/api/workspace/employees/options?${params}`);
    return result.employees || [];
  }, [callApi, isAdmin]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(listPage), limit: "10", sort: sortBy });
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    return params.toString();
  }, [listPage, priorityFilter, search, sortBy, statusFilter]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { dashboard: stats, taskData, employeeData, reportData, notificationData } = await (async () => {
        const [statsResult, tasksResult, employeesResult, reportsResult, notificationsResult] = await Promise.all([
          callApi("/api/workspace/dashboard"),
          callApi(`/api/workspace/tasks?${query}`),
          isAdmin ? callApi(`/api/workspace/employees?page=${employeePage}&limit=10&search=${encodeURIComponent(employeeSearch)}`) : Promise.resolve(null),
          isAdmin ? callApi("/api/workspace/reports") : Promise.resolve(null),
          callApi("/api/workspace/notifications?page=1&limit=20"),
        ]);
        return {
          dashboard: statsResult,
          taskData: tasksResult,
          employeeData: employeesResult,
          reportData: reportsResult,
          notificationData: notificationsResult,
        };
      })();
      setDashboard(stats);
      setTasks(taskData.tasks || []);
      setTaskPagination(taskData.pagination || { page: 1, pages: 1, total: 0 });
      if (employeeData) {
        setEmployees(employeeData.employees || []);
        setEmployeePagination(employeeData.pagination || { page: 1, pages: 1, total: 0 });
      }
      if (reportData) setReports(reportData);
      setNotifications(notificationData.notifications || []);
      setUnreadCount(notificationData.unread || 0);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [callApi, employeePage, employeeSearch, isAdmin, query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasOpenModal) return undefined;
    const previousFocus = document.activeElement;
    document.querySelector(".workspace-modal input, .workspace-modal select, .workspace-modal textarea, .workspace-modal button")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        setReviewTask(null);
        setSubmissionTask(null);
        setDetailTask(null);
        setEditTask(null);
        setAssignmentOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [busy, hasOpenModal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      callApi("/api/workspace/notifications?page=1&limit=20")
        .then((result) => {
          setNotifications(result.notifications || []);
          setUnreadCount(result.unread || 0);
        })
        .catch((requestError) => setError(requestError.message));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [callApi]);

  async function performAction(action, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      setReviewTask(null);
      setSubmissionTask(null);
      setEditTask(null);
      setAssignmentOpen(false);
      await refresh();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startTask(task) {
    await performAction(
      () => callApi(`/api/workspace/tasks/${task._id}/start`, { method: "POST", body: "{}" }),
      "Work started. You can submit it when it is ready.",
    );
  }

  async function updateProgress(task, progress) {
    await performAction(
      () => callApi(`/api/workspace/tasks/${task._id}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progress }),
      }),
      `Progress updated to ${progress}%.`,
    );
  }

  async function setEmployeeActive(employee) {
    const isActive = employee.isActive === false;
    if (!isActive && !window.confirm(`Deactivate ${employee.fullName}'s account? They will lose access until reactivated.`)) {
      return;
    }
    await performAction(
      () => callApi(`/api/workspace/employees/${employee._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
      `${employee.fullName}'s account is now ${isActive ? "active" : "inactive"}.`,
    );
  }

  async function submitTask(event) {
    event.preventDefault();
    if (!submissionTask) return;
    const succeeded = await performAction(
      () => callApi(`/api/workspace/tasks/${submissionTask._id}/submit`, {
        method: "POST",
        body: JSON.stringify({ notes: submissionNotes, link: submissionLink }),
      }),
      "Your work was submitted for review.",
    );
    if (succeeded) {
      setSubmissionNotes("");
      setSubmissionLink("");
    }
  }

  async function reviewTaskSubmit(event) {
    event.preventDefault();
    if (!reviewTask) return;
    const succeeded = await performAction(
      () => callApi(`/api/workspace/tasks/${reviewTask._id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: reviewDecision, feedback: reviewFeedback }),
      }),
      reviewDecision === "approved" ? "Submission approved." : "Review decision sent to the employee.",
    );
    if (succeeded) setReviewFeedback("");
  }

  async function reopenTask(task) {
    const feedback = window.prompt("Explain why this rejected task is being reopened (at least 10 characters).");
    if (!feedback) return;
    await performAction(
      () => callApi(`/api/workspace/tasks/${task._id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ feedback }),
      }),
      "Task reopened and returned to the employee.",
    );
  }

  async function markNotificationRead(notification) {
    if (notification.readAt) return;
    await performAction(
      () => callApi(`/api/workspace/notifications/${notification._id}/read`, { method: "PATCH", body: "{}" }),
      "Notification marked as read.",
    );
  }

  async function saveAssignment(values) {
    const succeeded = await performAction(
      () => callApi(
        editTask ? `/api/workspace/tasks/${editTask._id}` : "/api/workspace/tasks",
        { method: editTask ? "PATCH" : "POST", body: JSON.stringify(values) },
      ),
      editTask ? "Task details updated." : "Task assigned.",
    );
    if (!succeeded) throw new Error("The task could not be saved. Review the error message above.");
  }

  const activeTasks = tasks.filter((task) => !["approved", "rejected"].includes(task.workflowStatus));
  const pendingReviewTasks = tasks.filter((task) => task.workflowStatus === "pending_review");
  const navTitle = navigation.find(([id]) => id === page)?.[1] || "Overview";

  function renderTaskCards(items, emptyTitle, emptyText) {
    if (isLoading) return <div className="company-empty"><span className="spinner" /> Loading tasks...</div>;
    if (!items.length) return <div className="company-empty"><strong>{emptyTitle}</strong><p>{emptyText}</p></div>;
    return (
      <div className="workflow-task-list">
        {items.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            isAdmin={isAdmin}
            onStart={startTask}
            onProgress={updateProgress}
            onSubmit={(item) => {
              setSubmissionTask(item);
              setSubmissionNotes("");
              setSubmissionLink("");
            }}
            onReview={(item) => {
              setReviewTask(item);
              setReviewDecision("approved");
              setReviewFeedback("");
            }}
            onReopen={reopenTask}
            onEdit={setEditTask}
            onOpen={setDetailTask}
            busy={busy}
          />
        ))}
      </div>
    );
  }

  function renderOverview() {
    const completionRate = dashboard.totalTasks
      ? Math.round((dashboard.approved / dashboard.totalTasks) * 100)
      : 0;
    const completionsByDay = new Map(
      (dashboard.dailyCompletions || []).map((day) => [day._id, day.completed]),
    );
    const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, date, completed: completionsByDay.get(key) || 0 };
    });
    const activityPeak = Math.max(1, ...weeklyActivity.map((day) => day.completed));
    const statItems = isAdmin
      ? [
          ["Employees", dashboard.totalEmployees, "purple"],
          ["Total tasks", dashboard.totalTasks, "blue"],
          ["Due today", dashboard.dueToday, "amber"],
          ["In progress", dashboard.inProgress, "purple"],
          ["Pending review", dashboard.pendingReviews, "blue"],
          ["Approved", dashboard.approved, "green"],
          ["Rejected", dashboard.rejected, "red"],
          ["Overdue", dashboard.overdue, "red"],
        ]
      : [
          ["Assigned", dashboard.totalTasks, "purple"],
          ["Pending", dashboard.assigned, "amber"],
          ["In progress", dashboard.inProgress, "blue"],
          ["Submitted for review", dashboard.pendingReviews, "blue"],
          ["Revision requested", dashboard.revisionRequested, "red"],
          ["Approved", dashboard.approved, "green"],
          ["Rejected", dashboard.rejected, "red"],
          ["Overdue", dashboard.overdue, "red"],
        ];
    return (
      <>
        <section className="company-stats-grid" aria-label="Workspace overview">
          {statItems.map(([label, value, tone]) => <SummaryCard key={label} label={label} value={value} tone={tone} />)}
        </section>
        <section className="company-analytics-grid" aria-label="Productivity analytics">
          <article className="company-panel analytics-panel">
            <div className="company-panel-heading">
              <div><span className="company-kicker">LAST 7 DAYS · UTC</span><h2>Weekly activity</h2></div>
              <span className="analytics-total">{weeklyActivity.reduce((sum, day) => sum + day.completed, 0)} approved</span>
            </div>
            <div className="activity-chart" role="img" aria-label="Approved tasks by day in the last seven days">
              {weeklyActivity.map((day) => (
                <div className="activity-chart-day" key={day.key}>
                  <strong>{day.completed || ""}</strong>
                  <div className="activity-chart-track">
                    <span style={{ height: `${day.completed ? Math.max(8, (day.completed / activityPeak) * 100) : 0}%` }} />
                  </div>
                  <time>{day.date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</time>
                </div>
              ))}
            </div>
            {!weeklyActivity.some((day) => day.completed > 0) && (
              <p className="analytics-empty">No approvals recorded during this period yet.</p>
            )}
          </article>
          <article className="company-panel completion-panel">
            <div className="company-panel-heading">
              <div><span className="company-kicker">OVERALL PROGRESS</span><h2>Task completion</h2></div>
              <strong className="completion-rate">{completionRate}%</strong>
            </div>
            <div className="completion-track" role="progressbar" aria-label="Approved task completion rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionRate}>
              <span style={{ width: `${completionRate}%` }} />
            </div>
            <div className="completion-legend">
              <span><i className="completion-dot completion-dot-approved" />{dashboard.approved || 0} approved</span>
              <span><i className="completion-dot completion-dot-open" />{Math.max((dashboard.totalTasks || 0) - (dashboard.approved || 0), 0)} remaining</span>
            </div>
            <p className="completion-caption">{dashboard.totalTasks || 0} assigned workflow tasks in this workspace</p>
          </article>
        </section>
        <div className="company-content-grid">
          <section className="company-panel">
            <div className="company-panel-heading">
              <div><span className="company-kicker">{isAdmin ? "NEEDS YOUR ATTENTION" : "YOUR WORK QUEUE"}</span><h2>{isAdmin ? "Pending reviews" : "Active tasks"}</h2></div>
              <button className="secondary-action" onClick={() => setPage(isAdmin ? "reviews" : "tasks")} type="button">View all</button>
            </div>
            {renderTaskCards(isAdmin ? pendingReviewTasks : activeTasks.slice(0, 4), isAdmin ? "All caught up" : "No active tasks", isAdmin ? "New employee submissions will appear here." : "Tasks assigned to you will appear here.")}
          </section>
          <section className="company-panel company-notification-panel">
            <div className="company-panel-heading">
              <div><span className="company-kicker">LATEST UPDATES</span><h2>Notifications</h2></div>
              <button className="secondary-action" onClick={() => setPage("notifications")} type="button">See all</button>
            </div>
            {notifications.slice(0, 5).map((notification) => (
              <button
                className={`notification-row${notification.readAt ? "" : " notification-unread"}`}
                key={notification._id}
                onClick={() => markNotificationRead(notification)}
                type="button"
              >
                <span className="notification-dot" />
                <span><strong>{notification.message}</strong><small>{formatDate(notification.createdAt)}</small></span>
              </button>
            ))}
            {!notifications.length && <div className="company-empty compact"><p>No notifications yet.</p></div>}
          </section>
        </div>
      </>
    );
  }

  function renderTasksPage() {
    const shownTasks = page === "reviews" ? tasks.filter((task) => task.workflowStatus === "pending_review") : tasks;
    return (
      <>
        <section className="company-panel">
          <div className="company-panel-heading">
            <div><span className="company-kicker">{page === "reviews" ? "SUBMISSIONS" : "WORK MANAGEMENT"}</span><h2>{page === "reviews" ? "Awaiting review" : isAdmin ? "All assigned tasks" : "Tasks assigned to me"}</h2></div>
            {isAdmin && <span className="table-total">{taskPagination.total} tasks</span>}
          </div>
          <div className="task-filter-bar">
            <label>
              Search
              <input onChange={(event) => { setSearch(event.target.value); setListPage(1); }} placeholder="Search task title or description" value={search} />
            </label>
            <label>
              Status
              <select onChange={(event) => { setStatusFilter(event.target.value); setListPage(1); }} value={statusFilter}>
                <option value="">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select onChange={(event) => { setPriorityFilter(event.target.value); setListPage(1); }} value={priorityFilter}>
                <option value="">All priorities</option>
                {["urgent", "high", "medium", "low"].map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
                <option value="createdAt">Newest</option>
                <option value="dueDate">Deadline</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>
          {renderTaskCards(shownTasks, page === "reviews" ? "No submissions to review" : "No tasks found", page === "reviews" ? "When employees submit work, reviews will appear here." : "Try changing the filters or assign a new task.")}
          {taskPagination.pages > 1 && (
            <div className="pagination">
              <button className="secondary-action" disabled={listPage <= 1} onClick={() => setListPage((current) => current - 1)} type="button">Previous</button>
              <span>Page {taskPagination.page} of {taskPagination.pages}</span>
              <button className="secondary-action" disabled={listPage >= taskPagination.pages} onClick={() => setListPage((current) => current + 1)} type="button">Next</button>
            </div>
          )}
        </section>
      </>
    );
  }

  function renderEmployees() {
    return (
      <section className="company-panel">
        <div className="company-panel-heading">
          <div><span className="company-kicker">PEOPLE DIRECTORY</span><h2>Employees</h2></div>
          <span className="table-total">{employeePagination.total} accounts</span>
        </div>
        <div className="task-filter-bar employee-search">
          <label>Search employees<input onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Name or email" value={employeeSearch} /></label>
        </div>
        {isLoading ? <div className="company-empty"><span className="spinner" /> Loading employees...</div> : (
          employees.length ? (
            <div className="employee-grid">
              {employees.map((employee) => (
                <article className="employee-card" key={employee._id}>
                  <EmployeeAvatar email={employee.email} name={employee.fullName} />
                  <div className="employee-card-heading">
                    <div className="employee-id"><strong>{getDisplayName(employee.fullName, employee.email)}</strong><span>{employee.email}</span><small>Joined {formatDate(employee.createdAt)}</small></div>
                    <span className={`employee-status${employee.isActive === false ? " employee-status-inactive" : ""}`}>{employee.isActive === false ? "Inactive" : "Active"}</span>
                  </div>
                  <div className="employee-metrics">
                    <span><strong>{employee.workload.total}</strong> tasks</span>
                    <span><strong>{employee.workload.inProgress}</strong> active</span>
                    <span><strong>{employee.workload.pendingReview}</strong> review</span>
                    <span><strong>{employee.workload.approved}</strong> approved</span>
                    <span className={employee.workload.overdue ? "metric-alert" : ""}><strong>{employee.workload.overdue}</strong> overdue</span>
                  </div>
                  <button
                    className="secondary-action employee-toggle"
                    disabled={busy}
                    onClick={() => setEmployeeActive(employee)}
                    type="button"
                  >
                    {employee.isActive === false ? "Reactivate account" : "Deactivate account"}
                  </button>
                </article>
              ))}
            </div>
          ) : <div className="company-empty"><strong>No employees found</strong><p>Public signups appear here as employee accounts.</p></div>
        )}
        {employeePagination.pages > 1 && (
          <div className="pagination">
            <button className="secondary-action" disabled={employeePage <= 1} onClick={() => setEmployeePage((current) => current - 1)} type="button">Previous</button>
            <span>Page {employeePagination.page} of {employeePagination.pages}</span>
            <button className="secondary-action" disabled={employeePage >= employeePagination.pages} onClick={() => setEmployeePage((current) => current + 1)} type="button">Next</button>
          </div>
        )}
      </section>
    );
  }

  function renderReports() {
    const max = Math.max(1, ...reports.dailyCompletions.map((day) => day.completed));
    return (
      <div className="company-content-grid reports-grid">
        <section className="company-panel">
          <div className="company-panel-heading"><div><span className="company-kicker">LAST 7 DAYS · UTC</span><h2>Approved tasks</h2></div></div>
          {reports.dailyCompletions.length ? (
            <div className="report-bars">
              {reports.dailyCompletions.map((day) => (
                <div className="report-bar-row" key={day._id}>
                  <time>{formatDate(day._id, { month: "short", day: "numeric" })}</time>
                  <div className="report-bar-track"><span style={{ width: `${Math.max(4, (day.completed / max) * 100)}%` }} /></div>
                  <strong>{day.completed}</strong>
                </div>
              ))}
            </div>
          ) : <div className="company-empty"><strong>No approved work in this period</strong><p>Only recorded approvals are shown here.</p></div>}
        </section>
        <section className="company-panel">
          <div className="company-panel-heading"><div><span className="company-kicker">ASSIGNEE SUMMARY</span><h2>Employee workload</h2></div></div>
          {reports.employeeSummaries.length ? (
            <div className="report-employee-list">
              {reports.employeeSummaries.map((employee) => (
                <div className="report-employee-row" key={employee.employeeId}>
                  <span><strong>{employee.fullName || "Former employee"}</strong><small>{employee.email || "Account unavailable"}</small></span>
                  <span>{employee.approved}/{employee.total} approved</span>
                  <span>{employee.pendingReview} in review</span>
                </div>
              ))}
            </div>
          ) : <div className="company-empty"><strong>No assigned work yet</strong><p>Employee summaries appear after tasks are assigned.</p></div>}
        </section>
      </div>
    );
  }

  function renderNotifications() {
    return (
      <section className="company-panel">
        <div className="company-panel-heading"><div><span className="company-kicker">UPDATES</span><h2>Notifications</h2></div><span className="table-total">{unreadCount} unread</span></div>
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((notification) => (
              <button
                className={`notification-row${notification.readAt ? "" : " notification-unread"}`}
                key={notification._id}
                onClick={() => markNotificationRead(notification)}
                type="button"
              >
                <span className="notification-dot" />
                <span><strong>{notification.title || notification.message}</strong><small>{notification.title ? `${notification.message} · ` : ""}{notification.task?.title ? `${notification.task.title} · ` : ""}{formatDate(notification.createdAt)}</small></span>
                {!notification.readAt && <span className="unread-label">Unread</span>}
              </button>
            ))}
          </div>
        ) : <div className="company-empty"><strong>You’re all caught up</strong><p>Task and review updates will appear here.</p></div>}
      </section>
    );
  }

  return (
    <main className={`company-workspace${isAdmin ? " company-admin" : " company-employee"}`}>
      {mobileNavigationOpen && (
        <button
          aria-label="Close navigation menu"
          className="workspace-drawer-backdrop"
          onClick={closeMobileNavigation}
          type="button"
        />
      )}
      <aside
        aria-hidden={isCompactNavigation && !mobileNavigationOpen}
        aria-label="Workspace navigation"
        className={`company-sidebar${mobileNavigationOpen ? " company-sidebar-open" : ""}`}
        id="workspace-navigation"
        inert={isCompactNavigation && !mobileNavigationOpen ? "" : undefined}
      >
        <button
          aria-label="Close navigation menu"
          className="workspace-drawer-close"
          onClick={closeMobileNavigation}
          type="button"
        >
          ×
        </button>
        <div className="workspace-identity">
          <EmployeeAvatar className="workspace-avatar" email={user.email} name={user.fullName} />
          <span><strong>{getDisplayName(user.fullName, user.email)}</strong><small>{isAdmin ? "Administrator" : "Employee workspace"}</small></span>
        </div>
        <nav className="workspace-navigation">
          {navigation.map(([id, label]) => (
            <button
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "workspace-nav-link active" : "workspace-nav-link"}
              key={id}
              onClick={() => navigateToWorkspacePage(id)}
              type="button"
            >
              <span className={`nav-symbol nav-${id}`} aria-hidden="true">{id === "overview" ? "◫" : id === "tasks" ? "▤" : id === "employees" ? "♙" : id === "reviews" ? "✓" : id === "reports" ? "↗" : "◌"}</span>
              {label}
              {id === "notifications" && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
            </button>
          ))}
          {!isAdmin && onShowPersonalTasks && (
            <button className="workspace-nav-link" onClick={() => {
              closeMobileNavigation();
              onShowPersonalTasks();
            }} type="button">
              <span className="nav-symbol" aria-hidden="true">＋</span>Personal tasks
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="workspace-secure-tag">Secure company workspace</span>
        </div>
      </aside>

      <section className="workspace-main-content">
        <div className="workspace-mobile-top">
          <button
            aria-controls="workspace-navigation"
            aria-expanded={mobileNavigationOpen}
            aria-label={mobileNavigationOpen ? "Close workspace navigation" : "Open workspace navigation"}
            className="workspace-hamburger"
            onClick={toggleMobileNavigation}
            ref={mobileMenuButtonRef}
            type="button"
          >
            <span aria-hidden="true">{mobileNavigationOpen ? "×" : "☰"}</span>
            <span className="workspace-hamburger-label">Menu</span>
          </button>
          <span className="workspace-mobile-page">{navTitle}</span>
          {isAdmin && page === "tasks" && (
            <button className="primary-button mobile-assignment-button" onClick={() => setAssignmentOpen(true)} type="button">＋ Assign</button>
          )}
          <button className="secondary-action" onClick={refresh} type="button">Refresh</button>
        </div>
        <header className="workspace-page-header">
          <div><span className="company-kicker">{isAdmin ? "MINITASK PRO · ADMIN" : "MINITASK PRO · EMPLOYEE"}</span><h1>{navTitle}</h1><p>{isAdmin ? "Manage assignments, reviews, and team activity." : `Welcome back, ${getDisplayName(user.fullName, user.email).split(" ")[0]}. Here’s your work at a glance.`}</p></div>
          <div className="workspace-header-actions">
            {isAdmin && page === "tasks" && <button className="primary-button small-action desktop-assignment-button" onClick={() => setAssignmentOpen(true)} type="button">＋ Assign task</button>}
            <button className="secondary-action desktop-refresh-button" onClick={refresh} type="button">Refresh data</button>
          </div>
        </header>
        {error && <div className="company-alert" role="alert"><span>{error}</span><button onClick={refresh} type="button">Retry</button></div>}
        {notice && <div className="company-notice" role="status">{notice}</div>}
        {isLoading && page === "overview" && !Object.keys(dashboard).length ? (
          <div className="company-empty"><span className="spinner" /> Loading your workspace...</div>
        ) : (
          <>
            {page === "overview" && renderOverview()}
            {(page === "tasks" || page === "reviews") && renderTasksPage()}
            {page === "employees" && renderEmployees()}
            {page === "reports" && renderReports()}
            {page === "notifications" && renderNotifications()}
          </>
        )}
      </section>

      {hasOpenModal && (
        <div className="workspace-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) {
            setReviewTask(null);
            setSubmissionTask(null);
            setDetailTask(null);
            setEditTask(null);
            setAssignmentOpen(false);
          }
        }}>
          {reviewTask && (
            <section aria-labelledby="review-modal-title" aria-modal="true" className="workspace-modal" role="dialog">
              <div className="modal-heading"><div><span className="company-kicker">REVIEW SUBMISSION</span><h2 id="review-modal-title">{reviewTask.title}</h2></div><button aria-label="Close dialog" className="modal-close" onClick={() => setReviewTask(null)} type="button">×</button></div>
              <p className="modal-submission-notes">{reviewTask.submissions?.at(-1)?.notes || "No completion notes were provided."}</p>
              {reviewTask.submissions?.at(-1)?.link && <a className="modal-link" href={reviewTask.submissions.at(-1).link} rel="noreferrer" target="_blank">Open employee link</a>}
              <form className="company-form" onSubmit={reviewTaskSubmit}>
                <label className="company-field">Decision
                  <select onChange={(event) => setReviewDecision(event.target.value)} value={reviewDecision}>
                    <option value="approved">Approve</option>
                    <option value="revision_requested">Request revision</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label className="company-field">Feedback {reviewDecision !== "approved" && <span>(required, at least 10 characters)</span>}
                  <textarea maxLength={3000} onChange={(event) => setReviewFeedback(event.target.value)} required={reviewDecision !== "approved"} rows={4} value={reviewFeedback} />
                </label>
                <button className="primary-button company-submit" disabled={busy} type="submit">{busy ? "Saving review..." : "Confirm decision"}</button>
              </form>
            </section>
          )}
          {submissionTask && (
            <section aria-labelledby="submission-modal-title" aria-modal="true" className="workspace-modal" role="dialog">
              <div className="modal-heading"><div><span className="company-kicker">TASK SUBMISSION</span><h2 id="submission-modal-title">{submissionTask.title}</h2></div><button aria-label="Close dialog" className="modal-close" onClick={() => setSubmissionTask(null)} type="button">×</button></div>
              <form className="company-form" onSubmit={submitTask}>
                <label className="company-field">Completion notes <span>(required)</span>
                  <textarea maxLength={5000} minLength={1} onChange={(event) => setSubmissionNotes(event.target.value)} required rows={5} value={submissionNotes} />
                </label>
                <label className="company-field">Work link <span>(optional, HTTP/HTTPS)</span>
                  <input maxLength={2000} onChange={(event) => setSubmissionLink(event.target.value)} placeholder="https://" type="url" value={submissionLink} />
                </label>
                <button className="primary-button company-submit" disabled={busy} type="submit">{busy ? "Submitting..." : "Submit for review"}</button>
              </form>
            </section>
          )}
          {detailTask && (
            <section aria-labelledby="task-detail-title" aria-modal="true" className="workspace-modal" role="dialog">
              <div className="modal-heading"><div><span className="company-kicker">TASK DETAILS</span><h2 id="task-detail-title">{detailTask.title}</h2></div><button aria-label="Close dialog" className="modal-close" onClick={() => setDetailTask(null)} type="button">×</button></div>
              <div className="task-detail-meta"><StatusBadge status={detailTask.workflowStatus} /><span className={`priority-badge priority-${detailTask.priority}`}>{detailTask.priority}</span><span>Due {formatDate(detailTask.dueDate)}</span></div>
              <h3>Description</h3><p className="modal-submission-notes">{detailTask.description || "No description provided."}</p>
              <h3>Instructions</h3><p className="modal-submission-notes">{detailTask.instructions || "No additional instructions."}</p>
              <h3>Submission and review history</h3>
              {[...(detailTask.submissions || [])].reverse().map((submission) => (
                <div className="history-card" key={submission._id}><strong>Submitted · {formatDate(submission.submittedAt)}</strong><p>{submission.notes}</p>{submission.link && <a href={submission.link} rel="noreferrer" target="_blank">Open link</a>}</div>
              ))}
              {[...(detailTask.reviews || [])].reverse().map((review) => (
                <div className="history-card" key={review._id}><strong>{statusLabels[review.decision]} · {formatDate(review.reviewedAt)}</strong><p>{review.feedback || "No written feedback."}</p></div>
              ))}
              {!(detailTask.submissions?.length || detailTask.reviews?.length) && <p className="company-help">No submissions or reviews yet.</p>}
            </section>
          )}
          {(editTask || assignmentOpen) && isAdmin && (
            <section aria-labelledby="assignment-modal-title" aria-modal="true" className="workspace-modal workspace-modal-wide" role="dialog">
              <div className="modal-heading"><div><span className="company-kicker">{editTask ? "UPDATE TASK" : "NEW WORK ITEM"}</span><h2 id="assignment-modal-title">{editTask ? "Edit assignment" : "Assign a task"}</h2></div><button aria-label="Close dialog" className="modal-close" onClick={() => { setEditTask(null); setAssignmentOpen(false); }} type="button">×</button></div>
              <TaskAssignmentForm
                initialTask={editTask}
                loadEmployeeOptions={loadEmployeeOptions}
                onSubmit={saveAssignment}
                isSaving={busy}
              />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
