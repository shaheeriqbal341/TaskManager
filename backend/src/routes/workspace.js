const express = require("express");
const mongoose = require("mongoose");
const Task = require("../models/Task");
const TaskActivity = require("../models/TaskActivity");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();
const priorities = ["low", "medium", "high", "urgent"];
const statuses = ["assigned", "in_progress", "pending_review", "revision_requested", "approved", "rejected"];
const companyTask = { assignedTo: { $exists: true }, createdBy: { $exists: true } };
const employeeFilter = { $or: [{ role: "employee" }, { role: { $exists: false } }] };
const activeEmployeeFilter = {
  $and: [
    employeeFilter,
    { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
  ],
};

router.use(authenticate);
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

function pageOptions(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function dateValue(value, endOfDay = false) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function isValidHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

async function notifyUsers(recipients, task, type, message) {
  const uniqueIds = [...new Set(recipients.map((recipient) => String(recipient)).filter(Boolean))];
  if (!uniqueIds.length) return;
  await Notification.insertMany(
    uniqueIds.map((recipient) => ({ recipient, task: task._id, type, message })),
  );
}

function addActivity(task, actor, action, details = "") {
  return TaskActivity.create({ task: task._id, actor: actor._id, action, details });
}

function safeSort(sort) {
  const sortFields = {
    createdAt: "createdAt",
    dueDate: "dueDate",
    priority: "priority",
    status: "workflowStatus",
    title: "title",
  };
  const field = sortFields[sort] || "createdAt";
  return { [field]: sort === "title" ? 1 : -1, _id: -1 };
}

function statusMatch(value) {
  return statuses.includes(value) ? { workflowStatus: value } : {};
}

function taskSearch(value) {
  if (!value) return {};
  const escaped = value.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { $or: [{ title: new RegExp(escaped, "i") }, { description: new RegExp(escaped, "i") }] };
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const match = req.user.role === "admin"
      ? companyTask
      : { assignedTo: req.user._id };
    const today = new Date();
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const activitySince = new Date(dayStart);
    activitySince.setUTCDate(activitySince.getUTCDate() - 6);
    const [groups, dueToday, overdue, totalEmployees, dailyCompletions] = await Promise.all([
      Task.aggregate([
        { $match: match },
        { $group: { _id: "$workflowStatus", count: { $sum: 1 } } },
      ]),
      Task.countDocuments({ ...match, dueDate: { $gte: dayStart, $lt: dayEnd } }),
      Task.countDocuments({
        ...match,
        dueDate: { $lt: new Date() },
        workflowStatus: { $nin: ["approved", "rejected"] },
      }),
      req.user.role === "admin" ? User.countDocuments(employeeFilter) : Promise.resolve(0),
      Task.aggregate([
        { $match: { ...match, approvedAt: { $gte: activitySince } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$approvedAt", timezone: "UTC" } },
            completed: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const counts = Object.fromEntries(groups.map(({ _id, count }) => [_id || "legacy", count]));
    const totalTasks = groups.reduce((total, entry) => total + entry.count, 0);
    res.json({
      role: req.user.role,
      totalEmployees,
      totalTasks,
      dueToday,
      inProgress: counts.in_progress || 0,
      pendingReviews: counts.pending_review || 0,
      approved: counts.approved || 0,
      rejected: counts.rejected || 0,
      revisionRequested: counts.revision_requested || 0,
      assigned: counts.assigned || 0,
      overdue,
      dailyCompletions,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/employees", requireRole("admin"), async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const query = { ...employeeFilter };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$and = [
        employeeFilter,
        { $or: [{ fullName: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }] },
      ];
      delete query.$or;
    }

    const [employees, total] = await Promise.all([
      User.find(query).select("fullName email role isActive createdAt").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);
    const ids = employees.map((employee) => employee._id);
    const workloads = ids.length
      ? await Task.aggregate([
          { $match: { assignedTo: { $in: ids }, ...companyTask } },
          {
            $group: {
              _id: "$assignedTo",
              total: { $sum: 1 },
              inProgress: { $sum: { $cond: [{ $eq: ["$workflowStatus", "in_progress"] }, 1, 0] } },
              pendingReview: { $sum: { $cond: [{ $eq: ["$workflowStatus", "pending_review"] }, 1, 0] } },
              approved: { $sum: { $cond: [{ $eq: ["$workflowStatus", "approved"] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $lt: ["$dueDate", new Date()] },
                        { $not: [{ $in: ["$workflowStatus", ["approved", "rejected"]] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];
    const workloadById = new Map(workloads.map((workload) => [String(workload._id), workload]));
    res.json({
      employees: employees.map((employee) => ({
        ...employee,
        workload: workloadById.get(String(employee._id)) || {
          total: 0,
          inProgress: 0,
          pendingReview: 0,
          approved: 0,
          overdue: 0,
        },
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/employees/:id", requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided employee ID is invalid." });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).length !== 1 || typeof body.isActive !== "boolean") {
      return res.status(400).json({ error: "Set the employee account to active or inactive." });
    }

    const employee = await User.findOne({ _id: req.params.id, ...employeeFilter });
    if (!employee) return res.status(404).json({ error: "Employee not found." });
    employee.isActive = body.isActive;
    await employee.save();
    res.json({
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/employees/options", requireRole("admin"), async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const query = { ...activeEmployeeFilter };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$and = [
        activeEmployeeFilter,
        { $or: [{ fullName: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }] },
      ];
    }
    const employees = await User.find(query)
      .select("fullName email")
      .sort({ fullName: 1 })
      .limit(50)
      .lean();
    res.json({
      employees: employees.map((employee) => ({
        ...employee,
        displayName: employee.fullName?.trim() || employee.email?.split("@")[0] || "Employee",
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks", async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const scope = req.user.role === "admin"
      ? { ...companyTask }
      : { assignedTo: req.user._id };
    const clauses = [scope];
    if (statuses.includes(req.query.status)) clauses.push(statusMatch(req.query.status));
    if (priorities.includes(req.query.priority)) clauses.push({ priority: req.query.priority });
    const search = taskSearch(typeof req.query.search === "string" ? req.query.search.trim() : "");
    if (Object.keys(search).length) clauses.push(search);
    const query = { $and: clauses };
    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "fullName email isActive")
        .populate("createdBy", "fullName email")
        .populate("submissions.submittedBy", "fullName role")
        .populate("reviews.reviewer", "fullName role")
        .sort(safeSort(req.query.sort))
        .skip(skip)
        .limit(limit),
      Task.countDocuments(query),
    ]);
    const activities = tasks.length
      ? await TaskActivity.find({ task: { $in: tasks.map((task) => task._id) } })
          .populate("actor", "fullName role")
          .sort({ createdAt: -1 })
      : [];
    const activityByTask = new Map();
    for (const activity of activities) {
      const taskId = String(activity.task);
      if (!activityByTask.has(taskId)) activityByTask.set(taskId, []);
      activityByTask.get(taskId).push(activity);
    }
    res.json({
      tasks: tasks.map((task) => ({
        ...task.toObject(),
        activity: activityByTask.get(String(task._id)) || [],
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks", requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const allowed = ["title", "description", "instructions", "assignedTo", "priority", "startDate", "dueDate"];
    if (Object.keys(body).some((key) => !allowed.includes(key))) {
      return res.status(400).json({ error: "Unsupported task fields were supplied." });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!title || title.length > 120) {
      return res.status(400).json({ error: "Enter a task title up to 120 characters." });
    }
    if (description.length > 1000 || instructions.length > 5000) {
      return res.status(400).json({ error: "Task description or instructions exceed the allowed length." });
    }
    if (!mongoose.isValidObjectId(body.assignedTo)) {
      return res.status(400).json({ error: "Select a valid employee for this task." });
    }
    if (!priorities.includes(body.priority)) {
      return res.status(400).json({ error: "Select a valid task priority." });
    }
    const employee = await User.findOne({
      _id: body.assignedTo,
      ...activeEmployeeFilter,
    }).select("fullName email");
    if (!employee) {
      return res.status(400).json({ error: "The selected employee does not exist." });
    }
    const startDate = dateValue(body.startDate) || new Date();
    const dueDate = dateValue(body.dueDate, true);
    if (body.startDate && !dateValue(body.startDate)) {
      return res.status(400).json({ error: "Enter a valid start date." });
    }
    if (!dueDate) return res.status(400).json({ error: "Enter a valid due date." });
    if (dueDate < startDate) {
      return res.status(400).json({ error: "The due date cannot be before the start date." });
    }

    const task = new Task({
      title,
      description,
      instructions,
      owner: employee._id,
      assignedTo: employee._id,
      createdBy: req.user._id,
      priority: body.priority,
      startDate,
      dueDate,
      workflowStatus: "assigned",
      completed: false,
    });
    await task.save();
    await addActivity(task, req.user, "assigned", `Assigned to ${employee.fullName}`);
    await notifyUsers([employee._id], task, "task_assigned", `A new task was assigned: ${task.title}`);
    res.status(201).json({ task: await task.populate("assignedTo", "fullName email isActive") });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:id", requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const allowed = ["title", "description", "instructions", "assignedTo", "priority", "startDate", "dueDate"];
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.includes(key))) {
      return res.status(400).json({ error: "Unsupported task fields were supplied." });
    }

    const task = await Task.findOne({ _id: req.params.id, ...companyTask });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (["approved", "rejected"].includes(task.workflowStatus)) {
      return res.status(409).json({ error: "Reopen this task before changing a final decision." });
    }
    const previousAssignee = task.assignedTo;
    let updatedDetails = false;
    if (Object.hasOwn(body, "title")) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) {
        return res.status(400).json({ error: "Enter a task title up to 120 characters." });
      }
      task.title = body.title.trim();
      updatedDetails = true;
    }
    for (const [field, maxLength] of [["description", 1000], ["instructions", 5000]]) {
      if (Object.hasOwn(body, field)) {
        if (typeof body[field] !== "string" || body[field].trim().length > maxLength) {
          return res.status(400).json({ error: `Keep ${field} to ${maxLength} characters or fewer.` });
        }
        task[field] = body[field].trim();
        updatedDetails = true;
      }
    }
    if (Object.hasOwn(body, "priority")) {
      if (!priorities.includes(body.priority)) {
        return res.status(400).json({ error: "Select a valid task priority." });
      }
      task.priority = body.priority;
      updatedDetails = true;
    }
    for (const field of ["startDate", "dueDate"]) {
      if (Object.hasOwn(body, field)) {
        const date = dateValue(body[field], field === "dueDate");
        if (!date) return res.status(400).json({ error: `Enter a valid ${field === "dueDate" ? "due" : "start"} date.` });
        task[field] = date;
        updatedDetails = true;
      }
    }
    if (task.dueDate && task.startDate && task.dueDate < task.startDate) {
      return res.status(400).json({ error: "The due date cannot be before the start date." });
    }
    if (Object.hasOwn(body, "assignedTo")) {
      if (!mongoose.isValidObjectId(body.assignedTo)) {
        return res.status(400).json({ error: "Select a valid employee for this task." });
      }
      const employee = await User.findOne({ _id: body.assignedTo, ...activeEmployeeFilter }).select("_id");
      if (!employee) return res.status(400).json({ error: "The selected employee does not exist." });
      task.assignedTo = employee._id;
      task.owner = employee._id;
      updatedDetails = true;
    }

    await task.save();
    await addActivity(task, req.user, "updated", "Task details updated by admin");
    const recipients = [task.assignedTo];
    if (String(previousAssignee) !== String(task.assignedTo)) recipients.push(previousAssignee);
    await notifyUsers(recipients, task, "task_updated", `Task details or deadline changed: ${task.title}`);
    res.json({ task: await task.populate("assignedTo", "fullName email isActive"), updatedDetails });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/start", requireRole("employee"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const task = await Task.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (task.workflowStatus !== "assigned" && task.workflowStatus !== "revision_requested") {
      return res.status(409).json({ error: "Only assigned or revision-requested tasks can be started." });
    }
    const restartingRevision = task.workflowStatus === "revision_requested";
    task.workflowStatus = "in_progress";
    if (restartingRevision) task.progress = 0;
    task.completed = false;
    await task.save();
    await addActivity(task, req.user, "started", "Work started by employee");
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/submit", requireRole("employee"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).some((key) => !["notes", "link"].includes(key))) {
      return res.status(400).json({ error: "Unsupported submission fields were supplied." });
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const link = typeof body.link === "string" ? body.link.trim() : "";
    if (!notes || notes.length > 5000) {
      return res.status(400).json({ error: "Add completion notes up to 5,000 characters." });
    }
    if (link.length > 2000 || !isValidHttpUrl(link)) {
      return res.status(400).json({ error: "Submission links must be valid HTTP or HTTPS URLs up to 2,000 characters." });
    }
    const task = await Task.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (task.workflowStatus !== "in_progress" && task.workflowStatus !== "revision_requested") {
      return res.status(409).json({ error: "Only in-progress or revision-requested tasks can be submitted." });
    }
    task.submissions ??= [];
    task.submissions.push({ submittedBy: req.user._id, notes, link });
    task.workflowStatus = "pending_review";
    task.progress = 100;
    task.completed = false;
    await task.save();
    await addActivity(task, req.user, "submitted", "Work submitted for admin review");
    const admins = await User.find({ role: "admin" }).select("_id");
    await notifyUsers(
      admins.map((admin) => admin._id),
      task,
      "submission_received",
      `Work is ready for review: ${task.title}`,
    );
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:id/progress", requireRole("employee"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
    if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "progress")) {
      return res.status(400).json({ error: "Provide only a progress value." });
    }
    if (!Number.isInteger(body.progress) || body.progress < 0 || body.progress > 99) {
      return res.status(400).json({ error: "Progress must be a whole number from 0 to 99; submit work for review when complete." });
    }
    const task = await Task.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (task.workflowStatus !== "in_progress") {
      return res.status(409).json({ error: "Progress can only be updated while work is in progress." });
    }
    task.progress = body.progress;
    await task.save();
    await addActivity(task, req.user, "progress_updated", `Progress updated to ${task.progress}%`);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/review", requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).some((key) => !["decision", "feedback"].includes(key))) {
      return res.status(400).json({ error: "Unsupported review fields were supplied." });
    }
    const decision = body.decision;
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    if (!["approved", "rejected", "revision_requested"].includes(decision)) {
      return res.status(400).json({ error: "Choose approve, reject, or request revision." });
    }
    if (["rejected", "revision_requested"].includes(decision) && feedback.length < 10) {
      return res.status(400).json({ error: "Provide at least 10 characters of feedback for rejection or revision." });
    }
    if (feedback.length > 3000) {
      return res.status(400).json({ error: "Keep review feedback to 3,000 characters or fewer." });
    }
    const task = await Task.findOne({ _id: req.params.id, ...companyTask });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (task.workflowStatus !== "pending_review") {
      return res.status(409).json({ error: "Only submissions awaiting review can be decided." });
    }
    task.reviews ??= [];
    task.reviews.push({ reviewer: req.user._id, decision, feedback });
    task.workflowStatus = decision;
    task.completed = decision === "approved";
    task.approvedAt = decision === "approved" ? new Date() : undefined;
    await task.save();
    await addActivity(task, req.user, decision, feedback || "Approved by admin");

    const typeByDecision = {
      approved: "review_approved",
      rejected: "review_rejected",
      revision_requested: "revision_requested",
    };
    await notifyUsers(
      [task.assignedTo],
      task,
      typeByDecision[decision],
      decision === "approved"
        ? `Your work was approved: ${task.title}`
        : decision === "rejected"
          ? `Your work was rejected: ${task.title}. ${feedback}`
          : `Revision requested for ${task.title}. ${feedback}`,
    );
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/reopen", requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";
    if (feedback.length < 10 || feedback.length > 3000) {
      return res.status(400).json({ error: "Provide 10–3,000 characters explaining why this task is being reopened." });
    }
    const task = await Task.findOne({ _id: req.params.id, ...companyTask });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (task.workflowStatus !== "rejected") {
      return res.status(409).json({ error: "Only rejected tasks can be reopened." });
    }
    task.workflowStatus = "assigned";
    task.completed = false;
    task.progress = 0;
    task.approvedAt = undefined;
    await task.save();
    await addActivity(task, req.user, "reopened", feedback);
    await notifyUsers([task.assignedTo], task, "task_reopened", `A rejected task was reopened: ${task.title}`);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.get("/reports", requireRole("admin"), async (req, res, next) => {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 6);
    since.setUTCHours(0, 0, 0, 0);
    const [dailyCompletions, employeeSummaries] = await Promise.all([
      Task.aggregate([
        { $match: { ...companyTask, approvedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$approvedAt", timezone: "UTC" } },
            completed: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Task.aggregate([
        { $match: companyTask },
        {
          $group: {
            _id: "$assignedTo",
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ["$workflowStatus", "approved"] }, 1, 0] } },
            pendingReview: { $sum: { $cond: [{ $eq: ["$workflowStatus", "pending_review"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$workflowStatus", "rejected"] }, 1, 0] } },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "employee",
          },
        },
        { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            employeeId: "$_id",
            fullName: "$employee.fullName",
            email: "$employee.email",
            total: 1,
            approved: 1,
            pendingReview: 1,
            rejected: 1,
          },
        },
        { $sort: { fullName: 1 } },
      ]),
    ]);
    res.json({ dailyCompletions, employeeSummaries });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const [notifications, total, unread] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .populate("task", "title workflowStatus")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ recipient: req.user._id }),
      Notification.countDocuments({ recipient: req.user._id, readAt: null }),
    ]);
    res.json({ notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided notification ID is invalid." });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: "Notification not found." });
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
