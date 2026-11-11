# What's new in Knowledge Gate 1.2

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
