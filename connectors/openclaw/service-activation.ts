import path from "node:path";

export type ConnectorServiceActivationDecision = {
  activate: boolean;
  reason: string;
};

function getPrimaryCommand(argv: readonly string[]) {
  let skipNext = false;
  for (const token of argv) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token === "--profile" || token === "--log-level") {
      skipNext = true;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return token;
  }
  return null;
}

function getSecondaryCommand(argv: readonly string[]) {
  let skipNext = false;
  let seenPrimary = false;
  for (const token of argv) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token === "--profile" || token === "--log-level") {
      skipNext = true;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    if (!seenPrimary) {
      seenPrimary = true;
      continue;
    }
    return token;
  }
  return null;
}

function getExecutableName(rawArgv0: string | undefined) {
  return path.basename((rawArgv0 ?? "").trim()).toLowerCase();
}

function normalizeProcessToken(value: string | undefined) {
  return (value ?? "").trim().replaceAll("\\", "/").toLowerCase();
}

function isOpenClawServiceKind(
  value: string | undefined,
  expected: "gateway" | "daemon"
) {
  return normalizeProcessToken(value) === expected;
}

export function getConnectorServiceActivationDecision(
  rawArgv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): ConnectorServiceActivationDecision {
  if (
    normalizeProcessToken(env.OPENCLAW_SERVICE_MARKER) === "openclaw" &&
    (isOpenClawServiceKind(env.OPENCLAW_SERVICE_KIND, "gateway") ||
      isOpenClawServiceKind(env.OPENCLAW_SERVICE_KIND, "daemon"))
  ) {
    return {
      activate: true,
      reason: `service marker ${env.OPENCLAW_SERVICE_KIND?.trim() || "gateway"}`
    };
  }

  const executableName = getExecutableName(rawArgv[1]);
  if (executableName === "openclaw-gateway" || executableName === "openclaw-daemon") {
    return {
      activate: true,
      reason: `dedicated binary ${executableName}`
    };
  }

  const argv = rawArgv.slice(2);
  const primary = getPrimaryCommand(argv);
  const secondary = getSecondaryCommand(argv);
  if ((primary === "gateway" || primary === "daemon") && secondary == null) {
    return {
      activate: true,
      reason: `${primary} command`
    };
  }

  return {
    activate: false,
    reason:
      primary != null
        ? `primary=${primary}${secondary ? ` secondary=${secondary}` : ""}`
        : `executable=${executableName || "unknown"}`
  };
}

export function shouldActivateConnectorServiceForProcess(
  rawArgv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
) {
  return getConnectorServiceActivationDecision(rawArgv, env).activate;
}
