# Smashers Auto Onboard & Task Bot

Automates the [smashers.xyz](https://smashers.xyz) onboarding process, task completion, and badge claiming for multiple accounts. Runs every 24 hours to automatically pick up and complete new tasks.

## Features

- **Auto Onboarding** — Completes the full onboarding flow (wallet submission, referral code, all steps)
- **Auto Task Completion** — Fetches active tasks from the API and completes any new/uncompleted ones
- **Auto Badge Claiming** — Claims badges 3 & 4 when eligible (badge 3 requires 4 completed tasks)
- **Smart Skip** — Detects already-onboarded accounts, completed tasks, and claimed badges — skips them automatically
- **Multi-Account** — Supports multiple accounts via `cookies.txt` and `wallet.txt`
- **24h Loop** — Runs continuously, checking for new tasks every 24 hours
- **Hot Reload** — Re-reads `cookies.txt` and `wallet.txt` each cycle, so you can add accounts without restarting

## Requirements

- [Node.js](https://nodejs.org/) v14 or higher (no external dependencies needed)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/ganjsmoke/smashers.git
cd smashers
```

### 2. Create `cookies.txt`

Add one cookie per line, one for each account. Get the `connect.sid` cookie from your browser (DevTools → Network tab → any request → Cookie header).

```
connect.sid=s%3Aabc123...
connect.sid=s%3Adef456...
connect.sid=s%3Aghi789...
```

### 3. Create `wallet.txt`

Add one wallet address per line, matching the same order as `cookies.txt`.

```
0x1234567890abcdef1234567890abcdef12345678
0xabcdef1234567890abcdef1234567890abcdef12
0x7890abcdef1234567890abcdef1234567890abcd
```

> **Important:** Line 1 in `cookies.txt` pairs with line 1 in `wallet.txt`, line 2 with line 2, etc.

### 4. Run

```bash
node onboard.js
```

## Example Output

```
🚀 [3/24/2026, 10:00:00 AM] Processing 3 account(s)...

[Account 1] 👤 username1 (@user1) | Points: 5500 | Onboarding: Done
[Account 1] ⏭️  Already onboarded, skipping to tasks...
[Account 1] 📋 Found 3 active tasks (excluding invite task)
[Account 1] ⏭️  "LIKE + RT + TAG 3 FRIENDS" already completed, skipping
[Account 1] ✅ Complete "NEW TASK" (+1500pts) → 200 {"ok":true,"totalPoints":7000}
[Account 1] ⏭️  Badge 3 already claimed, skipping
[Account 1] ⏭️  Badge 4 already claimed, skipping
[Account 1] 🎉 All done!

✅ Done: 3/3 accounts processed.

⏰ Next run in 24 hours. Keeping alive...
```

## Running in Background

To keep the script running after closing the terminal:

**Using pm2:**
```bash
npm install -g pm2
pm2 start onboard.js --name smashers
pm2 logs smashers
```

**Using screen (Linux/macOS):**
```bash
screen -S smashers
node onboard.js
# Press Ctrl+A then D to detach
# screen -r smashers to reattach
```

## Configuration

Edit these constants at the top of `onboard.js`:

| Variable | Default | Description |
|---|---|---|
| `REFERRAL_CODE` | `"6EAN8"` | Referral code submitted during onboarding |
| `DELAY_MS` | `1500` | Delay (ms) between processing each account |
| `LOOP_INTERVAL_MS` | `86400000` | Interval between runs (default: 24 hours) |
| `BADGE_IDS` | `[3, 4]` | Badge IDs to auto-claim |

## How It Works

For each account, the script runs through these steps:

1. **Check status** — `GET /auth/me` to check onboarding status and completed tasks
2. **Onboarding** (if not done):
   - `POST /onboarding-step` with step 2, 3, 4
   - `POST /wallet` with wallet address
   - `POST /referral` with referral code
   - `POST /onboarding-done`
3. **Tasks** — `GET /tasks` to fetch active tasks, then `POST /tasks/:id/complete` for each uncompleted task (skips invite tasks)
4. **Badges** — `POST /badges/:id/claim` for eligible badges (badge 3 requires 4+ completed tasks)
5. **Wait 24 hours** → repeat

## Notes

- Cookies expire — if you see "Failed to fetch user info", replace the expired cookie in `cookies.txt`
- The invite task (`__invite_3__`) is automatically skipped
- You can add/remove accounts in `cookies.txt` and `wallet.txt` while the script is running — changes are picked up on the next cycle

## Disclaimer

This tool is for educational purposes only. Use at your own risk.
