# What's new in Knowledge Gate 1.3.5

## Live whiteboard (Teacher → Whiteboard)
- **Start a whiteboard** for a class on a **blank board** or on **a page of your book** (also from the book reader: the new whiteboard button teaches the page you are on).
- Write with the **pen**, **highlighter**, **text** and **eraser**, in 7 colours and 4 sizes; **undo**, **clear** and **turn pages**.
- Pupils of the class see a **“Live whiteboard — Watch”** banner on their home page and follow everything you write within about a second. When you **End lesson**, they can still look at the board.
- Works on normal cPanel hosting (no extra server needed).

## Assessment sheets by topic, with AI help (Teacher → Assessments)
- Pick the **book and lesson** (the topic), then add questions yourself, from the question bank, or with **✨ Ask AI for questions** (choose how many, the level and the kind; tick the ones you want).
- **Print sheet** gives a branded A4 sheet with name, roll number and date lines; **Answer key** prints the answers. Or save and publish it to the class online.

## Checked and tidied
- Every page was checked for every role on a laptop and on a phone: no sideways scrolling, nothing cut off.
- On phones the book reader opens on the page (contents on the ☰ button); Sales figures fit; UAE phone examples everywhere.

# What's new in Knowledge Gate 1.3.4

## A colourful look for every portal, in calmer colours
- **Super admin and Sales** (publisher area) now have the colourful sidebar with coloured icons, in navy-indigo. The dashboard has a welcome banner, picture tiles and six quick buttons (Books, Products, Schools, Orders, Users, Games). The Sales page shows the revenue in a banner with the date range.
- **School admin** uses a teal theme, **Teacher** a soft violet one, so each portal is easy to recognise. All colours were toned down: still bright, but easier on the eyes.
- **Teacher:** floating doodles in the banner, a **My week** chart (lessons per day, today highlighted) and a **Tip of the day** sticky note with a new teaching idea every day.
- **Pupils:** softer colours for the big buttons and the banner, and a new **My star path** — stepping stones to the next level, with the owl standing where the child is now.

# What's new in Knowledge Gate 1.3.3

## Super admin → Users: every school's accounts, and "Log in as"
- A new **Users** page shows **one folder per school** (with how many school admins, teachers, students and parents it has).
- Open a folder to see its **School admins**, **Teachers**, **Students** and **Parents** (search by name, login ID or email).
- Click **Log in as admin / teacher / student / parent** to open the portal exactly as that person sees it — useful for support and for checking what a class sees.
- A yellow bar at the top shows whose account you are using, with **Back to …** to return to your own account. The visit ends by itself after 2 hours.
- Their password is never shown or changed (changing a password is blocked while you are signed in as them), and every "Log in as" is recorded in the **Audit Log**. Only the super admin can do this; suspended accounts and suspended schools cannot be opened.

# What's new in Knowledge Gate 1.3.2

- **More reliable updates on shared hosting.** Some hosts keep several copies of the app running and do not restart all of them after an update, so the Updates page could stay on "Restarting with the new version". Now every copy notices a newly installed version within about 20 seconds and restarts itself, the update confirms itself as soon as the new version runs, and a check that never reports back is resolved automatically (finished, or a clear message) instead of spinning.
- The Updates page keeps checking for the result even after you reload it, and after 3 minutes it tells you what to do (cPanel → Setup Node.js App → Restart).

# What's new in Knowledge Gate 1.3.1

Install with the full zip (`edubooks-lms-public_html.zip`) through **Super admin → Updates**. The database is updated automatically.

## Colourful teacher and school-admin portals
- **Teacher home:** a purple sidebar with coloured icons, a greeting banner with **today's lessons** (the current one highlighted, live lessons marked), tiles for pupils, work to mark, today's attendance and stars, six big buttons (Take register, Set homework, Plan a lesson, Ask the AI, Assign a game, Make an exam), colourful **class cards** (pupils, average, how many need help), a **To mark** list, **Pupils who need a little help** with a *Message parent* button, and **My books** on a shelf with a tip for the next lesson.
- **School admin home:** the same look, with today's registers, classes, licences ending soon, free pupil seats and quick buttons (Add pupils, Add teachers, Give books, Send a message, Timetable, Exams). Everything else in the school area also uses the new sidebar.

