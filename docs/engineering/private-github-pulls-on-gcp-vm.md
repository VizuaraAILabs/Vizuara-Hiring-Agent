# Pulling Private GitHub Changes on a GCP VM

Use a GitHub deploy key when the production VM only needs to pull from one private repository. A deploy key is an SSH key attached directly to a single GitHub repository, so the VM can read that repository without making it public and without storing a personal GitHub token on the server.

## Why This Approach

- The repository stays private.
- Access is scoped to one repository instead of a whole GitHub account.
- The key can be read-only, which is the safest mode for a production VM.
- The key can be revoked from GitHub at any time without affecting a developer account.

Avoid putting a personal access token on the VM unless HTTPS is required for a specific reason. A token often has broader account-level permissions and is easier to misuse accidentally.

## 1. Create a Deploy Key on the VM

Run this command on the GCP VM:

```bash
ssh-keygen -t ed25519 -C "gcp-vm-vizuara-hiring-agent" -f ~/.ssh/github_deploy_key
```

What each part does:

- `ssh-keygen` starts the OpenSSH key-generation tool.
- `-t ed25519` tells it to create an Ed25519 key, which is modern, compact, and well supported by GitHub.
- `-C "gcp-vm-vizuara-hiring-agent"` adds a comment to the public key. This does not affect authentication; it makes the key recognizable later in GitHub or on disk.
- `-f ~/.ssh/github_deploy_key` writes the key pair to this path instead of the default `~/.ssh/id_ed25519`.
- `~` means the current Linux user's home directory.
- `.ssh` is the conventional directory for SSH keys and config.
- `github_deploy_key` is the private key file. Keep this file secret.
- `github_deploy_key.pub` is the public key file created beside it. This is the file you paste into GitHub.

Reasoning:

Using a dedicated filename avoids mixing this production deploy key with any personal SSH keys that may already exist on the VM. The key should identify the machine and purpose, not a human developer.

## 2. Copy the Public Key

Run this command on the VM:

```bash
cat ~/.ssh/github_deploy_key.pub
```

What each part does:

- `cat` prints the contents of a file to the terminal.
- `~/.ssh/github_deploy_key.pub` is the public half of the deploy key.
- The `.pub` suffix means this key is safe to share with GitHub.

Reasoning:

GitHub needs the public key so it can recognize the VM during SSH authentication. The private key stays on the VM and is never pasted into GitHub, Slack, docs, or tickets.

## 3. Add the Key to GitHub

In GitHub, open the private repository and go to:

```text
Repository -> Settings -> Deploy keys -> Add deploy key
```

Fill the form like this:

```text
Title: GCP VM Vizuara Hiring Agent
Key: paste the full contents of ~/.ssh/github_deploy_key.pub
Allow write access: unchecked
```

What each line means:

- `Title` is a human-readable label shown in GitHub. Use something that identifies the VM and project.
- `Key` is the public key printed by the `cat` command.
- `Allow write access: unchecked` keeps the key read-only.

Reasoning:

The VM only needs to pull code. It should not be able to push commits or tags back to GitHub. Read-only access limits the damage if the VM is ever compromised.

## 4. Tell SSH Which Key to Use for GitHub

Open the SSH config file on the VM:

```bash
nano ~/.ssh/config
```

What each part does:

- `nano` opens a terminal text editor.
- `~/.ssh/config` is the per-user SSH client configuration file.
- If the file does not exist, `nano` will create it when you save.

Add this block:

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy_key
  IdentitiesOnly yes
```

What each line does:

- `Host github.com` defines settings SSH should use when a command connects to `github.com`.
- `HostName github.com` tells SSH the real server hostname to connect to.
- `User git` tells SSH to log in as the `git` user. GitHub SSH access always uses this username.
- `IdentityFile ~/.ssh/github_deploy_key` tells SSH to use the private deploy key created earlier.
- `IdentitiesOnly yes` tells SSH to offer only the configured key for this host.

Reasoning:

Without this config, SSH may try the wrong key first or offer many keys. Explicit configuration makes `git pull` predictable and avoids confusing permission failures.

## 5. Test GitHub SSH Access

Run this command on the VM:

```bash
ssh -T git@github.com
```

What each part does:

- `ssh` starts an SSH connection.
- `-T` disables interactive terminal allocation because GitHub only needs to authenticate the key.
- `git@github.com` connects to GitHub as the `git` SSH user.

Reasoning:

This confirms the VM can authenticate to GitHub before changing Git remotes or pulling code. A successful response usually says GitHub authenticated the key but does not provide shell access. That is expected.

## 6. Make Sure the Repository Uses the SSH Remote

From inside the checked-out repository on the VM, run:

```bash
git remote -v
```

What each part does:

- `git` runs the Git command-line tool.
- `remote` manages the named URLs Git uses for fetches and pushes.
- `-v` means verbose, so Git prints the actual URLs for each remote.

If the `origin` URL starts with `https://`, change it to SSH:

```bash
git remote set-url origin git@github.com:OWNER/REPO.git
```

What each part does:

- `git remote set-url` updates the URL for an existing remote.
- `origin` is the conventional name for the main remote repository.
- `git@github.com:OWNER/REPO.git` is the SSH form of the GitHub repository URL.
- `OWNER` should be replaced with the GitHub user or organization name.
- `REPO` should be replaced with the repository name.
- `.git` is the conventional suffix for a Git repository URL.

Reasoning:

Deploy keys work through SSH. If the remote uses HTTPS, Git will ask for token-based credentials instead and ignore the SSH deploy key.

## 7. Pull New Changes Safely

From inside the repository on the VM, run:

```bash
git fetch origin
```

What each part does:

- `git fetch` downloads commits, branches, and tags from a remote without changing the checked-out working tree.
- `origin` tells Git to fetch from the main GitHub remote.

Reasoning:

Fetching first lets you verify that GitHub access works and inspect incoming changes before updating the running checkout.

Then update the production branch:

```bash
git pull --ff-only origin main
```

What each part does:

- `git pull` fetches changes and integrates them into the current branch.
- `--ff-only` allows the pull only if Git can fast-forward the current branch.
- `origin` is the remote to pull from.
- `main` is the branch to pull.

Reasoning:

`--ff-only` is important on servers because it prevents accidental merge commits on the VM. If the VM has local commits or conflicting changes, the command stops instead of creating messy production history.

If production uses a different branch, replace `main` with that branch name:

```bash
git pull --ff-only origin production
```

What changes:

- `production` is the branch being pulled instead of `main`.

Reasoning:

The VM should track the branch that represents deployable production code.

## Recommended Production Pull Sequence

Use this sequence when manually updating the VM:

```bash
cd /path/to/Vizuara-Hiring-Agent
git fetch origin
git pull --ff-only origin main
```

What each command does:

- `cd /path/to/Vizuara-Hiring-Agent` moves the shell into the application repository.
- `git fetch origin` downloads the latest GitHub state without changing files yet.
- `git pull --ff-only origin main` updates the checked-out branch only if Git can do it cleanly.

Reasoning:

This sequence is simple, repeatable, and conservative. It avoids public repositories, avoids personal credentials, and avoids accidental merge commits on the VM.

## Operational Notes

- Keep `~/.ssh/github_deploy_key` private and readable only by the VM user that runs deployments.
- Do not commit deploy keys into this repository.
- Do not paste the private key into `.env.production`.
- Revoke the deploy key from GitHub if the VM is replaced or compromised.
- Use one deploy key per repository. GitHub deploy keys are intentionally scoped this way.
