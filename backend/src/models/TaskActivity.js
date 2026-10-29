const mongoose = require("mongoose");

const taskActivitySchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true, maxlength: 80 },
    details: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

taskActivitySchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.model("TaskActivity", taskActivitySchema);
