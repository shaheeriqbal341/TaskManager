import TaskItem from "./TaskItem.jsx";

export default function TaskList({ tasks, filter, onToggle, onUpdate, onDelete, busyId }) {
  const visibleTasks = tasks.filter((task) => {
    if (filter === "pending") return !task.completed;
    if (filter === "completed") return task.completed;
    return true;
  });

  if (!visibleTasks.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">{filter === "completed" ? "✓" : "✦"}</div>
        <h3>{filter === "all" ? "Your space is clear" : `No ${filter} tasks`}</h3>
        <p>{filter === "all" ? "Add a task above and make today count." : "Try another filter or add a new task."}</p>
      </div>
    );
  }

  return (
    <div className="task-list">
      {visibleTasks.map((task) => (
        <TaskItem
          key={task._id}
          task={task}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onDelete={onDelete}
          busy={busyId === task._id}
        />
      ))}
    </div>
  );
}
