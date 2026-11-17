const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const android = path.join(root, "android");
const propertiesPath = path.join(android, "keystore.properties");
const storePath = path.join(android, "signing", "financeiq-release.keystore");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run android:signing -- [--github-secrets]");
  console.log(
    "Creates/reuses an ignored local release key. --github-secrets stores the key and passwords as encrypted repository Actions secrets.",
  );
  process.exit(0);
}
if (args.some((argument) => argument !== "--github-secrets"))
  throw new Error("Unknown signing option. Use --help.");

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr?.toString() || "Unknown error"}`,
    );
}

try {
  let properties;
  if (fs.existsSync(propertiesPath)) {
    properties = Object.fromEntries(
      fs
        .readFileSync(propertiesPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    if (!fs.existsSync(path.resolve(android, properties.storeFile)))
      throw new Error(
        "The configured local keystore is missing. Restore it before creating another signing identity.",
      );
  } else {
    if (fs.existsSync(storePath))
      throw new Error(
        "A keystore already exists without keystore.properties. Restore its signing configuration.",
      );
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const password = crypto.randomBytes(24).toString("hex");
    properties = {
      storeFile: "signing/financeiq-release.keystore",
      storePassword: password,
      keyAlias: "financeiq",
      keyPassword: password,
    };
    run(
      "keytool",
      [
        "-genkeypair",
        "-keystore",
        storePath,
        "-storetype",
        "PKCS12",
        "-alias",
        properties.keyAlias,
        "-keyalg",
        "RSA",
        "-keysize",
        "3072",
        "-validity",
        "10000",
        "-dname",
        "CN=FinanceIQ, O=FinanceIQ",
        "-storepass:env",
        "FINANCEIQ_SIGN_PASSWORD",
        "-keypass:env",
        "FINANCEIQ_SIGN_PASSWORD",
      ],
      { env: { ...process.env, FINANCEIQ_SIGN_PASSWORD: password } },
    );
    fs.writeFileSync(
      propertiesPath,
      `# Private release signing configuration. Keep this file and its keystore backed up.\n${Object.entries(
        properties,
      )
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "Created private release signing key under android/signing/ and ignored android/keystore.properties.",
    );
  }
  run(
    "keytool",
    [
      "-list",
      "-keystore",
      path.resolve(android, properties.storeFile),
      "-alias",
      properties.keyAlias,
      "-storepass:env",
      "FINANCEIQ_SIGN_PASSWORD",
    ],
    {
      env: {
        ...process.env,
        FINANCEIQ_SIGN_PASSWORD: properties.storePassword,
      },
    },
  );
  if (args.includes("--github-secrets")) {
    const secrets = {
      FINANCEIQ_KEYSTORE_BASE64: fs
        .readFileSync(path.resolve(android, properties.storeFile))
        .toString("base64"),
      FINANCEIQ_KEYSTORE_PASSWORD: properties.storePassword,
      FINANCEIQ_KEY_ALIAS: properties.keyAlias,
      FINANCEIQ_KEY_PASSWORD: properties.keyPassword,
    };
    for (const [name, value] of Object.entries(secrets)) {
      run("gh", ["secret", "set", name], { input: value });
      console.log(`Updated encrypted GitHub Actions secret ${name}.`);
    }
  }
  console.log(
    "Release signing configured. Reuse and back up this key for future updates.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
