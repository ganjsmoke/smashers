const fs = require("fs");
const https = require("https");

const BASE_URL = "https://smashers.xyz/api";
const REFERRAL_CODE = "6EAN8";
const DELAY_MS = 1500; // delay between accounts
const LOOP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const BADGE_IDS = [3, 4];
const SKIP_TASK_URL = "__invite_3__";

function loadLines(filepath) {
  if (!fs.existsSync(filepath)) {
    console.log(`[ERROR] ${filepath} not found!`);
    process.exit(1);
  }
  return fs
    .readFileSync(filepath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function request(method, endpoint, cookie, body, noApiPrefix) {
  return new Promise((resolve, reject) => {
    const base = noApiPrefix ? "https://smashers.xyz" : BASE_URL;
    const url = new URL(base + endpoint);
    const data = body ? JSON.stringify(body) : "";

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
    };

    if (method === "POST") {
      options.headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: responseData });
      });
    });

    req.on("error", (err) => reject(err));
    if (method === "POST") req.write(data);
    req.end();
  });
}

function post(endpoint, cookie, body) {
  return request("POST", endpoint, cookie, body);
}

function get(endpoint, cookie) {
  return request("GET", endpoint, cookie, null);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getUser(cookie) {
  const res = await request("GET", "/auth/me", cookie, null, true);
  if (res.status !== 200) return null;
  try {
    return JSON.parse(res.body).user;
  } catch {
    return null;
  }
}

async function getTasks(cookie) {
  const res = await get("/tasks", cookie);
  if (res.status !== 200) return [];
  try {
    const data = JSON.parse(res.body);
    return (data.tasks || []).filter((t) => t.active && t.url !== SKIP_TASK_URL);
  } catch {
    return [];
  }
}

async function runStep(label, name, endpoint, cookie, payload) {
  try {
    const res = await post(endpoint, cookie, payload);
    const ok = res.status === 200;
    const icon = ok ? "✅" : "❌";
    console.log(`${label} ${icon} ${name} → ${res.status} ${res.body}`);
    return ok;
  } catch (err) {
    console.log(`${label} ❌ ${name} → ERROR: ${err.message}`);
    return false;
  }
}

async function onboard(cookie, wallet, index) {
  const label = `[Account ${index + 1}]`;

  // Check user status
  const user = await getUser(cookie);
  if (!user) {
    console.log(`${label} ❌ Failed to fetch user info. Invalid cookie?\n`);
    return false;
  }

  console.log(`${label} 👤 ${user.displayName} (@${user.username}) | Points: ${user.totalPoints} | Onboarding: ${user.onboardingDone ? "Done" : "Step " + user.onboardingStep}`);

  const completedTaskIds = new Set(user.completedTasks || []);
  const claimedBadges = new Set(
    (user.badges || []).filter((b) => b.claimed).map((b) => b.id)
  );

  // === ONBOARDING ===
  if (!user.onboardingDone) {
    console.log(`${label} 📋 Starting onboarding...`);

    const onboardingSteps = [
      { name: "Onboarding step 1 (step=2)", endpoint: "/onboarding-step", payload: { step: 2 } },
      { name: "Onboarding step 2 (step=3)", endpoint: "/onboarding-step", payload: { step: 3 } },
      { name: "Submit wallet",              endpoint: "/wallet",          payload: { wallet: wallet } },
      { name: "Onboarding step 3 (step=4)", endpoint: "/onboarding-step", payload: { step: 4 } },
      { name: "Submit referral",            endpoint: "/referral",        payload: { code: REFERRAL_CODE } },
      { name: "Onboarding done",            endpoint: "/onboarding-done", payload: {} },
    ];

    for (const step of onboardingSteps) {
      const ok = await runStep(label, step.name, step.endpoint, cookie, step.payload);
      if (!ok) {
        console.log(`${label} ⛔ Stopped onboarding due to failure.\n`);
        return false;
      }
    }

    console.log(`${label} ✅ Onboarding complete!`);
  } else {
    console.log(`${label} ⏭️  Already onboarded, skipping to tasks...`);
  }

  // === TASKS ===
  const tasks = await getTasks(cookie);
  console.log(`${label} 📋 Found ${tasks.length} active tasks (excluding invite task)`);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (completedTaskIds.has(task._id)) {
      console.log(`${label} ⏭️  "${task.title}" already completed, skipping`);
      continue;
    }
    await runStep(label, `Complete "${task.title}" (+${task.points}pts)`, `/tasks/${task._id}/complete`, cookie, {});
  }

  // Re-fetch user to get updated completedTasks count after new tasks
  const updatedUser = await getUser(cookie);
  const totalCompleted = updatedUser ? (updatedUser.completedTasks || []).length : completedTaskIds.size;
  const updatedClaimedBadges = new Set(
    ((updatedUser || user).badges || []).filter((b) => b.claimed).map((b) => b.id)
  );

  // === BADGES ===
  for (const badgeId of BADGE_IDS) {
    if (updatedClaimedBadges.has(badgeId)) {
      console.log(`${label} ⏭️  Badge ${badgeId} already claimed, skipping`);
      continue;
    }
    if (badgeId === 3 && totalCompleted < 4) {
      console.log(`${label} ⏭️  Badge 3 requires 4 completed tasks (have ${totalCompleted}), skipping`);
      continue;
    }
    await runStep(label, `Claim badge ${badgeId}`, `/badges/${badgeId}/claim`, cookie, {});
  }

  console.log(`${label} 🎉 All done!\n`);
  return true;
}

async function run() {
  // Re-read files each cycle so you can add new accounts without restarting
  const cookies = loadLines("cookies.txt");
  const wallets = loadLines("wallet.txt");

  if (cookies.length !== wallets.length) {
    console.log(`❌ Mismatch: ${cookies.length} cookies vs ${wallets.length} wallets`);
    return;
  }

  const now = new Date().toLocaleString();
  console.log(`\n🚀 [${now}] Processing ${cookies.length} account(s)...\n`);

  let success = 0;
  for (let i = 0; i < cookies.length; i++) {
    const result = await onboard(cookies[i], wallets[i], i);
    if (result) success++;
    if (i < cookies.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n✅ Done: ${success}/${cookies.length} accounts processed.`);
}

async function main() {
  await run();

  console.log(`\n⏰ Next run in 24 hours. Keeping alive...\n`);
  setInterval(async () => {
    await run();
    const next = new Date(Date.now() + LOOP_INTERVAL_MS).toLocaleString();
    console.log(`\n⏰ Next run at ${next}. Keeping alive...\n`);
  }, LOOP_INTERVAL_MS);
}

main();
