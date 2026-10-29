const Task = require("../models/Task");
const Notification = require("../models/Notification");
const User = require("../models/User");

const REMINDER_LEAD_TIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_STATUSES = ["assigned", "in_progress", "revision_requested"];

let schedulerTimer = null;
let checkInProgress = false;

async function checkUpcomingDeadlines(now = new Date()) {
  if (checkInProgress) return 0;
  checkInProgress = true;
  let remindersCreated = 0;

  try {
    const reminderCutoff = new Date(now.getTime() + REMINDER_LEAD_TIME_MS);
    const candidates = Task.find({
      assignedTo: { $exists: true, $ne: null },
      createdBy: { $exists: true, $ne: null },
      dueDate: { $gt: now, $lte: reminderCutoff },
      workflowStatus: { $in: REMINDER_STATUSES },
      completed: { $ne: true },
    })
      .select("_id title assignedTo dueDate")
      .lean()
      .cursor();

    for await (const candidate of candidates) {
      const currentTask = await Task.findOne({
        _id: candidate._id,
        assignedTo: candidate.assignedTo,
        createdBy: { $exists: true, $ne: null },
        dueDate: { $gt: now, $lte: reminderCutoff },
        workflowStatus: { $in: REMINDER_STATUSES },
        completed: { $ne: true },
      })
        .select("_id title assignedTo dueDate")
        .lean();
      if (!currentTask) continue;
      const activeAssignee = await User.exists({
        _id: currentTask.assignedTo,
        isActive: { $ne: false },
        $or: [{ role: "employee" }, { role: { $exists: false } }],
      });
      if (!activeAssignee) continue;

      const filter = {
        task: currentTask._id,
        recipient: currentTask.assignedTo,
        type: "task_deadline_reminder",
        deadlineAt: currentTask.dueDate,
      };
      const hoursRemaining = Math.max(
        1,
        Math.ceil((currentTask.dueDate.getTime() - now.getTime()) / (60 * 60 * 1000)),
      );
      const timeUntilDue =
        hoursRemaining >= 24
          ? "about 1 day"
          : `about ${hoursRemaining} ${hoursRemaining === 1 ? "hour" : "hours"}`;
      let inserted = false;
      try {
        const result = await Notification.updateOne(
          filter,
          {
            $setOnInsert: {
              ...filter,
              title: "Task Deadline Reminder",
              message: `Your task "${currentTask.title}" is due in ${timeUntilDue}. Please complete it before the deadline.`,
            },
          },
          { upsert: true },
        );
        inserted = Boolean(result.upsertedCount);
        if (inserted) remindersCreated += 1;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }

      const [stillAssigned, stillActive] = await Promise.all([
        Task.exists({
          _id: currentTask._id,
          assignedTo: currentTask.assignedTo,
          dueDate: currentTask.dueDate,
          workflowStatus: { $in: REMINDER_STATUSES },
          completed: { $ne: true },
        }),
        User.exists({
          _id: currentTask.assignedTo,
          isActive: { $ne: false },
          $or: [{ role: "employee" }, { role: { $exists: false } }],
        }),
      ]);
      if (inserted && (!stillAssigned || !stillActive)) {
        await Notification.deleteOne(filter);
      }
    }

    return remindersCreated;
  } finally {
    checkInProgress = false;
  }
}

function startDeadlineReminderScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (schedulerTimer) return schedulerTimer;
  if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
    throw new RangeError("Deadline reminder interval must be at least one second.");
  }

  const runCheck = async () => {
    try {
      const created = await checkUpcomingDeadlines();
      if (created) console.info(`Created ${created} task deadline reminder(s).`);
    } catch (error) {
      console.error(`Task deadline reminder check failed: ${error.message}`);
    }
  };

  void runCheck();
  schedulerTimer = setInterval(runCheck, intervalMs);
  schedulerTimer.unref?.();
  return schedulerTimer;
}

function stopDeadlineReminderScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  checkUpcomingDeadlines,
  startDeadlineReminderScheduler,
  stopDeadlineReminderScheduler,
};
