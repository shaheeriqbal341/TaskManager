import { useMemo, useState } from "react";
import TaskForm from "./TaskForm.jsx";
import TaskList from "./TaskList.jsx";

const filters = [
  { id: "all", label: "All tasks" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
];

export default function PersonalTasks({
  tasks,
  isLoading,
  isSaving,
  busyId,
  pageError,
  notice,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  onRetry,
}) {
  const [filter, setFilter] = useState("all");
  const counts = useMemo(() => {
    const completed = tasks.filter((task) => task.completed).length;
    const total = tasks.length;
    return {
      total,
      completed,
      pending: total - completed,
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }, [tasks]);

  return (
    <>
      <main>
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
            <h1>Make today <span>count.</span></h1>
            <p className="welcome-copy">Personal tasks remain private to your employee account.</p>
          </div>
          <div className="date-chip">
            <span className="date-icon" aria-hidden="true">▦</span>
            <span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
          </div>
        </section>

        <section className="stats-grid" aria-label="Personal task progress">
          <div className="stat-card stat-total">
            <span className="stat-icon" aria-hidden="true">▤</span>
            <div><span className="stat-label">Total tasks</span><strong>{counts.total}</strong></div>
          </div>
          <div className="stat-card stat-done">
            <span className="stat-icon" aria-hidden="true">✓</span>
            <div><span className="stat-label">Completed</span><strong>{counts.completed}</strong></div>
          </div>
          <div className="stat-card stat-pending">
            <span className="stat-icon" aria-hidden="true">◷</span>
            <div><span className="stat-label">Pending</span><strong>{counts.pending}</strong></div>
          </div>
          <div className="stat-card stat-rate">
            <span className="stat-icon" aria-hidden="true">↗</span>
            <div><span className="stat-label">Completion rate</span><strong>{counts.completionRate}%</strong></div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Personal task completion rate"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={counts.completionRate}
            >
              <span style={{ width: `${counts.completionRate}%` }} />
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <aside className="form-panel">
            <TaskForm onAdd={onAdd} isSaving={isSaving} />
            <div className="nudge-card">
              <span className="nudge-star" aria-hidden="true">✳</span>
              <p><strong>Small steps, big wins.</strong><br />Focus on one task at a time. You’ve got this.</p>
            </div>
          </aside>
          <section className="tasks-panel" aria-labelledby="personal-tasks-heading">
            <div className="tasks-header">
              <div>
                <span className="eyebrow">PRIVATE TO YOU</span>
                <h2 id="personal-tasks-heading">Personal tasks <span className="task-count">{counts.total}</span></h2>
              </div>
              <div className="filters" role="tablist" aria-label="Filter personal tasks">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    className={filter === item.id ? "filter-button active" : "filter-button"}
                    onClick={() => setFilter(item.id)}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {pageError && (
              <div className="page-error" role="alert">
                <span>{pageError}</span>
                <button type="button" onClick={onRetry}>Try again</button>
              </div>
            )}
            {notice && <div className="page-success" role="status">{notice}</div>}
            {isLoading ? (
              <div className="loading-state"><span className="spinner" /> Loading your tasks...</div>
            ) : (
              <TaskList
                tasks={tasks}
                filter={filter}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onDelete={onDelete}
                busyId={busyId}
              />
            )}
          </section>
        </section>
      </main>
      <footer>Made for your momentum <span aria-hidden="true">✦</span></footer>
    </>
  );
}
