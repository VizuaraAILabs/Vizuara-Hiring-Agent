# Troubleshooting

## Windows CRLF Line Endings Breaking `.env` Files on Linux

**Problem:** Environment variables silently include a `\r` (carriage return) character when `.env` files are created on Windows and used on Linux.

**What happened:** The `.env.production` file was created on Windows (which uses `\r\n` line endings) and uploaded to a Linux VM. When Docker Compose or bash sources the file, each value gets an invisible `\r` appended. For example:

```
FIREBASE_PROJECT_ID=vizuara-ai-labs\r
```

Instead of:

```
FIREBASE_PROJECT_ID=vizuara-ai-labs
```

**Why it's tricky:** The `\r` character is invisible in terminal output. When you run `printenv`, it looks correct. The error messages are also misleading — Firebase said `Expected "vizuara-ai-labs" but got "vizuara-ai-labs"` which looks identical. The `\r` only showed up when we wrapped the value in `JSON.stringify()`:

```bash
docker compose --env-file .env.production exec web node -e "console.log(JSON.stringify(process.env.FIREBASE_PROJECT_ID))"
# Output: "vizuara-ai-labs\r"
```

**How to detect it:**

```bash
cat -A .env.production | head -5
# Lines ending with ^M$ have Windows line endings
# Lines ending with just $ are fine
```

**How to fix it:**

```bash
sed -i 's/\r$//' .env.production
```

**Prevention:** Always run `sed -i 's/\r$//' .env.production` in your deploy script before sourcing the file. We added this to `scripts/deploy.sh`.
