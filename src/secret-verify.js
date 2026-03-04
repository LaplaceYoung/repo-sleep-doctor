const SECRET_RULE_IDS = new Set(["private-key-block", "aws-key", "generic-secret"]);

function isSecretFinding(finding) {
  return Boolean(finding && SECRET_RULE_IDS.has(String(finding.id || "")));
}

function nowIso() {
  return new Date().toISOString();
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function resolveProvider(finding, requestedProvider) {
  if (requestedProvider && requestedProvider !== "auto") {
    return requestedProvider;
  }
  const id = String(finding && finding.id ? finding.id : "");
  if (id === "aws-key") {
    return "aws";
  }
  if (id === "generic-secret") {
    return "generic";
  }
  if (id === "private-key-block") {
    return "generic";
  }
  return "generic";
}

function evaluateSecretMessage(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("dummy") || text.includes("placeholder") || text.includes("example") || text.includes("changeme")) {
    return { status: "invalid", reason: "placeholder-token" };
  }
  return { status: "unknown", reason: "verification-not-implemented" };
}

function verifyOneFinding(finding, options) {
  const startedAt = Date.now();
  const provider = resolveProvider(finding, options.provider);
  if (options.safeMode) {
    return {
      status: "skipped",
      provider,
      checkedAt: nowIso(),
      reason: "safe-mode-enabled",
      latencyMs: Date.now() - startedAt
    };
  }
  const timeoutMs = toSafeNumber(options.timeoutMs, 1500);
  const simulatedMs = Math.min(80, Math.max(10, Math.floor(timeoutMs / 20)));
  const probe = evaluateSecretMessage(finding && finding.message ? finding.message : "");
  return {
    status: probe.status,
    provider,
    checkedAt: nowIso(),
    reason: probe.reason,
    latencyMs: simulatedMs
  };
}

function verifySecretFindings(findings, options = {}) {
  const enabled = Boolean(options.enabled);
  if (!enabled || !Array.isArray(findings) || findings.length === 0) {
    return {
      findings,
      stats: {
        verifiedSecrets: 0,
        invalidSecrets: 0,
        unverifiedSecrets: 0,
        skippedSecrets: 0
      }
    };
  }

  const maxCount = Math.max(0, toSafeNumber(options.maxCount, 20));
  const next = [];
  let verifiedSecrets = 0;
  let invalidSecrets = 0;
  let unverifiedSecrets = 0;
  let skippedSecrets = 0;
  let verifiedSoFar = 0;

  for (const finding of findings) {
    if (!isSecretFinding(finding)) {
      next.push(finding);
      continue;
    }

    if (verifiedSoFar >= maxCount) {
      const overflow = {
        status: "skipped",
        provider: resolveProvider(finding, options.provider),
        checkedAt: nowIso(),
        reason: "verify-max-exceeded",
        latencyMs: 0
      };
      next.push({
        ...finding,
        verification: overflow
      });
      skippedSecrets += 1;
      continue;
    }

    verifiedSoFar += 1;
    const verification = verifyOneFinding(finding, options);
    if (verification.status === "verified") {
      verifiedSecrets += 1;
    } else if (verification.status === "invalid") {
      invalidSecrets += 1;
    } else if (verification.status === "skipped") {
      skippedSecrets += 1;
    } else {
      unverifiedSecrets += 1;
    }
    next.push({
      ...finding,
      verification
    });
  }

  return {
    findings: next,
    stats: {
      verifiedSecrets,
      invalidSecrets,
      unverifiedSecrets,
      skippedSecrets
    }
  };
}

module.exports = {
  isSecretFinding,
  verifySecretFindings
};

