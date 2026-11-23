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
   Set **Document Root** to `perfume-erp/public`.
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
- **Backups**: enable cPanel → Backup (or JetBackup) for both the **home folder** and the **MySQL database**.
  The uploaded product images and artwork are in `perfume-erp/storage/app/private`.
  Keep `perfume-erp/.env` safe: without its `APP_KEY`, customer artwork links cannot be read.
- **Email** (optional): put your cPanel email account's SMTP details into `perfume-erp/.env` (`MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`).

## Updating to a new version

1. Back up first (files and database).
2. Upload the new ZIP and extract it over the old files. Your `.env` and `storage` folder are not in the ZIP, so your data and settings stay.
3. Sign in as the owner. Database updates are applied from **Company & access → System** (coming in the next release).
   Until then, ask your host to run `php artisan migrate --force` in the `perfume-erp` folder, or use cPanel → Terminal if you have it.

## Troubleshooting

| What you see | What to do |
|---|---|
| "500 Internal Server Error" straight away | PHP version is below 8.3. Set PHP 8.3 in MultiPHP Manager. |
| A list of files instead of the app | The document root points to the wrong folder. It must be `perfume-erp/public` (Option A) or contain `index.php` from the ZIP's `public_html` (Option B). |
| "Could not connect to the database" | Check the name/user/password. Both start with your cPanel username and an underscore. The user must be added to the database with ALL PRIVILEGES. |
| Images do not upload | Increase `upload_max_filesize` and `post_max_size` to 20M in Select PHP Version → Options. |