## Book parts: choose, rename, remove
- **New book:** tick only the parts the book has (how many Student Book parts, Homework Book, Teacher Guide, Flashcards, Teacher Cards, Danglers, CD, Mobile App).
- **Later:** in Book structure, hover a part to **rename, move or remove** it, and use **Add part** for anything you left out. This also works on **published** editions (units, lessons and page ranges stay locked). Removing a part asks first and tells you what goes with it.
- **Only what you upload is shown:** teachers and pupils see a part only when it has something in it (pages, a flipbook or CD, the app, or resources). Empty parts stay hidden until you upload.

## Bulk add teachers and pupils (only the name is required)
- **Teachers → Bulk import (Excel)** and **Students → Bulk import (Excel)**: one person per row; only **Name** is required. Optional columns: **Designation**, **Email**, **Mobile**, **Login ID**, **Password** (pupils also: class, section and parent details). Download the template from the import window.
- Everyone without a login ID gets one made automatically, with a simple password; the logins (and printable QR cards) are shown once after the import.
- **Sign in with login ID or email:** on the sign-in page people type the school code, then their **login ID or their email** and password.
- **Add teachers / Add students** also has Designation (teachers) and Email fields, and the ✏️ button on each person edits name, designation, email and mobile.

# What's new in Knowledge Gate 1.3

