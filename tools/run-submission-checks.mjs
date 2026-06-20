import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export function buildSubmissionCheckCommands(
  npmCommand = process.platform === "win32" ? "npm.cmd" : "npm",
) {
  return [
    ["typecheck", npmCommand, ["run", "typecheck"]],
    ["lint", npmCommand, ["run", "lint"]],
    ["test", npmCommand, ["run", "test"]],
    ["server QA", npmCommand, ["run", "qa:server"]],
    ["build", npmCommand, ["run", "build"]],
    ["built server QA", npmCommand, ["run", "qa:server:built"]],
    ["runtime flow QA", npmCommand, ["run", "qa:flow"]],
    ["real upload QA", npmCommand, ["run", "qa:real-upload"]],
    ["built web flow QA", npmCommand, ["run", "qa:flow:built"]],
    ["privacy scan", npmCommand, ["run", "check:privacy"]],
    ["upload assets", npmCommand, ["run", "check:upload-assets"]],
    ["release snapshot", npmCommand, ["run", "snapshot:release"]],
    ["release readiness", npmCommand, ["run", "check:release"]],
    ["launch readiness", npmCommand, ["run", "check:launch"]],
  ].map(([label, command, args]) => ({ label, command, args }));
}

export function runSubmissionChecks({
  cwd = rootDir,
  commands = buildSubmissionCheckCommands(),
  runner = spawnSync,
  io = console,
  platform = process.platform,
  commandShell = process.env.ComSpec ?? "cmd.exe",
} = {}) {
  for (const step of commands) {
    io.log(`[submission] ${step.label}: ${step.command} ${step.args.join(" ")}`);
    const spawnStep = toSpawnStep(step, platform, commandShell);
    const result = runner(spawnStep.command, spawnStep.args, {
      cwd,
      stdio: "inherit",
    });

    if (result.error != null) {
      io.error(`[submission] ${step.label} failed: ${result.error.message}`);
      return 1;
    }

    if (result.status !== 0) {
      io.error(`[submission] ${step.label} stopped with exit ${result.status}`);
      return result.status ?? 1;
    }
  }

  io.log("[submission] all checks passed");
  return 0;
}

function toSpawnStep(step, platform, commandShell) {
  if (platform !== "win32") {
    return step;
  }

  return {
    command: commandShell,
    args: ["/d", "/s", "/c", [step.command, ...step.args].map(quoteCmdArg).join(" ")],
  };
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t&()^|<>"]/u.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '\\"')}"`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runSubmissionChecks();
}
