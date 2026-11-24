# Installing Atelier Perfume ERP on cPanel

No SSH or terminal is needed. Total time: about 15 minutes.

## Before you start

1. **cPanel → MultiPHP Manager**: set your domain (or subdomain) to **PHP 8.3** or newer.
2. **cPanel → Select PHP Version → Extensions**: make sure these are ticked:
   `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `fileinfo`, `gd`, `zip`.
3. **cPanel → MySQL Databases**:
   - Create a new database (for example `youruser_erp`).
   - Create a new user with a strong password. Avoid the single quote character `'` in it.
   - "Add User To Database" and tick **ALL PRIVILEGES**.
   - Note down the database name, user name and password.
4. **cPanel → SSL/TLS Status**: make sure the domain has an SSL certificate (https). Customer artwork links need https.

## Option A: ERP on a subdomain (recommended)

Example: `erp.yourcompany.com`.

1. **File Manager** → your home folder (the one that contains `public_html`).
   Upload `atelier-erp-cpanel-….zip` and **Extract** it.
   You now have a folder `perfume-erp` next to `public_html`.
2. **cPanel → Domains → Create a New Domain** (or Subdomains): `erp.yourcompany.com`.
   Set **Document Root** to `perfume-erp/public`. (If it points to `perfume-erp` instead, the ERP still
   works and keeps its private files hidden, but `perfume-erp/public` is the cleaner setting.)
3. Delete the extracted `public_html` folder from the ZIP if it was created inside your home folder (Option A does not use it). Do **not** delete your real website's `public_html`.
4. Open `https://erp.yourcompany.com` and continue with "Run the installer" below.

## Option B: ERP on the main domain

Use this only when the main domain is used for nothing else.

1. Upload and extract the ZIP in your home folder, as above.
2. Move everything **inside** the extracted `public_html` folder into your real `public_html`
   (including the hidden `.htaccess` file: File Manager → Settings → "Show Hidden Files").
3. `perfume-erp` must stay **outside** `public_html`.

## Run the installer

1. Open the website. The installation page appears and checks the server.
   Fix any red ✗ line using the hint shown under it, then reload.
2. **Install code**: in File Manager open `perfume-erp/storage/app/private/install-code.txt`
   and copy the 8-character code. This proves you own the server.
3. Choose **MySQL**, enter host `localhost`, port `3306`, and the database name, user and password from step 3.
4. Enter your company name, currency and your owner account (password at least 12 characters).
   Tick "demo products" only if you want fictional sample data to practise with.
5. Click **Install**. When it finishes, the sign-in page opens and the installer closes itself for good.

## After installation

- **Folder permissions**: folders 755, files 644. `perfume-erp/.env` should be 600 (it holds the database password).
- **Backups**:
  - Sign in as the owner → **Company & access → System → Download backup now** gives you a ZIP of the database and uploaded files.
  - **Automatic daily backup**: cPanel → **Cron Jobs** → "Once Per Day" → paste the command shown in the System panel
    (it looks like `php /home/youruser/perfume-erp/artisan erp:backup-auto`). The newest 14 backups are kept in `perfume-erp/storage/app/backups`.
  - Also keep cPanel → Backup (or JetBackup) switched on for the home folder and the MySQL database.
  - Keep `perfume-erp/.env` safe: it is not in the backup, and without its `APP_KEY` customer artwork links cannot be read.
- **Restoring a backup**: cPanel → phpMyAdmin → choose the (empty) ERP database → Import → `database.sql` from the backup ZIP.
  Copy the backup's `private` folder to `perfume-erp/storage/app/private`.
- **Email** (optional): put your cPanel email account's SMTP details into `perfume-erp/.env` (`MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`).

## First settings after installing

Sign in as the owner and open **Company & access → Edit company**:

- Company name, address, phone, email and currency (AED).
- **TRN** and **VAT registered: Yes** if your company is registered for VAT. Invoices then print as
  *TAX INVOICE / فاتورة ضريبية* with a VAT summary, and POS receipts as *Simplified Tax Invoice*.
- **Company name and address in Arabic** for the bilingual invoices.
- Logo, brand colour and the invoice footer (bank details, thanks).
- **Stock leaves in this order:** FIFO, or FEFO if you track expiry dates (expired lots are then never sold).

Each person can switch the interface between **English and العربية** from the menu (Language).
Give products an **Arabic name** (Catalogue → Edit product) so it prints under the English name on invoices.

## Look and feel

Click **Theme** at the bottom of the menu to choose Light, Dark, Auto, Obsidian, Maison or Oud. Each
computer or phone remembers its own choice. Fonts are included in the package, so nothing is loaded
from the internet. After updating from an older version, click **Apply update** in Company & access →
System: this also adds the note pyramids and new references to the inspiration library.

## Two-step sign-in (recommended for owner and managers)

1. Click your name at the bottom of the menu → **Set up two-step sign-in**.
2. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator,
   Authy…), type the 6-digit code and save the 8 recovery codes somewhere safe.
3. From then on, signing in asks for the password and then a code from the app.

Lost phone: sign in with one recovery code (each works once), then switch off and set up
again. The owner can also reset a manager's two-step sign-in in **Company & access → Team
access**. If the owner has lost both the phone and the recovery codes, run once in cPanel →
Terminal (or as a one-time cron job):

```bash
php /home/USER/perfume-erp/artisan erp:two-factor-off owner@example.com
```

## Updating to a new version

1. **Company & access → System → Download backup now.**
2. Upload the new ZIP and extract it over the old files. Your `.env` and the data in `storage` are not in the ZIP, so your settings and files stay.
3. Sign in as the owner → **Company & access → System**. If it shows "database update waiting", click **Apply update** and confirm with your password.

## Troubleshooting

| What you see | What to do |
|---|---|
| "403 Forbidden" on every page, including /install | Packages before 0.8.1 blocked the `perfume-erp/public` folder. Delete the old `perfume-erp` folder (if you have not installed yet) or extract the 0.8.1 ZIP over it. Also check the domain's Document Root is `perfume-erp/public` (Option A) or your `public_html` (Option B). |
| "500 Internal Server Error" straight away | PHP version is below 8.3. Set PHP 8.3 in MultiPHP Manager. |
| A list of files instead of the app | The document root points to the wrong folder. It must be `perfume-erp/public` (Option A) or contain `index.php` from the ZIP's `public_html` (Option B). |
| "Could not connect to the database" | Check the name/user/password. Both start with your cPanel username and an underscore. The user must be added to the database with ALL PRIVILEGES. |
| Images do not upload | Increase `upload_max_filesize` and `post_max_size` to 20M in Select PHP Version → Options. |