## Company & currency (Super admin → Company & Currency)
- **Currency:** the main currency is now the **UAE dirham (AED)**, and amounts are also shown in **US dollars** (≈ USD) using your exchange rate (default: the official peg, 1 USD = 3.6725 AED). You can choose other currencies, or switch the second one off. Product prices are entered in the main currency; the old per-product “PKR” box is gone.
- **Tax:** VAT rate (5% by default), TRN and payment details (bank, IBAN) for invoices.
- **Company details:** legal name, licence number, address, phone, WhatsApp, email, website, about text and social links. They appear on the sign-in page (you can turn this off), on a new **Our publisher** page for schools and teachers, and on quotations and invoices.
- **Company documents:** upload your company profile, brochures, catalogues, price lists and certificates (PDF, Word, Excel, PowerPoint or images, up to 50 MB). For each one choose who sees it: everyone (also linked on the sign-in page), schools, or your staff only.
- **Region:** UAE calling code +971 (so 050 123 4567 becomes +971 50 123 4567 for WhatsApp/SMS) and the Dubai time zone.
- **Quotations and invoices:** on any order, **Print quotation** (draft orders) or **Print invoice** (confirmed orders) with your logo, company details, TRN, VAT and the total in AED and USD.
- **Book cover mockups:** in Book Packages, click the cover square of a book to upload its cover image (PNG, JPG or WebP). It is shown on the pupils' bookshelf, in the teachers' library and in your book list.
- **CD and Mobile App parts:** every new book gets a **CD** part (upload the CD's Flash `.swf` or a zip of the CD folder; it plays in the browser) and a **Mobile App** part (upload the Android `.apk` and/or add Google Play and App Store links). Pupils open the Mobile App part in the book and **scan a QR code** with their phone to install the app. For older books, add the parts with **Add component** while the edition is a draft.
- **Content protection (on by default):** pupils and parents — and, unless you turn it off, teachers — can only **view** book pages, flipbooks, CDs, flashcards and resources inside the platform: no downloading, no right-click, no copying, no printing. Each page carries a faint watermark with the reader's name and school, and the page is covered when Print Screen is pressed or the window loses focus. The mobile app is the only thing pupils can download. Settings: Company & Currency → Content protection. Note: no website can completely stop screenshots or a phone camera; the watermark makes copies traceable.
- **New pupil home:** a sky full of clouds and stars, levels from stars, three daily goals, a 3D "continue reading" book with the real cover, and wooden bookshelves.
- **Flipbooks:** besides `index.html`, a flipbook zip may now open from `start.html`, `default.html` or `main.html`, also inside a folder.

# Knowledge Gate 1.2.1

## Demo data you can load and remove
**Super admin → Demo data → Load demo data** fills your site with sample content to try every feature:
3 demo schools (codes **DEMO1**, **DEMO2**, **DEMO3**) with a school admin, teacher, pupils and a parent; 5 sample books marked “(Demo)”;
products, orders and licences; games; a class with homework, attendance, a timetable, an exam with results, messages, announcements and a live lesson; and a training course.
The page lists the demo sign-ins (for example school **DEMO1**, user **student1**, password **Student@123**).

When you are done, **Remove all demo data** (type REMOVE to confirm) deletes all of it in one go. Your real schools, books, users and settings are not touched.
If a real school has started using a demo item — for example ordered a demo product — nothing is removed and the page tells you which school, so you can fix that first.

# Knowledge Gate 1.2

Install with the full zip (`edubooks-lms-public_html.zip`) through **Super admin → Updates**. The database is updated automatically.

## Exams and question papers
- Teachers and school admins: **Exams → New exam**. Build the paper by typing questions (including long answers with writing lines), picking from the question bank, or **Make a paper for me** (picks questions by type and number, e.g. 10 multiple-choice + 5 short).
- **Print paper**, **Version B** (same questions in a different order) and **Answer key**, with your logo.
- **Marks & results**: type marks quickly (Enter moves to the next pupil), mark absentees, see the average. **Publish results** puts them on report cards and tells pupils and parents.

## Messages, announcements and live lessons
- **Parent messages**: parents write to their child's teachers and the school office from the parent portal (💬 Messages). Teachers and admins answer under **Messages**. The school admin can read every conversation (read only) for safeguarding. Pupils have no chat.
- **Announcements** to one class or the whole school, for pupils, parents or both. Can be pinned.
- **Live lessons**: paste a Zoom / Google Meet / Teams link and a time. Pupils and parents see a **Join** button from 10 minutes before. Timetable lessons can also carry an online link.

## Ask Owl — AI reading helper for pupils
- In the book reader, pupils tap **🦉 Ask Owl**: *Explain this page*, *Ask a question* or *Quiz me*.
- Owl only uses the book's own pages, uses simple words, gives no links, never asks for personal details, and sends unsafe topics to a trusted grown-up.
- **Off until the school admin turns it on** (School → Ask Owl), with a daily limit per pupil. Teachers see every question; flagged ones are marked for a gentle check-in.
- Works without an AI key (it shows the matching sentences from the book). With an AI key, answers count towards the school's monthly AI limit. To switch it off for all schools, set `AI_TUTOR=off` in `.env`.

# Knowledge Gate 1.1

Install with the **full** zip (`edubooks-lms-public_html.zip`) through **Super admin → Updates**. The small update zip is refused because new program libraries were added. The database is updated automatically.

## For the publisher
- **Branding** — your logo, name, tagline and main colour on the sign-in page, every portal, login cards, report cards and certificates (Publisher → Branding).
- **Sales** — revenue by month, city, product and school, plus follow-up lists: licences ending in 60 days, licences not renewed, schools using few of their seats, and demo schools (Publisher → Sales).
- **Usage Insights** — how actively each school reads, plays and hands in homework; most-read books and most-played games.
- **Teacher Training** — build short courses from YouTube/Vimeo videos, reading, links and quizzes. Teachers get a printable certificate; you see who finished.
- **Messages** — WhatsApp/SMS sending status and a test button.
- **Page hotspots** — open a book part in the reader (Book → part → ✏️ Hotspots), drag a box on the page and attach a note, read-aloud text, video, link or game. Children tap it while reading.
- **Three new games** — Spelling bee, Sentence builder and Listen & choose.

## For schools
- **Excel import** of pupils with their class, section and parent phone; **QR login cards** for printing.
- **Parent accounts and parent portal** — homework, marks, teacher comments, reading, attendance and the timetable for each child.
- **Attendance** — teachers take the register in a few taps; parents are told the same day when a child is absent. Monthly report with CSV.
- **Timetable** — bell times and a weekly plan for each class; teachers, pupils and parents see their own week. A teacher cannot be double-booked.
- **Report cards and certificates** — printable, branded, one A4 page per pupil, with grades, skills, attendance and a teacher's comment.
- **Insights** — which pupils need attention, which lessons and questions were hardest, how active each class is.
- **Data erasure** — remove a pupil's personal data on request.
- **Notifications** — the bell shows new homework, marks, events and licence reminders.

## For pupils and parents
- **Arabic** — the sign-in page, the pupil portal and the parent portal switch between English and Arabic (right-to-left).
- **Install as an app** — open the site on a phone or tablet and choose *Add to Home screen*.
- **Read without internet** — in a book, tap **⬇ Save offline**. Saved books open without a connection. Signing out removes them from the device.
