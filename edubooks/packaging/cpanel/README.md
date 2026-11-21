# Knowledge Gate — install on cPanel

**Works on hosting that has only MySQL.** Knowledge Gate comes with its own **built-in database** (PostgreSQL 16). It runs privately inside the app folder, so your host doesn't need to provide PostgreSQL. It has no network port: only the app can reach it, through a private file socket.

You'll need about 10 minutes. You do everything in your browser; no command line is needed.

## Before you start: check your hosting
| Needed | Where to see it in cPanel |
|---|---|
| **Setup Node.js App** with Node.js **20 or newer** | *Software* section |
| About **512 MB–1 GB of memory** for the app (the app plus the built-in database use about 400 MB) | Ask your host, or see *Resource Usage* |
| **2 GB of disk** + space for your book PDFs | *Disk Usage* |

MySQL is **not** used. You don't need to create any database in cPanel.

> **Ask your host first:** "May I run a Node.js app that starts its own small PostgreSQL process inside my account?" Most hosts with Node.js support allow this. A few shared hosts forbid background processes in their terms; if yours does, use a small VPS instead.

## Step 1 — Upload the files
1. cPanel → **File Manager**. Go to your home folder (**not** `public_html`).
2. **Upload** `edubooks-lms-cpanel.zip`, select it, then click **Extract**. You get a folder named `edubooks-lms`.

## Step 2 — Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | **20** or newer (22 recommended) |
| Application mode | **Production** |
| Application root | `edubooks-lms` |
| Application URL | your domain or subdomain, e.g. `lms.yourdomain.com` |
| Application startup file | `app.js` |

Click **Create**. Then click **Run NPM Install** and wait until it finishes (2–5 minutes; it also downloads the built-in database). Finally click **Restart**.

## Step 3 — Run the installer
1. Open your site, e.g. `https://lms.yourdomain.com`. The **Install Knowledge Gate** page appears.
2. You need the **installer key**: in File Manager, open `edubooks-lms/install-key.txt` and copy the text. The key stops anyone else from installing on your site before you do.
3. Fill in the form:
   - **Database:** leave **Built-in database (recommended)** selected.
   - **Publisher name, admin username and password:** these are your own account.
   - **Demo data:** tick this only for a test or sales-demo site. It creates sample schools with well-known passwords.
   - **AI:** start with *Offline drafts* if you're not sure. You can change it later.
4. Click **Check and install**. The installer checks the server first and tells you exactly what to fix if something is missing. Installation takes a few seconds.
5. Sign in at `/login` → **Publisher staff**.

The installer locks itself afterwards (`install.lock`), and `install-key.txt` is deleted.

## Step 4 — HTTPS
cPanel → **SSL/TLS Status** → make sure your domain has an **AutoSSL** certificate, and always use `https://`. Sign-in cookies are only sent over HTTPS when you installed with an `https://` address.

## Backups (automatic)
- **Every night at 2:00** (server time), the app saves a complete copy of the database to `edubooks-lms/backups/edubooks-db-<date>.tar.gz`. It keeps the last 7. The database pauses for a few seconds while the copy is made.
- **Book PDFs and uploads** are kept in `edubooks-lms/storage`. Files there are never changed once saved, so cPanel's normal backup copies them safely.
- **Download a copy off the server regularly.** Use cPanel → **Backup** → *Download a Home Directory Backup*, or download the newest file from `backups/` with File Manager. This is your protection if the server itself fails.
- Settings in `.env`: `BACKUP_HOUR` (0–23, or `off`), `BACKUP_KEEP` (how many to keep).

## Restore a backup
1. In File Manager, create a folder `edubooks-lms/restore` (if it doesn't exist).
2. Copy **one** backup file (`edubooks-db-….tar.gz`) into it.
3. Setup Node.js App → **Restart**.

The app restores that backup while it starts. It keeps your current database as `pgdata-before-restore-…`, in case you need it, and renames the file in `restore/` to `restored-….done`. If anything goes wrong, the previous database is put back automatically. Once you're happy, you can delete the `pgdata-before-restore-…` folder.

## Updating to a new version
**Super admin → Updates** (in the left menu):
1. Upload the update file (`edubooks-lms-update.zip`, a few MB) or paste a download link. The package is unpacked and checked; nothing changes yet.
2. Check the summary (new version, number of database changes) and click **Install update**. Confirm with your password.
3. The app makes a **safety backup** of the database, installs the new program, restarts and **applies the database changes automatically**. This takes about a minute. The page shows the result.

If the new version cannot start, for example because a database change fails, the **previous version is restored automatically**. Database changes are all-or-nothing, so a failed change leaves the database exactly as it was.
**Roll back** returns to the previous version and restores the database from the backup made just before that update. Changes made after that update are lost, and everyone has to sign in again.
If the small update file is refused with "needs new program libraries", upload the full `edubooks-lms-public_html.zip` instead.

If the site itself does not open, you can still update the old way: extract the full zip into `public_html` and open `/index.php`.

## Settings
After installation, all settings are in `edubooks-lms/.env` (File Manager → Edit). Restart the app after any change.

| Setting | Meaning |
|---|---|
| `AI_PROVIDER` | `offline`, `anthropic` (with `AI_API_KEY`) or `openai-compatible` (with `AI_BASE_URL`, `AI_MODEL`) |
| `AI_MONTHLY_REQUESTS_PER_SCHOOL` | AI limit per school per month (default 1000) |
| `MAX_UPLOAD_MB` | Largest file upload (100). If large PDFs fail, your host's web server may have a lower limit; ask support to raise *LimitRequestBody*. |
| `SESSION_IDLE_MINUTES` | Sign out after this much inactivity (720 = 12 hours) |

Keep `.env` private. It contains the database passwords. **Never delete or edit the `pgdata` folder**: it is the live database.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Packages are missing", or "Built-in PostgreSQL is not installed" | Setup Node.js App → **Run NPM Install** → **Restart** |
| "The app runs as root" | Only on a self-managed server: run the app as a normal user. cPanel never runs apps as root. |
| "Built-in database cannot run on this server" | Your host blocks running programs from your home folder. Ask support, or use a VPS. |
| Page says "could not start" | Check `edubooks-lms/stderr.log` (the path is shown in Setup Node.js App) and `edubooks-lms/logs/postgres.log`. Then Restart. |
| Very slow, or the app keeps restarting | Your plan is short of memory. Ask for at least 1 GB for the Node.js app. |
| The host stopped the database process | Nothing to do: the app notices within 30 seconds and starts it again. |

## Already have PostgreSQL?
If your hosting *does* offer PostgreSQL 13+, you can choose **My hosting's PostgreSQL** in the installer instead. Create a database and one extra user in cPanel → PostgreSQL Databases. Enter your **main cPanel username** as the *owner user* and the extra user as the *app user*. With this option, use cPanel → Backup to back up the database.

## Limits of shared hosting
This is fine for getting started, demos and a modest number of schools (a few hundred pupils online at the same time). For many schools at once, a VPS with the Docker setup is faster and adds virus scanning of uploads and OCR for scanned books. To move, take a backup file from `backups/`. It contains a standard PostgreSQL 16 data folder that any PostgreSQL 16 server can start from.
