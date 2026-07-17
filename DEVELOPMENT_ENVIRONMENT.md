# Grow Together AI — Development Environment

Status: Preparation document (Milestone -1 / Milestone 0). This document is the single source of truth for "what tools, and what exact versions, everyone working on this project uses." Any future developer should read this before installing anything.

## Supported Operating Systems

| OS | Supported? | Notes |
|---|---|---|
| macOS | Yes | Recommended — most Next.js tooling is developed and tested here first |
| Windows | Yes | Fully supported; a couple of installation steps differ slightly (noted below) |
| Linux | Yes | Fully supported; commands are the same as macOS in this document |

## Official Node.js Version

**Node.js 24 (Active LTS)**, specifically pinned to **24.16.0** for exact reproducibility across every machine working on this project — not just "any 24.x version," to remove any possibility of subtle version-to-version differences causing a "works on my machine" problem.

This version is enforced by the `.nvmrc` file at the root of the repository (see Section 4) — a developer never has to remember or guess it.

## Official Package Manager

**npm** (the version bundled with Node.js 24 — no separate installation needed). See the decision rationale above.

---

## Installation Commands

### Step 1 — Install nvm (only once per computer)

**macOS / Linux:**
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```
Then fully close and reopen your terminal.

**Windows:**
Download and run the installer from `https://github.com/coreybutler/nvm-windows/releases` (get `nvm-setup.exe` from the latest release).

### Step 2 — Install the project's exact Node.js version

```
nvm install 24.16.0
```

### Step 3 — Tell your computer to use that version for this project

From inside the project folder (once it exists locally):
```
nvm use
```
This automatically reads the `.nvmrc` file and switches to the correct version — no need to type the version number again.

### Step 4 — Install the project's code dependencies

From inside the project folder:
```
npm install
```
This reads the project's dependency list and downloads everything the app needs to run.

---

## Verification Commands

Run each of these and check the expected result:

| Command | Expected result |
|---|---|
| `nvm --version` | Prints a version number (e.g., `0.40.1`) |
| `node -v` | Prints `v24.16.0` exactly |
| `npm -v` | Prints a version number (npm ships with Node, so this confirms both installed correctly) |

If `node -v` shows a different version than `v24.16.0`, run `nvm use` again from inside the project folder before continuing.

---

## Troubleshooting Tips

**`nvm: command not found` (after installing nvm)**
You likely need to fully close and reopen your terminal — nvm doesn't take effect in a window that was already open during installation.

**`node -v` shows an old or different version than expected**
Run `nvm use` while inside the project folder. If that doesn't fix it, run `nvm install 24.16.0` again to make sure that exact version is actually installed on your machine, then `nvm use` once more.

**Permission errors during `npm install` (macOS/Linux)**
This usually means Node was installed in a way that requires special permissions for every command — a sign nvm wasn't used for installation. Reinstalling Node through nvm (rather than a direct download) resolves this permanently, since nvm installs to a location your own user account already owns.

**Windows: "scripts are disabled on this system" error**
This is a default Windows security setting unrelated to Node itself. Open PowerShell as Administrator and run `Set-ExecutionPolicy RemoteSigned`, confirm with "Y," then try again.

**`npm install` seems stuck or very slow**
Usually a network/proxy issue, not a project problem. Try again on a different network if possible, or simply wait — first installs can take a few minutes depending on connection speed.

---

## 4. `.nvmrc` (added to the project specification)

A file named `.nvmrc`, placed at the root of the repository, containing exactly:

```
24.16.0
```

This single line is what makes the "same version for every developer" guarantee automatic rather than something people have to remember or be told separately — running `nvm use` in the project folder reads this file and does the right thing every time.
