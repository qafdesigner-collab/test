# What's new in Knowledge Gate 1.3.23

## Checklists for student evaluation
- New **Checklists** page for teachers and school admins. Evaluate a class **skill by skill**.
- **New checklist** offers three starting points, and you can change every line:
  - 📋 **Ready-made lists**: Language & literacy, Early maths, Physical & motor skills, Personal/social/emotional, Learning habits (primary).
  - 📖 **A unit of your book**: lines come from its lessons and learning objectives.
  - ✏️ **Your own skills**: one per line; write “Reading: Knows the letter sounds” to group lines by area.
- Choose the **scale**: ✅ Achieved · 🔸 Developing · ⭕ Not yet, or 4 levels (⭐ Excellent … ⭕ Needs help), or Yes / No.
- **Marking grid**: one row per student, one column per skill. Tap a box to change it. The buttons under a skill mark the whole class at once, so you only change the exceptions. Add a comment per student, then **Save**.
- **Print**: one A4 **report per student** (school logo, levels, totals, teacher's comment, signatures; Download PDF too) or a landscape **class sheet**. Also **Excel/CSV**.
- **Share with students & parents**: students see their checklists under **⭐ My Stars → ✅ My skills**, and parents see them on their child's page (with Print). Nothing is shown before you share.

# What's new in Knowledge Gate 1.3.22

## Switch a book off for one school, or remove it
- **Schools → open a school → Books** (new first tab) lists every book the school has, with its licence date and how many users have it.
- **Switch off** closes the book for that school for now (for example, payment pending). **Remove** takes it away from the school and moves it to “Removed from this school”. You can add a reason for your records.
- Either way the book closes at once for the school admin, teachers and students of that school only. Other schools are not affected, and homework, marks and notes are kept.
- **Switch on** / **Give back** opens it again. Every change is in the Audit Log.
- Only the super admin (publisher admin) can do this; sales and editors can see the list.

# What's new in Knowledge Gate 1.3.21

## Privacy for book parts, units and lessons: “Visible to”
- In the book builder, every **part** (student book, teacher guide, posters, calendar, flashcards, CD, app…), **unit** and **lesson** now has **Visible to: 👥 Everyone · 👩‍🏫 Teachers only · 🎒 Students only**. Click one; it is saved at once and also works on published editions.
- **Teachers only** hides it from students; **Students only** hides it from teachers. Hidden items disappear from the contents, and their pages, flipbook/CD, app, resources and AI answers (Ask Owl, the teacher AI) are blocked on the server too, not just hidden from view.
- The structure list shows a small **Teachers only / Students only** tag on anything not shown to everyone.
- The publisher and school admins always see everything.
- **Teacher guides and teacher cards are now “Teachers only”** (existing ones too). Before, students could open them. Change it per part if you want.
- Resources marked **“Students only”** are now really hidden from teachers too (before, teachers still saw them).
- Note: hiding a unit or lesson hides it from the contents and its resources. Its pages stay inside the part's PDF. To hide pages completely, upload them as a separate part and hide that part.

# What's new in Knowledge Gate 1.3.20

## Delete books and products
- **Book Packages → open a book → Delete**: removes the book with all its editions, parts, pages and resources (after you confirm).
- **Products & Bundles → open a product → Delete**: removes the product and its versions. The books in it are not deleted.
- To protect schools' records, a book that schools hold licences for, or a product that was ordered or licensed, cannot be deleted. The message says why. Use **Archive** (or **Stop selling** for a product) to hide it instead. A book that is in a product can be deleted after that product is deleted.

# What's new in Knowledge Gate 1.3.19

## Big PDFs (teacher guides, books) open at once
- PDFs now open **part by part**: the first pages appear after a small download, and the rest of the file is fetched only when those pages are looked at. Before, the whole file (often 100–300 MB for a teacher guide) had to arrive before anything showed — on slow internet it looked like it never opened.
- Works for protected books too (each part is still encrypted and only readable inside the platform), in the reader, the whiteboard, the page-question maker and the resource viewer.

## PDFs are made smaller automatically
- After a PDF is uploaded (book pages or a resource), the server **compresses it in the background**: pictures are reduced to screen quality (200 dpi), text stays real text, and the file is arranged for fast opening on the web. In a test, a 42 MB guide became 9 MB. The original is replaced only if this saves at least 10%.
- This needs **Ghostscript** on the server (most cPanel servers have it; your host can install it). Without it, PDFs upload and open as before, just not compressed. Settings: `PDF_COMPRESS=0` turns it off, `PDF_COMPRESS_DPI` changes the picture quality, `GS_PATH` points to Ghostscript if it is not found.

## Big uploads do not stop half-way
- **Book PDFs** and **resources over 20 MB** are now sent in **small pieces**, like the mobile app: a dropped connection only re-sends one piece, and choosing the same file again after an interruption continues where it stopped.

# What's new in Knowledge Gate 1.3.18

- **PDF resources show every page** on phones and tablets (iPad / iPhone / Android). Before, only the first page appeared there, because all pages were drawn at once and those devices limit a page's drawing memory. Now only the pages near the screen are drawn (long PDFs open faster too), with a **Page x / n** counter.
- Checked: resources set to **“Visible to: Teachers only”** appear only in teacher accounts — students do not see them and cannot open them.

# What's new in Knowledge Gate 1.3.17

## Big mobile apps upload reliably
- The Android app (.apk) of a **Mobile App** part is now sent in **small pieces**, so apps of **hundreds of MB** (up to 2 GB) upload without being cut off by the hosting's time or size limits.
- A progress bar shows **how much is sent and the time left**. If the internet drops, pieces are **sent again automatically**; if the page was closed, **choose the same file again** and it continues where it stopped.

## Resources play inside the platform — only the publisher can download
- Teachers and students open every resource **inside the platform**: PDF, pictures, audio, video, HTML, and now also:
  - **PowerPoint (.pptx)** — slides with text, pictures and colours (a simplified preview; animations and charts are not shown);
  - **Word (.docx)** — headings, text, lists, tables and pictures;
  - **Flash (.swf)** — played with the built-in Flash player (SWF can now be uploaded as a resource).
- Old Office files (.ppt, .doc, .xls) cannot be shown in a browser — upload them as PPTX/DOCX or PDF.
- **Downloading** resources and book files is for the **super admin / publisher staff only** (a Download button in the viewer). Teachers and students cannot download, whatever the protection settings.
- Fixed: the Mobile App part of the book builder could crash while its details were loading.

# What's new in Knowledge Gate 1.3.16

## Download logins with passwords — whole school or one group
- Super admin → **Users** → a school → **Download whole school logins (with passwords)**, or **Download teachers / students / … logins**. Inside, choose **Whole school, School admins, Teachers, Students or Parents**. School admins have the same window for their own school.
- The list, the **Excel/CSV file** and the **Print / PDF** (grouped by school admins, teachers, students, parents) show the **login ID and password** for each person.
- Passwords given out by an admin (new accounts, Excel imports, resets, parents) are now kept **encrypted** so they can be downloaded again. When someone **chooses their own password**, it is no longer readable (shown as “not on file”).
- **Accounts made before this update** show “not on file”: press **New passwords for the N without one** — only those people get a new password, and it then appears in the list. Teachers and school admins choose their own password at their next sign-in.

# What's new in Knowledge Gate 1.3.15

## Questions from any book page — free and unlimited
- In an assessment, **Ask AI for questions → 📖 From a book page — free**: choose the page number, **see the page**, choose the kinds of question (fill in the blank, multiple choice, true/false, short answer) and press **Make questions**. **Make new questions** gives a different set.
- Made by the platform's **built-in question maker** from the words on that page: no outside AI service, no key, **no limits, no cost**. Picture pages with single words get letter and spelling questions.
- **Link the page to the assignment:** students see **📖 Open page 12 of the book** on their homework, which opens the book at that page.
- Pages that are only pictures (no text in the PDF) cannot give questions automatically — the preview still helps you write them.

## Print preview with Back, Print and Download PDF
- Every print (assessment sheets, answer keys, exam papers, result sheets, report cards, certificates, invoices, login cards, lesson plans) now opens **inside the app** with **← Back**, **🖨 Print** and **⬇ Download PDF** (a real PDF file, no print dialog needed). The phone's back button closes it too.

## Book protection: fewer interruptions
- The “protected” cover now appears only for **screenshot keys** (Print Screen, Win+Shift+S, ⌘+Shift+3/4/5) and while the student is in **another app or tab** — and it disappears by itself when they come back.

# What's new in Knowledge Gate 1.3.14

- **← Back button** at the top of every page in all portals (super admin, school, teacher, student, parent) — useful in the installed app, which has no browser back button. It goes to the previous page, or to the portal's home.
- **Screenshots hidden:** on book pages, flipbooks and CDs the book is covered when **Print Screen**, **Win+Shift+S** (Windows) or **⌘+Shift+3/4/5** (Mac) is pressed, when the pointer leaves the window, or when the reader switches to another tab or app. (No website can block every screenshot or a phone camera; the reader's name under the logo makes copies traceable.)

# What's new in Knowledge Gate 1.3.13

## Fixed: flipbooks and CDs showing only “protected”
- For teachers and students, flipbooks and CDs could appear empty (only the faint watermark). They now fill the reading area and work normally, and clicking inside the book no longer hides it.

## Links only work for the person who is signed in
- Every link to a book page, flipbook, CD, PDF or resource belongs to the signed-in person. Copied into **another browser, a private window or another device**, it opens the **login page** instead of the book; another person's account cannot use it either.
- The mobile-app QR download stays open, so phones can install the app.

## CDs and flipbooks unit by unit
- In Book Packages → a part → **CD units / Flipbook units**: **Add unit** (give it a name, e.g. “Unit 1: Letters”, and choose its .swf or .zip), or **Add several units at once** (each file becomes a unit, named from the file).
- Rename, reorder (↑ ↓), preview, replace the file of one unit, or remove it — the other units stay as they are.
- Students and teachers pick the unit from a list at the top of the reader.

# What's new in Knowledge Gate 1.3.12

- **Knowledge Gate Publishing logo** is now the built-in **app icon** (phones, tablets, computers) and the **browser-tab icon (favicon)**.
- An app icon made under Super admin → Branding still replaces it, and the browser-tab icon follows it.

# What's new in Knowledge Gate 1.3.11

- The **Install app** window now opens centred over the whole page (before, it was cut off inside the top bar).

# What's new in Knowledge Gate 1.3.10

## Install and save books on any device
- **Phone, tablet or computer:** the **📲 Install app** window now gives the right steps for each device — Android, iPhone, iPad, Windows / Mac in Chrome or Edge (opens from the desktop, Start menu or Dock), and Safari on a Mac (File → Add to Dock).
- **Save my books on this phone / tablet / computer:** students, teachers and school admins can keep their books on every device they use; each device keeps its own encrypted copy that opens without internet.

# What's new in Knowledge Gate 1.3.9

## Install the platform as an app, with your logo
- **📲 Install app** button at the top of every portal (super admin, school, teacher, student, parent) and on the sign-in page.
  - **Android and computers (Chrome / Edge):** one tap on **Install now**.
  - **iPhone / iPad:** the window shows the 3 steps (Safari → Share → Add to Home Screen).
- **Your logo is the app icon:** Super admin → **Branding** → upload your logo, and the home-screen icon is made from it automatically (choose the icon's background colour, or press **Make it again from the logo**). The app also carries your **name** and **main colour**.
- **Save my books on this phone:** in the install window, students and teachers press **Save my books**. All their books are kept on the device — **still encrypted** — and open **without internet**, together with the screens needed to read them. Signing out removes them from the device.

# What's new in Knowledge Gate 1.3.8

## Stronger book protection
- **One logo instead of many names:** each book page shows **your logo once, faintly, in the centre**, with the reader's name and school in small letters under it (so a photo of the screen can still be traced). Upload your logo under Super admin → Branding.
- **Encrypted books:** book PDFs are now sent **encrypted** with a one-time key that only the platform's reader receives. A copied link, or a file saved from the browser, cannot be opened in any PDF program. Books saved for offline reading also stay encrypted on the device.
- **Hidden when you leave:** the book is covered as soon as the reader switches to another tab, window or app (or presses Print Screen), until they click to continue.
- **No printing, downloading, right-click, copying, saving or developer tools (F12)** on book pages, flipbooks, CDs and resources.
- Publisher staff still see and download the original files.
- Note: no website can completely stop a phone camera or every screenshot tool; the name under the logo is there for that case.

# What's new in Knowledge Gate 1.3.7

## Easier whiteboard
- **Big labelled tools:** Pen, Marker, **Line, Arrow, Box, Circle** (with Fill), Text and Eraser; 8 colours; Thin / Medium / Thick / Huge.
- **Undo and Redo**, and **Clear** clears only the page you are on.
- **Pages keep their writing:** turn to the next book page and back, and your notes are still there. On a blank board press **New page**.
- **Paper for blank pages:** dots, squares, lines, or **Handwriting** (four-line KG paper).
- On a book board, **⬜ Blank page** gives you space to explain; **📖 Back to the book** returns to your page.
- **Full screen** for the projector or smart board (students can use full screen too).
- **Keyboard shortcuts:** P pen · M marker · L line · A arrow · B box · C circle · T text · E eraser · 1–8 colours · Ctrl+Z / Ctrl+Y · ← → pages · N new page · F full screen.
- **Who is watching:** the teacher sees how many students of the class have the board open.

## Your own email (Mail → My email account)
- Teachers, school admins, the super admin, editors and sales can **connect their own email address** (school or company domain on cPanel, Gmail, Outlook / Microsoft 365, Zoho, or any other mail server). The login is checked before saving; the password is stored encrypted.
- **My email** tab: read the email you receive, search it, and **reply from your own address**. **Write email** sends to any outside address.
- New mail can also go to **outside email addresses**, and email copies go out from your own address.
- Gmail and Outlook need an **app password** (the setup window explains where to get it).

## Email campaigns (Mail → Campaigns)
- Send one email to many people: choose **groups** (classes, parents, teachers, all school admins…) and/or **paste addresses** or load a CSV.
- Personalise with **{name}**, **{first_name}** and **{email}**.
- Choose the **speed**, e.g. **50 emails every 10 minutes**, and **start now or at a set date and time**. The window shows how long it will take.
- Watch the progress: sent, waiting, failed, next batch time, and the status of every address. **Pause, resume or cancel** at any time. If the mail server refuses a whole batch, the campaign pauses itself and tells you why.

## Exam results and assessment marking for teachers
- Exams have a **pass mark** (40% unless you change it). The **Results** tab shows marks, %, grade, **Pass / Fail / Absent** and position, with totals.
- **Print result sheet** and **Save (Excel / CSV)**.
- Assessments: **Mark next** goes straight to the next student; results show %, grade and pass/fail and can be printed or saved.

## Download logins (school admin and super admin)
- **Download logins** for students or teachers (one class or everyone): a list of login IDs, or **new passwords with printable login cards**.

## Student progress graph
- Click a student in your class: a **graph across Term 1, Term 2, Term 3 and Final**, built automatically from exams (60%) and homework (40%), with class position, reading days and attendance. The teacher can **adjust a term's score** and add a comment.

## The school's own name and logo on prints
- School admin → Overview → **Edit**: change the **school name, email, phone, address** and upload the **school logo**.
- Everything printed from a school account (result sheets, report cards, certificates, exam papers, assessment sheets, login cards) shows **the school's name and logo**.

## Book licences by grade
- When you give seats, the **students of the book's grade come first** (e.g. a KG book shows KG students), with each student's class.
- **Use for other grades:** if your school uses a book in another grade too (e.g. a KG book in KG2), tick that grade; those students then show first as well.

## Wording
- “Pupil” is now **“Student”** everywhere.

# What's new in Knowledge Gate 1.3.6

## Mail for everyone, meeting invitations and email copies
- Every portal has a **Mail** page (Inbox, Sent, Archived). Super admin, sales, school admins and teachers can **write to people or whole groups**:
  - **Super admin / publisher:** publisher team, all school admins, all teachers, or the admins / teachers of one school.
  - **School admin:** all staff, all teachers, all students, all parents, one class's students or parents, or **our publisher**.
  - **Teacher:** the school office, other teachers, and the students or parents of their own classes.
  - Students and parents get **Mail from school** and can **reply**.
- **Meeting invitations:** tick “This is a meeting invitation”, set the date, time, place or online link and send — e.g. to all teachers in one click. People answer **Going / Maybe / Not going**; you see the answers and **who has read it**.
- **Email copies:** Super admin → **Email settings**: connect one mailbox (e.g. from cPanel → Email Accounts: server mail.yourdomain.com, port 465, the mailbox and its password) and press **Send test**. Then everyone who has an email address also gets mail and meeting invitations by email (with a calendar invite), and — if ticked — copies of notifications (homework, results, messages, announcements) to students, parents and teachers.

## Voice messages and student chat
- In **Messages**, press the 🎤 microphone to record a **voice message**, press ■ to send. Everyone can play it in the chat.
- **Students can now chat** with their own teachers and the school office (text or voice) from the 💬 button on their home page; teachers can start a chat with a student. The school admin can still read every conversation.

## Read aloud homework
- New question type **Read aloud 🎤** in Assessments: e.g. “Read page 12 aloud”. The student taps **Tap to start reading**, reads, listens back, and hands in. The teacher **listens in the marking window** and gives the points.
- Recordings stay inside the school; only the student, their teachers, their parents and the school admin can play them. Erasing a student's data also deletes their recordings and mail.

# What's new in Knowledge Gate 1.3.5

## Live whiteboard (Teacher → Whiteboard)
- **Start a whiteboard** for a class on a **blank board** or on **a page of your book** (also from the book reader: the new whiteboard button teaches the page you are on).
- Write with the **pen**, **highlighter**, **text** and **eraser**, in 7 colours and 4 sizes; **undo**, **clear** and **turn pages**.
- Students of the class see a **“Live whiteboard — Watch”** banner on their home page and follow everything you write within about a second. When you **End lesson**, they can still look at the board.
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
- **Students:** softer colours for the big buttons and the banner, and a new **My star path** — stepping stones to the next level, with the owl standing where the child is now.

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
- **Teacher home:** a purple sidebar with coloured icons, a greeting banner with **today's lessons** (the current one highlighted, live lessons marked), tiles for students, work to mark, today's attendance and stars, six big buttons (Take register, Set homework, Plan a lesson, Ask the AI, Assign a game, Make an exam), colourful **class cards** (students, average, how many need help), a **To mark** list, **Students who need a little help** with a *Message parent* button, and **My books** on a shelf with a tip for the next lesson.
- **School admin home:** the same look, with today's registers, classes, licences ending soon, free student seats and quick buttons (Add students, Add teachers, Give books, Send a message, Timetable, Exams). Everything else in the school area also uses the new sidebar.

## Book parts: choose, rename, remove
- **New book:** tick only the parts the book has (how many Student Book parts, Homework Book, Teacher Guide, Flashcards, Teacher Cards, Danglers, CD, Mobile App).
- **Later:** in Book structure, hover a part to **rename, move or remove** it, and use **Add part** for anything you left out. This also works on **published** editions (units, lessons and page ranges stay locked). Removing a part asks first and tells you what goes with it.
- **Only what you upload is shown:** teachers and students see a part only when it has something in it (pages, a flipbook or CD, the app, or resources). Empty parts stay hidden until you upload.

## Bulk add teachers and students (only the name is required)
- **Teachers → Bulk import (Excel)** and **Students → Bulk import (Excel)**: one person per row; only **Name** is required. Optional columns: **Designation**, **Email**, **Mobile**, **Login ID**, **Password** (students also: class, section and parent details). Download the template from the import window.
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
- **Book cover mockups:** in Book Packages, click the cover square of a book to upload its cover image (PNG, JPG or WebP). It is shown on the students' bookshelf, in the teachers' library and in your book list.
- **CD and Mobile App parts:** every new book gets a **CD** part (upload the CD's Flash `.swf` or a zip of the CD folder; it plays in the browser) and a **Mobile App** part (upload the Android `.apk` and/or add Google Play and App Store links). Students open the Mobile App part in the book and **scan a QR code** with their phone to install the app. For older books, add the parts with **Add component** while the edition is a draft.
- **Content protection (on by default):** students and parents — and, unless you turn it off, teachers — can only **view** book pages, flipbooks, CDs, flashcards and resources inside the platform: no downloading, no right-click, no copying, no printing. Each page carries a faint watermark with the reader's name and school, and the page is covered when Print Screen is pressed or the window loses focus. The mobile app is the only thing students can download. Settings: Company & Currency → Content protection. Note: no website can completely stop screenshots or a phone camera; the watermark makes copies traceable.
- **New student home:** a sky full of clouds and stars, levels from stars, three daily goals, a 3D "continue reading" book with the real cover, and wooden bookshelves.
- **Flipbooks:** besides `index.html`, a flipbook zip may now open from `start.html`, `default.html` or `main.html`, also inside a folder.

# Knowledge Gate 1.2.1

## Demo data you can load and remove
**Super admin → Demo data → Load demo data** fills your site with sample content to try every feature:
3 demo schools (codes **DEMO1**, **DEMO2**, **DEMO3**) with a school admin, teacher, students and a parent; 5 sample books marked “(Demo)”;
products, orders and licences; games; a class with homework, attendance, a timetable, an exam with results, messages, announcements and a live lesson; and a training course.
The page lists the demo sign-ins (for example school **DEMO1**, user **student1**, password **Student@123**).

When you are done, **Remove all demo data** (type REMOVE to confirm) deletes all of it in one go. Your real schools, books, users and settings are not touched.
If a real school has started using a demo item — for example ordered a demo product — nothing is removed and the page tells you which school, so you can fix that first.

# Knowledge Gate 1.2

Install with the full zip (`edubooks-lms-public_html.zip`) through **Super admin → Updates**. The database is updated automatically.

## Exams and question papers
- Teachers and school admins: **Exams → New exam**. Build the paper by typing questions (including long answers with writing lines), picking from the question bank, or **Make a paper for me** (picks questions by type and number, e.g. 10 multiple-choice + 5 short).
- **Print paper**, **Version B** (same questions in a different order) and **Answer key**, with your logo.
- **Marks & results**: type marks quickly (Enter moves to the next student), mark absentees, see the average. **Publish results** puts them on report cards and tells students and parents.

## Messages, announcements and live lessons
- **Parent messages**: parents write to their child's teachers and the school office from the parent portal (💬 Messages). Teachers and admins answer under **Messages**. The school admin can read every conversation (read only) for safeguarding. Students have no chat.
- **Announcements** to one class or the whole school, for students, parents or both. Can be pinned.
- **Live lessons**: paste a Zoom / Google Meet / Teams link and a time. Students and parents see a **Join** button from 10 minutes before. Timetable lessons can also carry an online link.

## Ask Owl — AI reading helper for students
- In the book reader, students tap **🦉 Ask Owl**: *Explain this page*, *Ask a question* or *Quiz me*.
- Owl only uses the book's own pages, uses simple words, gives no links, never asks for personal details, and sends unsafe topics to a trusted grown-up.
- **Off until the school admin turns it on** (School → Ask Owl), with a daily limit per student. Teachers see every question; flagged ones are marked for a gentle check-in.
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
- **Excel import** of students with their class, section and parent phone; **QR login cards** for printing.
- **Parent accounts and parent portal** — homework, marks, teacher comments, reading, attendance and the timetable for each child.
- **Attendance** — teachers take the register in a few taps; parents are told the same day when a child is absent. Monthly report with CSV.
- **Timetable** — bell times and a weekly plan for each class; teachers, students and parents see their own week. A teacher cannot be double-booked.
- **Report cards and certificates** — printable, branded, one A4 page per student, with grades, skills, attendance and a teacher's comment.
- **Insights** — which students need attention, which lessons and questions were hardest, how active each class is.
- **Data erasure** — remove a student's personal data on request.
- **Notifications** — the bell shows new homework, marks, events and licence reminders.

## For students and parents
- **Arabic** — the sign-in page, the student portal and the parent portal switch between English and Arabic (right-to-left).
- **Install as an app** — open the site on a phone or tablet and choose *Add to Home screen*.
- **Read without internet** — in a book, tap **⬇ Save offline**. Saved books open without a connection. Signing out removes them from the device.
