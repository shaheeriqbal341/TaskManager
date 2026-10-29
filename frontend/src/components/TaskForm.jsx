import { useState } from "react";

export default function TaskForm({ onAdd, isSaving }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("A task title is required.");
      return;
    }
    if (cleanTitle.length > 120) {
      setError("Keep the title to 120 characters or fewer.");
      return;
    }
    if (description.trim().length > 1000) {
      setError("Keep the description to 1,000 characters or fewer.");
      return;
    }

    setError("");
    try {
      await onAdd({ title: cleanTitle, description: description.trim() });
      setTitle("");
      setDescription("");
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <div className="form-heading">
        <div>
          <span className="eyebrow">MAKE IT HAPPEN</span>
          <h2>Add a task</h2>
        </div>
        <span className="sparkle" aria-hidden="true">✦</span>
      </div>
      <label htmlFor="task-title">Task title</label>
      <input
        id="task-title"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs to get done?"
        maxLength={120}
        required
      />
      <label htmlFor="task-description">Description <span>(optional)</span></label>
      <textarea
        id="task-description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Add a few details..."
        rows={3}
        maxLength={1000}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button add-button" type="submit" disabled={isSaving}>
        {isSaving ? <><span className="button-spinner" /> Adding task...</> : <><span aria-hidden="true">＋</span> Add task</>}
      </button>
    </form>
  );
}
