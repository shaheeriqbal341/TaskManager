const express = require("express");
const mongoose = require("mongoose");
const Task = require("../models/Task");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.get("/", async (req, res, next) => {
  try {
    const tasks = await Task.find({
      owner: req.user._id,
      assignedTo: { $exists: false },
      workflowStatus: { $exists: false },
    }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (Object.keys(body).some((key) => !["title", "description"].includes(key))) {
      return res.status(400).json({ error: "Only title and description can be set." });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    if (!title || title.length > 120) {
      return res.status(400).json({ error: "Enter a task title up to 120 characters." });
    }
    if (description.length > 1000) {
      return res.status(400).json({ error: "Keep the description to 1,000 characters or fewer." });
    }

    const task = await Task.create({ title, description, owner: req.user._id });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !["completed", "title", "description"].includes(key))) {
      return res.status(400).json({ error: "Provide valid task fields to update." });
    }

    const changes = {};
    if (Object.hasOwn(body, "completed")) {
      if (typeof body.completed !== "boolean") {
        return res.status(400).json({ error: "Completed must be true or false." });
      }
      changes.completed = body.completed;
    }
    if (Object.hasOwn(body, "title")) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) {
        return res.status(400).json({ error: "Enter a task title up to 120 characters." });
      }
      changes.title = body.title.trim();
    }
    if (Object.hasOwn(body, "description")) {
      if (typeof body.description !== "string" || body.description.trim().length > 1000) {
        return res.status(400).json({ error: "Keep the description to 1,000 characters or fewer." });
      }
      changes.description = body.description.trim();
    }

    const task = await Task.findOneAndUpdate(
      {
        _id: req.params.id,
        owner: req.user._id,
        assignedTo: { $exists: false },
        workflowStatus: { $exists: false },
      },
      changes,
      { new: true, runValidators: true },
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json(task);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "The provided task ID is invalid." });
    }

    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id,
      assignedTo: { $exists: false },
      workflowStatus: { $exists: false },
    });
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json({ message: "Task deleted." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
