import { useState } from "react";

export default function TaskItem({ task, onToggle, onUpdate, onDelete, busy }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const safeTitle = typeof task?.title === "string" && task.title.trim() ? task.title : "Untitled task";
  const safeDescription = typeof task?.description === "string" ? task.description.trim() : "";
  const createdAt = task?.createdAt ? new Date(task.createdAt) : null;
  const hasValidDate = createdAt instanceof Date && !Number.isNaN(createdAt.getTime());

  async function saveTask(event) {
    event.preventDefault();
    const updated = await onUpdate(task, {
      title: title.trim(),
      description: description.trim(),
    });
    if (updated) setIsEditing(false);
  }

  return (
    <article className={`task-item${task?.completed ? " is-complete" : ""}`}>
      <button
        className="check-button"
        type="button"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={task?.completed ? `Mark ${safeTitle} as pending` : `Mark ${safeTitle} as completed`}
        aria-pressed={task?.completed}
      >
        {task?.completed && <span aria-hidden="true">✓</span>}
      </button>
      {isEditing ? (
        <form className="task-edit-form" onSubmit={saveTask}>
          <label>
            <span>Task title</span>
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </label>
          <div className="edit-actions">
            <button className="primary-button" disabled={busy} type="submit">Save</button>
            <button
              className="cancel-edit-button"
              disabled={busy}
              onClick={() => {
                setTitle(task?.title || "");
                setDescription(task?.description || "");
                setIsEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="task-copy">
          <h3>{safeTitle}</h3>
          {safeDescription && <p>{safeDescription}</p>}
          <span className="task-date">
            {hasValidDate
              ? createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "No date"}
          </span>
        </div>
      )}
      <span className={`status-pill${task?.completed ? " complete" : ""}`}>
        {task?.completed ? "Completed" : "In progress"}
      </span>
      {!isEditing && (
        <button
          className="edit-button"
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={busy}
          aria-label={`Edit ${safeTitle}`}
          title="Edit task"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" />
          </svg>
        </button>
      )}
      <button
        className="delete-button"
        type="button"
        onClick={() => onDelete(task)}
        disabled={busy}
        aria-label={`Delete ${safeTitle}`}
        title="Delete task"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" />
        </svg>
      </button>
    </article>
  );
}
