const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  ],
  ["provider API key", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "credential in URL",
    /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/,
  ],
];
const findings = [];
let textFiles = 0;
let bytes = 0;
for (const filename of files) {
  const absolute = path.join(root, filename);
  if (!fs.existsSync(absolute)) continue;
  const data = fs.readFileSync(absolute);
  bytes += data.length;
  if (
    /(?:^|\/)\.env(?!\.example$)|\.(?:jks|keystore|pem)$|(?:^|\/)keystore\.properties$/.test(
      filename,
    )
  )
    findings.push({
      file: filename,
      kind: "private configuration included in source",
    });
  if (data.includes(0)) continue;
  textFiles++;
  const lines = data.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [kind, pattern] of patterns)
      if (pattern.test(line))
        findings.push({ file: filename, line: index + 1, kind });
  });
}
// History scanning prints only file paths and rule names, never matched secrets.
let commits = 0;
if (process.argv.includes("--history")) {
  const history = execFileSync("git", ["rev-list", "--all"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const commit of history) {
    const changes = execFileSync(
      "git",
      ["show", "--format=", "--no-ext-diff", "--no-renames", commit],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    commits++;
    let filename = "unknown";
    for (const line of changes.split(/\r?\n/)) {
      if (line.startsWith("+++ b/")) filename = line.slice(6);
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      for (const [kind, pattern] of patterns)
        if (pattern.test(line))
          findings.push({ commit: commit.slice(0, 12), file: filename, kind });
    }
  }
}
console.log(
  JSON.stringify(
    {
      sourceFiles: files.length,
      textFiles,
      bytes,
      historyCommits: commits,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
