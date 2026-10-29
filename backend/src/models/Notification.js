const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "task_assigned",
        "task_updated",
        "submission_received",
        "review_approved",
        "review_rejected",
        "revision_requested",
        "task_reopened",
        "task_deadline_reminder",
      ],
      required: true,
    },
    title: { type: String, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    deadlineAt: { type: Date },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index(
  { task: 1, recipient: 1, type: 1, deadlineAt: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "task_deadline_reminder", deadlineAt: { $type: "date" } },
  },
);

module.exports = mongoose.model("Notification", notificationSchema);
