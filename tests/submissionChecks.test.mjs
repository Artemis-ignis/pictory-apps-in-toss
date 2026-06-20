import { describe, expect, it } from "vitest";
import {
  buildSubmissionCheckCommands,
  runSubmissionChecks,
} from "../tools/run-submission-checks.mjs";

describe("submission checks", () => {
  it("runs the full launch sequence with the final launch gate last", () => {
    const commands = buildSubmissionCheckCommands("npm-test");

    expect(commands.map((step) => step.label)).toEqual([
      "typecheck",
      "lint",
      "test",
      "server QA",
      "build",
      "built server QA",
      "runtime flow QA",
      "real upload QA",
      "built web flow QA",
      "privacy scan",
      "upload assets",
      "release snapshot",
      "release readiness",
      "launch readiness",
    ]);
    expect(commands.map((step) => step.label)).not.toContain(
      "device evidence draft",
    );
    expect(commands.at(-1)).toMatchObject({
      command: "npm-test",
      args: ["run", "check:launch"],
    });
  });

  it("stops at the first failed command", () => {
    const calls = [];
    const status = runSubmissionChecks({
      cwd: "project",
      commands: [
        { label: "first", command: "npm", args: ["run", "first"] },
        { label: "second", command: "npm", args: ["run", "second"] },
        { label: "third", command: "npm", args: ["run", "third"] },
      ],
      runner: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return { status: calls.length === 2 ? 1 : 0 };
      },
      io: { log() {}, error() {} },
      platform: "linux",
    });

    expect(status).toBe(1);
    expect(calls).toEqual([
      { command: "npm", args: ["run", "first"], cwd: "project" },
      { command: "npm", args: ["run", "second"], cwd: "project" },
    ]);
  });

  it("runs Windows npm commands through cmd without Node shell mode", () => {
    const calls = [];
    const status = runSubmissionChecks({
      cwd: "project",
      commands: [{ label: "typecheck", command: "npm.cmd", args: ["run", "typecheck"] }],
      runner: (command, args, options) => {
        calls.push({ command, args, shell: options.shell });
        return { status: 0 };
      },
      io: { log() {}, error() {} },
      platform: "win32",
      commandShell: "cmd.exe",
    });

    expect(status).toBe(0);
    expect(calls).toEqual([
      {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", "npm.cmd run typecheck"],
        shell: undefined,
      },
    ]);
  });
});
