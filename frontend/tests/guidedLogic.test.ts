import { describe, expect, it } from "vitest";
import { attachmentError, ticketFormErrors } from "../src/components/helpdesk/ticketMeta";
import type { OnboardingTask } from "../src/types/dashboard";
import { formatDuration } from "../src/utils/format";
import {
  getBlockingTasks,
  getCompletionMessage,
  getNextTask,
  getRecommendedTasks,
  getStageProgress,
  getTaskCounts,
  getTodayOverview,
  getTodayTasks,
  groupByPriority,
  isBlocked,
} from "../src/utils/onboarding";
import { photoError } from "../src/utils/validation";

const TODAY = "2026-11-09"; // a Monday

function task(id: string, overrides: Partial<OnboardingTask> = {}): OnboardingTask {
  return {
    id, stage: "Documentation", title: id, description: "-", category: "HR Forms", dueDate: TODAY, priority: "medium", status: "pending",
    dependsOn: [], sequence: 0, ...overrides,
  }; // fmt: skip
}

describe("task priorities and recommendations", () => {
  it("never recommends a task whose prerequisite isn't done", () => {
    const tasks = [task("documents", { priority: "high", dependsOn: ["profile"], sequence: 1 }), task("profile", { priority: "high", sequence: 0 })];
    expect(isBlocked(tasks[0], tasks)).toBe(true);
    expect(getBlockingTasks(tasks[0], tasks).map((t) => t.id)).toEqual(["profile"]);
    expect(getNextTask(tasks, TODAY)?.id).toBe("profile");
    const afterProfile = [tasks[0], { ...tasks[1], status: "completed" as const }];
    expect(isBlocked(afterProfile[0], afterProfile)).toBe(false);
    expect(getNextTask(afterProfile, TODAY)?.id).toBe("documents");
  });

  it("orders by deadline, then in-progress, then priority, then catalog order", () => {
    const tasks = [
      task("later-high", { dueDate: "2026-11-12", priority: "high" }),
      task("today-low", { priority: "low" }),
      task("overdue-medium", { dueDate: "2026-11-03", priority: "medium" }), // overdue counts as due today
      task("today-high-2", { priority: "high", sequence: 5 }),
      task("today-high-1", { priority: "high", sequence: 2 }),
      task("today-low-started", { priority: "low", status: "in_progress" }),
      task("done", { status: "completed", priority: "high" }),
    ];
    expect(getRecommendedTasks(tasks, TODAY).map((t) => t.id)).toEqual([
      "today-low-started",
      "today-high-1",
      "today-high-2",
      "overdue-medium",
      "today-low",
      "later-high",
    ]);
  });

  it("lists today's work: open tasks due today or earlier, then tasks finished today", () => {
    const tasks = [task("a"), task("b", { dueDate: "2026-11-02" }), task("c", { dueDate: "2026-11-20" }), task("d", { status: "completed" })];
    expect(getTodayTasks(tasks, TODAY).map((t) => t.id)).toEqual(["a", "b", "d"]);
  });
});

describe("completion messages", () => {
  it("points to the next step while today's work remains", () => {
    const message = getCompletionMessage([task("done", { status: "completed" }), task("next")], TODAY);
    expect(message).toMatchObject({ kind: "task", title: "Congratulations! 🎉", message: "You've completed this task. Let's move on to your next step." });
    expect(message.next?.id).toBe("next");
  });

  it("says today is done, and when the next task is due", () => {
    const tomorrow = getCompletionMessage([task("done", { status: "completed" }), task("t", { dueDate: "2026-11-10" })], TODAY);
    expect(tomorrow).toMatchObject({ kind: "day", message: "You've completed all your tasks for today. See you tomorrow!" });
    const later = getCompletionMessage([task("done", { status: "completed" }), task("t", { dueDate: "2026-11-16" })], TODAY);
    expect(later.message).toBe("You've completed all your tasks for today. Your next task is due on November 16, 2026.");
  });

  it("celebrates the whole journey when nothing is left", () => {
    expect(getCompletionMessage([task("a", { status: "completed" })], TODAY)).toEqual({
      kind: "journey",
      title: "Congratulations! 🎉",
      message: "You've successfully completed your onboarding journey. Welcome to the team!",
    });
  });
});

