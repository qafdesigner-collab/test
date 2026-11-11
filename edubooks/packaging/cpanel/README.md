# EduBooks LMS — install on cPanel

You'll need about 15 minutes. You do everything in your browser; no command line is needed.

## Before you start: check your hosting
Your cPanel must have:

| Needed | Where to see it in cPanel |
|---|---|
| **Setup Node.js App** with Node.js **20 or newer** | *Software* section |
| **PostgreSQL Databases**, version **13 or newer** | *Databases* section |
| About **1 GB of memory** for the app and **2 GB of disk** + space for your book PDFs | Ask your host |

Most hosts only offer MySQL. **EduBooks needs PostgreSQL**: it uses PostgreSQL's row-level security to keep every school's data separate. If you don't see *PostgreSQL Databases*, ask your host to enable it, or use a VPS (see `DEPLOYMENT.md` in the source code for the Docker setup).

Optional, if your host offers them (ask support):
- the PostgreSQL **pgvector** extension, which gives smarter AI search,
- the **tesseract-ocr** and **poppler-utils** programs, which read scanned (image-only) PDF pages.

Everything else works without them.

## Step 1 — Create the database
cPanel → **PostgreSQL Databases**:
1. **Create New Database**, e.g. `edubooks` (cPanel shows it as `youruser_edubooks`).
2. **Add New User** twice, each with its own strong password:
   - `owner` → `youruser_owner` (owns the tables)
   - `app` → `youruser_app` (what the website uses day to day)
3. **Add User to Database** for **both** users, with **ALL PRIVILEGES**.

On newer PostgreSQL versions (15+), an added user may not be allowed to create tables. The installer checks this. If it reports the problem, enter your **main cPanel username and password** as the *owner user* instead: the main account owns the database. Keep `youruser_app` as the *app user*.

Why two users? The app user is not the owner of the tables, so PostgreSQL's row-level security always applies to it. Even if there were a bug in the code, one school could not see another school's data.

## Step 2 — Upload the files
1. cPanel → **File Manager**. Go to your home folder (**not** `public_html`).
2. **Upload** `edubooks-lms-cpanel.zip`, select it, then click **Extract**. You get a folder named `edubooks-lms`.

## Step 3 — Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | **20** or newer (22 recommended) |
| Application mode | **Production** |
| Application root | `edubooks-lms` |
| Application URL | your domain or subdomain, e.g. `lms.yourdomain.com` |
| Application startup file | `app.js` |

Click **Create**. Then click **Run NPM Install** and wait until it finishes (2–5 minutes). Finally click **Restart**.

## Step 4 — Run the installer
1. Open your site, e.g. `https://lms.yourdomain.com`. The **Install EduBooks LMS** page appears.
2. You need the **installer key**: in File Manager, open `edubooks-lms/install-key.txt` and copy the text. The key stops anyone else from installing on your site before you do.
3. Fill in the form:
   - **Database:** host `localhost`, port `5432`, the database name and both users from Step 1.
   - **Publisher name, admin username and password:** these are your own account.
   - **Demo data:** tick this only for a test or demo site.
   - **AI:** start with *Offline drafts* if you're not sure. You can change it later.
4. Click **Check and install**. The installer checks everything first and tells you exactly what to fix if something is missing. Then it creates the tables and your account.
5. Sign in at `/login` → **Publisher staff**.

The installer locks itself afterwards (`install.lock`), and `install-key.txt` is deleted.

## Step 5 — HTTPS
cPanel → **SSL/TLS Status** → make sure your domain has an **AutoSSL** certificate. Always use `https://`. Sign-in cookies are only sent over HTTPS when you installed with an `https://` address.

## Backups
- cPanel → **Backup** → download a **PostgreSQL database backup** of your database, and a **Home Directory** backup (this includes `edubooks-lms/storage`, where the book PDFs and uploads are kept).
- Do this at least weekly, and before every update. Keep a copy off the server.
- If your host offers **JetBackup** or automatic backups, make sure they include PostgreSQL databases.

## Updating to a new version
1. Back up first (see above).
2. In Setup Node.js App, click **Stop App**.
3. Upload the new zip and extract it **over** the existing folder. Your `.env`, `install.lock` and `storage` folder are kept, because the zip does not contain them.
4. Click **Run NPM Install**, then **Restart**. New database changes are applied automatically when the app starts.

## Settings
After installation, all settings are in `edubooks-lms/.env` (open it with File Manager → Edit). Restart the app after any change. Useful ones:

| Setting | Meaning |
|---|---|
| `AI_PROVIDER` | `offline`, `anthropic` (with `AI_API_KEY`) or `openai-compatible` (with `AI_BASE_URL`, `AI_MODEL`) |
| `AI_MONTHLY_REQUESTS_PER_SCHOOL` | AI limit per school per month (default 1000) |
| `MAX_UPLOAD_MB` | Largest file upload (100). Your host's web server may also limit uploads; if large PDFs fail, ask support to raise *LimitRequestBody*. |
| `SESSION_IDLE_MINUTES` | Sign out after this much inactivity (720 = 12 hours) |

Keep `.env` private. It contains your database passwords.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Packages are missing" in the installer | Setup Node.js App → **Run NPM Install** → **Restart** |
| Page says "could not start" | Check the log: Setup Node.js App shows the path (often `edubooks-lms/stderr.log`). Fix the setting it mentions in `.env`, then Restart. |
| "Extension citext / pgcrypto could not be enabled" | Ask your host: *"Please run `CREATE EXTENSION citext; CREATE EXTENSION pgcrypto;` in my database youruser_edubooks."* Then run the installer again. |
| "PostgreSQL 13 or newer is needed" | Ask your host to upgrade, or use a VPS. |
| Large PDF uploads fail | Lower the file size, or ask your host to raise the upload limit. |
| Very slow, or the app keeps restarting | Your plan is short of memory. Ask for at least 1 GB for the Node.js app. |

## Limits of shared hosting
cPanel is fine for getting started, demos and a modest number of schools. For many schools at once, a VPS with the Docker setup is faster and supports automatic daily backups, ClamAV virus scanning and OCR. Your data moves over with a normal PostgreSQL backup and restore.
