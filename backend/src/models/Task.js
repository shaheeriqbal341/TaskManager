const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, required: true, trim: true, maxlength: 5000 },
    link: { type: String, trim: true, maxlength: 2000, default: "" },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const reviewSchema = new mongoose.Schema(
  {
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    decision: {
      type: String,
      enum: ["approved", "rejected", "revision_requested"],
      required: true,
    },
    feedback: { type: String, trim: true, maxlength: 3000, default: "" },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "A title is required."],
      trim: true,
      maxlength: [120, "Title must be 120 characters or fewer."],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description must be 1,000 characters or fewer."],
      default: "",
    },
    completed: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [5000, "Instructions must be 5,000 characters or fewer."],
      default: "",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
    },
    startDate: Date,
    dueDate: Date,
    workflowStatus: {
      type: String,
      enum: ["assigned", "in_progress", "pending_review", "revision_requested", "approved", "rejected"],
      index: true,
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    approvedAt: Date,
    submissions: { type: [submissionSchema], default: undefined },
    reviews: { type: [reviewSchema], default: undefined },
  },
  {
    timestamps: true,
    collection: "HR",
  },
);

module.exports = mongoose.model("Task", taskSchema);