describe("task durations", () => {
  it.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [59, "59 seconds"],
    [60, "1 minute"],
    [272, "4 minutes 32 seconds"],
    [3600, "1 hour"],
    [3725, "1 hour 2 minutes"],
    [7322, "2 hours 2 minutes"],
  ])("%i seconds reads as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("upload and form validation", () => {
  const file = (name: string, size: number, type = "") => new File([new Uint8Array(size)], name, { type });

  it("accepts JPG/PNG profile photos up to 2 MB", () => {
    expect(photoError(file("me.png", 1000, "image/png"))).toBeNull();
    expect(photoError(file("me.JPEG", 1000, "image/jpeg"))).toBeNull();
    expect(photoError(file("me.gif", 1000, "image/gif"))).toBe("Choose a JPG or PNG image.");
    expect(photoError(file("me.png", 0, "image/png"))).toBe("The file is empty.");
    expect(photoError(file("me.png", 2 * 1024 * 1024 + 1, "image/png"))).toBe("Photos can be at most 2 MB.");
  });

  it("checks Help Desk tickets before sending them", () => {
    expect(ticketFormErrors({ category: "it_support", subject: "VPN not working", description: "The VPN rejects my login." })).toEqual({});
    expect(Object.keys(ticketFormErrors({ category: "", subject: "Hi", description: "short" }))).toEqual(["category", "subject", "description"]);
    expect(attachmentError(file("shot.png", 10))).toBeNull();
    expect(attachmentError(file("tool.exe", 10))).toBe("Attach a screenshot (PNG or JPG) or a PDF.");
    expect(attachmentError(file("big.pdf", 5 * 1024 * 1024 + 1))).toBe("Attachments can be at most 5 MB.");
  });
});

describe("grouping tasks: priority → tasks (every status together)", () => {
  const mixed = [
    task("p-low", { priority: "low" }),
    task("p-high", { priority: "high" }),
    task("ip-medium", { status: "in_progress" }),
    task("done-high", { status: "completed", priority: "high" }),
    task("p-high-later", { priority: "high", dueDate: "2026-11-12" }),
  ];

  it("puts each task under its own priority whatever its status: open work by due date, completed last", () => {
    const groups = groupByPriority(mixed);
    expect(groups.map((g) => [g.priority, g.tasks.map((t) => t.id)])).toEqual([
      ["high", ["p-high", "p-high-later", "done-high"]],
      ["medium", ["ip-medium"]],
      ["low", ["p-low"]],
    ]);
    // Every task appears exactly once, and statuses and priorities are untouched.
    expect(groups.flatMap((g) => g.tasks)).toHaveLength(mixed.length);
    expect(groups.flatMap((g) => g.tasks).find((t) => t.id === "done-high")).toMatchObject({ status: "completed", priority: "high" });
  });

  it("leaves out empty priority groups and returns nothing for an empty list", () => {
    expect(groupByPriority([])).toEqual([]);
    expect(groupByPriority([task("a", { priority: "low" }), task("b", { priority: "high", status: "completed" })]).map((g) => g.priority)).toEqual(["high", "low"]);
  });

  it("orders priority groups high, medium, low and keeps a given order when asked", () => {
    const tasks = [task("m"), task("l", { priority: "low" }), task("h2", { priority: "high", dueDate: "2026-11-20" }), task("h1", { priority: "high" })];
    expect(groupByPriority(tasks).map((g) => g.priority)).toEqual(["high", "medium", "low"]);
    expect(groupByPriority(tasks)[0].tasks.map((t) => t.id)).toEqual(["h1", "h2"]); // sorted by due date
    expect(groupByPriority(tasks, false)[0].tasks.map((t) => t.id)).toEqual(["h2", "h1"]); // given order kept
  });
});

describe("today's tasks on Home", () => {
  it("shows only today's (and overdue) open work by priority, never future tasks, and lists today's completed tasks separately", () => {
    const tasks = [
      task("today-high", { priority: "high" }),
      task("overdue-low", { priority: "low", dueDate: "2026-11-05" }),
      task("future-high", { priority: "high", dueDate: "2026-11-10" }),
      task("done-today", { status: "completed" }),
      task("done-earlier", { status: "completed", dueDate: "2026-11-02" }),
    ];
    const overview = getTodayOverview(tasks, TODAY);
    expect(overview.active.map((g) => [g.priority, g.tasks.map((t) => t.id)])).toEqual([
      ["high", ["today-high"]],
      ["low", ["overdue-low"]],
    ]);
    expect(overview.activeCount).toBe(2);
    expect(overview.completed.map((t) => t.id)).toEqual(["done-today"]);
  });

  it("has no active groups when everything due today is done", () => {
    const overview = getTodayOverview([task("done", { status: "completed" }), task("tomorrow", { dueDate: "2026-11-10" })], TODAY);
    expect(overview.active).toEqual([]);
    expect(overview.completed).toHaveLength(1);
  });
});

describe("progress", () => {
  const tasks = [
    task("a", { stage: "Welcome", status: "completed" }),
    task("b", { stage: "Welcome", status: "in_progress" }),
    task("c", { stage: "Documentation" }),
    task("d", { stage: "Documentation", status: "completed" }),
  ];

  it("counts total, completed, in progress and pending tasks", () => {
    expect(getTaskCounts(tasks)).toMatchObject({ total: 4, completed: 2, inProgress: 1, pending: 1, remaining: 2 });
  });

  it("reports each stage's progress; the first unfinished stage is current", () => {
    const stages = getStageProgress(tasks);
    expect(stages.slice(0, 2)).toEqual([
      { name: "Welcome", completedTasks: 1, totalTasks: 2, status: "current" },
      { name: "Documentation", completedTasks: 1, totalTasks: 2, status: "upcoming" },
    ]);
    expect(stages.map((s) => s.name)).toEqual(["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"]);
  });
});
