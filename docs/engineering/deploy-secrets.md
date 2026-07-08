# Production Deploy Secrets

The GitHub Actions deploy workflow in `.github/workflows/deploy.yml` uses the `Production` environment secrets to SSH into the production GCP VM and run the same deploy commands used manually:

```bash
cd "$GCP_APP_DIR"
git pull origin main
bash scripts/deploy.sh
```

Add these values in GitHub:

```text
Repository -> Settings -> Environments -> Production -> Environment secrets
```

Do not commit these values to the repository.

## GCP_VM_HOST

**What it is:** The public address GitHub Actions uses to reach the GCP VM over SSH.

**How to get it:** In GCP Console, open:

```text
Compute Engine -> VM instances -> External IP
```

Use the external IP address or a domain name that points to that VM.

Example:

```text
34.93.xxx.xxx
```

or:

```text
hire.example.com
```

**Important:** Do not use the internal VM IP, such as `10.x.x.x`. GitHub Actions runs outside your GCP private network and cannot SSH to the internal address.

**Why it is needed:** The deploy workflow needs a network destination for the SSH connection.

## GCP_VM_USER

**What it is:** The Linux user GitHub Actions should log in as on the VM.

**How to get it:** SSH into the VM and run:

```bash
whoami
```

The output is the value for `GCP_VM_USER`.

You can also read it from the shell prompt. For example:

```bash
teamvizuara@arc-2-20260228-064451:~$
```

means:

```text
GCP_VM_USER=teamvizuara
```

**Why it is needed:** SSH authentication is tied to a user account. The workflow must log in as a user that can access the app directory, run `git pull`, and run `bash scripts/deploy.sh`.

## GCP_VM_SSH_KEY

**What it is:** The private SSH key GitHub Actions uses to authenticate to the VM.

**How to get it:** Use a dedicated deploy key rather than a personal everyday SSH key.

Create a key on your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f github-actions-gcp
```

This creates:

```text
github-actions-gcp      # private key
github-actions-gcp.pub  # public key
```

Add the public key to the VM user:

```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
```

Paste the contents of `github-actions-gcp.pub` on a new line, then set permissions:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Add the private key contents to GitHub as `GCP_VM_SSH_KEY`. Include the full block:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Before relying on GitHub Actions, test the key locally:

```bash
ssh -i github-actions-gcp GCP_VM_USER@GCP_VM_HOST
```

Replace `GCP_VM_USER` and `GCP_VM_HOST` with the real values.

**Why it is needed:** GitHub Actions needs non-interactive SSH access. The private key proves to the VM that the workflow is allowed to log in.

## GCP_APP_DIR

**What it is:** The absolute path to this repository on the production VM.

**How to get it:** SSH into the VM, go to the project directory, and run:

```bash
pwd
```

Example:

```text
/home/teamvizuara/Vizuara-Hiring-Agent
```

or:

```text
/opt/vizuara-hiring-agent
```

**Why it is needed:** The deploy workflow must run `git pull origin main` and `bash scripts/deploy.sh` from the repository root. Using an explicit path avoids depending on the SSH user's default login directory.

## Quick Verification

After adding all four secrets, manually run the workflow from GitHub:

```text
Actions -> Deploy -> Run workflow
```

If the workflow succeeds, future pushes to `main` will deploy automatically.

If it fails, check these first:

- `GCP_VM_HOST` is the external IP or public domain, not the internal IP.
- `GCP_VM_USER` matches `whoami` on the VM.
- `GCP_VM_SSH_KEY` is the private key, not the `.pub` key.
- The public key is present in `~/.ssh/authorized_keys` for `GCP_VM_USER`.
- `GCP_APP_DIR` points to the repository root and contains `scripts/deploy.sh`.
