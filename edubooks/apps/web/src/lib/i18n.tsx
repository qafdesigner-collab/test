'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * English / Arabic for the sign-in page, the student portal and the parent portal.
 * English text is the key; a missing Arabic entry falls back to English. `{name}` placeholders are filled from vars.
 */
export type Lang = 'en' | 'ar';
const AR: Record<string, string> = {
  // timeline
  'School news': 'أخبار المدرسة', 'Nothing on the timeline yet.': 'لا يوجد شيء في الأخبار بعد.', 'Show older posts': 'عرض المنشورات الأقدم', 'Pinned': 'مثبّت', 'More': 'المزيد', Edit: 'تعديل', Unpin: 'إلغاء التثبيت', 'Pin to the top': 'تثبيت في الأعلى', Delete: 'حذف', 'Delete this post?': 'حذف هذا المنشور؟',
  Save: 'حفظ', 'School admin': 'إدارة المدرسة', 'News, photos and events from the school and your children’s classes.': 'أخبار وصور وفعاليات من المدرسة ومن فصول أبنائك.',
  // feedback, class goal, weekly summary
  '⭐ Great!': '⭐ رائع!', '👏 Well done': '👏 أحسنت', '🌟 Super star': '🌟 نجم متألق', '✍️ Neat work': '✍️ عمل مرتب', '📚 Great reading': '📚 قراءة رائعة',
  '🧠 Clever thinking': '🧠 تفكير ذكي', '🎨 So creative': '🎨 مبدع جدًا', '📈 Big improvement': '📈 تحسن كبير', '❤️ Kind helper': '❤️ مساعد لطيف', '💪 Keep trying': '💪 واصل المحاولة',
  'From {name}': 'من {name}', 'your teacher': 'معلمك', 'Listen to your teacher': 'استمع إلى معلمك', 'Stickers from my teacher': 'ملصقات من معلمي',
  'Our class goal': 'هدف فصلنا', 'We did it! {reward}!': 'لقد نجحنا! {reward}!', '{n} stars → {reward}': '{n} نجمة ← {reward}',
  'Play, read and do your homework — every star helps the whole class!': 'العب واقرأ وأنجز واجبك — كل نجمة تساعد الفصل كله!',
  'Class party': 'حفلة الفصل', 'Extra playtime': 'وقت لعب إضافي', 'Movie time': 'وقت فيلم', 'Pyjama day': 'يوم البيجامة', 'Free art time': 'وقت رسم حر', 'Story time with the teacher': 'وقت القصة مع المعلم', 'Stars, homework, stickers and what is coming next week': 'النجوم والواجبات والملصقات وما سيأتي الأسبوع القادم',
  '{name}’s week': 'أسبوع {name}', 'Homework score this week: {n}%': 'درجة الواجبات هذا الأسبوع: {n}%', 'homework done': 'واجبات منجزة', 'games played': 'ألعاب',
  stickers: 'ملصقات', 'book work sent': 'أعمال الكتاب', 'days present': 'أيام الحضور', 'What we learned': 'ماذا تعلمنا', 'Coming next week': 'الأسبوع القادم',
  'Not handed in yet': 'لم يُسلَّم بعد', 'From the teacher': 'من المعلم', 'Class goal': 'هدف الفصل',
  'Every Friday you also get this summary as a notification (and by email when the school has email switched on).': 'كل يوم جمعة يصلك هذا الملخص كإشعار (وبالبريد الإلكتروني عندما تفعّل المدرسة البريد).',
  'Library visit': 'زيارة المكتبة', 'Science experiment day': 'يوم التجارب العلمية', 'Puzzle and brain-games time': 'وقت الألغاز وألعاب الذكاء', 'Educational trip': 'رحلة تعليمية',
  'Class play or show': 'مسرحية أو عرض للفصل', 'Computer and coding time': 'وقت الحاسوب والبرمجة', 'Plant a class garden': 'زراعة حديقة الفصل', 'Spelling bee party': 'حفلة مسابقة التهجئة',
  'Choose the next class read-aloud book': 'اختيار كتاب القراءة القادم للفصل', 'Certificates for everyone': 'شهادات للجميع', 'Visit from a guest expert': 'زيارة من خبير ضيف',
  // live voice on the whiteboard
  'Listening to your teacher': 'تستمع إلى معلمك', 'Your teacher is speaking — tap to listen': 'معلمك يتحدث — اضغط لتستمع',
  // competitions
  Competitions: 'المسابقات', 'No competitions yet.': 'لا توجد مسابقات بعد.', 'Taking part': 'المشاركة مفتوحة', Voting: 'التصويت', Results: 'النتائج', 'I took part': 'شاركت', Voted: 'صوّتُّ',
  entries: 'مشاركات', 'until {d}': 'حتى {d}', Singing: 'الغناء', Art: 'الفن', Drawing: 'الرسم', Poetry: 'الشعر', 'Quran recitation': 'تلاوة القرآن', Spelling: 'التهجئة', Storytelling: 'رواية القصص',
  Science: 'العلوم', Sports: 'الرياضة', Other: 'أخرى', 'All competitions': 'كل المسابقات', 'entries until {d}': 'المشاركة حتى {d}', 'voting until {d}': 'التصويت حتى {d}',
  'The winners': 'الفائزون', 'Your entry': 'مشاركتك', 'Take part!': 'شارك!', 'Name of your entry, e.g. My favourite song': 'اسم مشاركتك، مثلاً: أغنيتي المفضلة', 'Add a photo of your work': 'أضف صورة لعملك',
  Record: 'سجّل', 'Write your entry here…': 'اكتب مشاركتك هنا…', 'Tell us about it (optional)…': 'أخبرنا عنها (اختياري)…', 'Save my entry': 'احفظ مشاركتي', 'Send my entry': 'أرسل مشاركتي',
  'Take it back': 'سحب المشاركة', 'Take your entry back?': 'هل تريد سحب مشاركتك؟', 'Vote for your favourite! You have one vote and can change it until the voting closes.': 'صوّت لمشاركتك المفضلة! لديك صوت واحد ويمكنك تغييره حتى يُغلق التصويت.',
  Entries: 'المشاركات', 'No entries yet.': 'لا توجد مشاركات بعد.', 'My vote': 'صوتي', Vote: 'صوّت', 'Voting is open!': 'التصويت مفتوح!',
  '📷 A photo': '📷 صورة', '🎤 A voice recording': '🎤 تسجيل صوتي', '✍️ Writing': '✍️ كتابة', '📷 🎤 ✍️ Photo, recording or writing': '📷 🎤 ✍️ صورة أو تسجيل أو كتابة',
  // hall of fame
  'Hall of Fame': 'لوحة الشرف', 'Celebrating the people who make our school shine': 'نحتفي بمن يجعلون مدرستنا تتألق', 'Our leadership': 'قيادتنا',
  'Our brilliant students': 'طلابنا المتميزون', 'The Hall of Fame is empty for now.': 'لوحة الشرف فارغة الآن.', 'Our brilliant students and leadership': 'طلابنا المتميزون وقيادتنا',
  'The Hall of Fame is not shown right now.': 'لوحة الشرف غير معروضة الآن.',
  // photo and welcome window
  '…or choose a picture': '…أو اختر صورة', Teachers: 'المعلمون', Students: 'الطلاب', Animals: 'الحيوانات', Study: 'الدراسة',
  'You have {n} new posts on the timeline': 'لديك {n} منشورات جديدة في أخبار المدرسة',
  'Goal!': 'هدف!', 'GOAL!': 'هدف!', 'Saved!': 'تصدّى لها الحارس!', 'Tap the right answer to shoot!': 'اضغط على الإجابة الصحيحة لتسدد!',
  'You won the race!': 'فزت بالسباق!', 'The rival won this time!': 'فاز المنافس هذه المرة!', 'Bonk the right ones!': 'اضرب الصحيحة!', 'Empty hole': 'حفرة فارغة',
  '⚽ Sports': '⚽ الرياضة', '🎲 General games': '🎲 ألعاب عامة',
  'My photo': 'صورتي', 'Please choose a picture.': 'يرجى اختيار صورة.', 'Change photo': 'تغيير الصورة', 'Add a photo': 'إضافة صورة', Remove: 'إزالة',
  'Only this person can change their photo.': 'يمكن لصاحب الحساب فقط تغيير صورته.', 'Your photo is seen only by people in your school (and the publisher’s team).': 'لا يرى صورتك إلا من في مدرستك (وفريق دار النشر).',
  'Good noon': 'طاب ظهرك', 'Good night': 'طابت ليلتك', 'Important today': 'المهم اليوم', 'Loading…': 'جارٍ التحميل…',
  'Nothing important is waiting — have a great day!': 'لا يوجد شيء مهم بانتظارك — نتمنى لك يومًا رائعًا!', "Let's go": 'هيا بنا',
  'Add your photo: click your picture at the top of the page.': 'أضف صورتك: اضغط على صورتك في أعلى الصفحة.',
  '{n} unread notifications in total — see the bell 🔔.': '{n} إشعارات غير مقروءة — انظر إلى الجرس 🔔.',
  'You have {n} homework to do': 'لديك {n} من الواجبات', '{n} homework due in the next 2 days': '{n} واجبات يجب تسليمها خلال يومين',
  '{n} answers are waiting for your marking': '{n} إجابات تنتظر التصحيح', '{n} book licences end within 30 days': '{n} تراخيص كتب تنتهي خلال 30 يومًا', '{n} demo schools end within 7 days': '{n} مدارس تجريبية تنتهي خلال 7 أيام',
  // sign-in
  'Sign in': 'تسجيل الدخول', 'New school?': 'مدرسة جديدة؟', 'Register your school': 'سجّل مدرستك', 'Use the login your school or publisher gave you.': 'استخدم بيانات الدخول التي أعطتك إياها مدرستك أو دار النشر.',
  School: 'المدرسة', 'Publisher staff': 'فريق دار النشر', 'School code': 'رمز المدرسة', Username: 'اسم المستخدم', 'Login ID or email': 'رقم الدخول أو البريد الإلكتروني', Password: 'كلمة المرور', 'e.g. SUN01': 'مثال: SUN01',
  'Complete book packages, school licences, and a joyful digital classroom for teachers, children and parents.': 'كتب متكاملة وتراخيص مدرسية وفصل رقمي ممتع للمعلمين والأطفال وأولياء الأمور.',
  'Multi-school · secure · AI-assisted': 'لعدة مدارس · آمن · بمساعدة الذكاء الاصطناعي',
  // student shell
  Home: 'الرئيسية', 'My Books': 'كتبي', Play: 'العب', Timetable: 'الجدول', 'My Stars': 'نجومي', Bye: 'وداعًا', 'Sign out': 'تسجيل الخروج', 'Days in a row': 'أيام متتالية',
  'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء الخير',
  'You have {n} homework to do!': 'لديك {n} من الواجبات!', "Let's read {title}!": 'هيا نقرأ {title}!', "Let's play and learn!": 'هيا نلعب ونتعلم!',
  '🗺️ My star path': '🗺️ طريق نجومي', '{n} ⭐ to level {m}': '{n} ⭐ حتى المستوى {m}', 'Read, play and finish homework to collect stars and walk the path!': 'اقرأ والعب وأنهِ واجبك لتجمع النجوم وتمشي على الطريق!', 'Live whiteboard': 'السبورة المباشرة', '{name} is writing — come and watch!': '{name} يكتب الآن — تعال وشاهد!', 'Watch ▶': 'شاهد ◀', 'LIVE — {name} is writing': 'مباشر — {name} يكتب', 'This lesson has ended. You can still look at the board.': 'انتهى الدرس. ما زال بإمكانك رؤية السبورة.', 'This whiteboard is not available.': 'هذه السبورة غير متاحة.', 'Write or send a voice message to your teacher. Your school can see these messages.': 'اكتب أو أرسل رسالة صوتية إلى معلمك. يمكن لمدرستك رؤية هذه الرسائل.', 'Your teacher': 'معلمك', 'Student': 'تلميذ', 'Your teachers and the school office.': 'معلموك ومكتب المدرسة.', 'No teachers found yet.': 'لم يتم العثور على معلمين بعد.', 'Teacher': 'معلم', 'School office': 'مكتب المدرسة', 'Play recording': 'تشغيل التسجيل', 'Pause': 'إيقاف مؤقت', 'Cancel recording': 'إلغاء التسجيل', 'Stop and send': 'إيقاف وإرسال', 'Record a voice message': 'سجّل رسالة صوتية', 'Recording…': 'جارٍ التسجيل…', 'Stop': 'إيقاف', 'Your reading is saved': 'تم حفظ قراءتك', 'Record again': 'سجّل مرة أخرى', 'Saving…': 'جارٍ الحفظ…', '🎤 Tap to start reading': '🎤 اضغط لتبدأ القراءة', 'Mail from school': 'بريد من المدرسة', 'Mail': 'البريد', 'Inbox': 'الوارد', 'Sent': 'المرسل', 'Archived': 'الأرشيف', 'Search mail…': 'ابحث في البريد…', 'Search mail': 'ابحث في البريد', 'To': 'إلى', 'From': 'من', 'read': 'مقروءة', 'No mail yet.': 'لا يوجد بريد بعد.', 'Nothing here.': 'لا شيء هنا.', 'Choose a mail to read.': 'اختر رسالة لقراءتها.', 'Move to inbox': 'نقل إلى الوارد', 'Archive': 'أرشفة', 'Moved to the inbox': 'نُقلت إلى الوارد', 'min': 'دقيقة', 'Join online': 'انضم عبر الإنترنت', 'Will you come?': 'هل ستحضر؟', 'Going': 'سأحضر', 'Maybe': 'ربما', 'Not going': 'لن أحضر', 'Thank you — your answer was sent': 'شكرًا — تم إرسال ردك', 'In this conversation': 'في هذه المحادثة', 'recipients': 'مستلمون', 'emailed': 'أُرسلت بالبريد', 'Hide the list': 'إخفاء القائمة', 'Who has read it?': 'من قرأها؟', 'not read': 'لم تُقرأ', 'Reply': 'رد', 'Reply sent': 'تم إرسال الرد', 'Write a reply to {name}…': 'اكتب ردًا إلى {name}…', 'New mail': 'بريد جديد', 'Continue reading': 'تابع القراءة', 'page {n}': 'صفحة {n}', 'Go ▶': 'هيا ◀', "📝 Today's homework": '📝 واجبات اليوم', 'All done! 🎉': 'أنجزت كل شيء! 🎉',
  '{n} questions': '{n} أسئلة', 'due today!': 'التسليم اليوم!', '{n} days left': 'باقي {n} أيام', Start: 'ابدأ', '🎮 Play & learn': '🎮 العب وتعلم', 'See all ▶': 'عرض الكل ◀',
  '🏅 My newest badges': '🏅 أحدث أوسمتي', '📚 My Books': '📚 كتبي', 'No books yet — ask your teacher! 🌈': 'لا توجد كتب بعد — اسأل معلمك! 🌈', '{n}% read': 'قرأت {n}%',
  'No games yet!': 'لا توجد ألعاب بعد!', '💌 From your teacher': '💌 من معلمك', 'More games': 'ألعاب أخرى', '◀ Games': '▶ الألعاب',
  '⭐ My Stars': '⭐ نجومي', stars: 'نجوم', badges: 'أوسمة', 'days in a row': 'أيام متتالية', '📅 This week': '📅 هذا الأسبوع', '🏅 Badges': '🏅 الأوسمة',
  '📈 My progress': '📈 تقدمي', '📖 Pages read': '📖 الصفحات المقروءة', '🎮 {n} games': '🎮 {n} ألعاب', '📝 {n} homework': '📝 {n} واجبات', '🌈 What my teacher says': '🌈 ماذا يقول معلمي',
  'Play a game or finish your homework to collect stars!': 'العب لعبة أو أنهِ واجبك لتجمع النجوم!', '🗓️ My timetable': '🗓️ جدولي', 'This week': 'هذا الأسبوع',
  // games
  '▶ Play': '▶ العب', 'Play again': 'العب مرة أخرى', 'Amazing!': 'رائع!', 'Great job!': 'عمل عظيم!', 'Well done!': 'أحسنت!', 'Good try!': 'محاولة جيدة!',
  '{a} of {b} right': '{a} من {b} صحيحة', '{n} stars in total': '{n} نجمة في المجموع', 'New badge: {name}': 'وسام جديد: {name}', 'Sound off': 'إيقاف الصوت', 'Sound on': 'تشغيل الصوت',
  'Ready to play?': 'هل أنت مستعد للعب؟', 'Preview — scores are not saved.': 'معاينة — لا تُحفظ النتائج.',
  'How many {thing} can you count?': 'كم {thing} تستطيع أن تعدّ؟', 'Put each one in the right basket': 'ضع كل واحدة في السلة الصحيحة', 'Find the': 'ابحث عن',
  'Tap two pieces to swap them': 'اضغط على قطعتين لتبديلهما', 'Moves: {n}': 'الحركات: {n}', 'Listen, then spell the word': 'استمع ثم تهجَّ الكلمة', '🔊 Hear the word': '🔊 استمع إلى الكلمة',
  '💬 In a sentence': '💬 في جملة', 'Check ✓': 'تحقق ✓', 'Try again! {n} more tries.': 'حاول مرة أخرى! باقي {n} محاولات.', 'Tap the words to make the sentence': 'اضغط الكلمات لتكوين الجملة',
  'Listen and choose': 'استمع واختر', 'Listen again': 'استمع مرة أخرى', 'Spell the word': 'تهجَّ الكلمة', 'Your answer': 'إجابتك',
  // homework
  'Handed in! Your teacher is checking it.': 'تم التسليم! معلمك يراجعه الآن.', 'You said:': 'إجابتك:', 'Answer:': 'الإجابة:', 'This homework is closed.': 'هذا الواجب مغلق.',
  'You skipped {n} question(s). Hand in anyway?': 'تركت {n} سؤال. هل تريد التسليم على أي حال؟', 'You got {a} out of {b}! 🎉': 'حصلت على {a} من {b}! 🎉', 'Handed in! 🎉': 'تم التسليم! 🎉',
  Back: 'السابق', Next: 'التالي', 'Hand in': 'سلّم', True: 'صح', False: 'خطأ',
  // timetable
  Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت', Sunday: 'الأحد',
  'Period {n}': 'الحصة {n}', Break: 'استراحة', Print: 'طباعة', 'No timetable yet.': 'لا يوجد جدول بعد.', '🗓️ Timetable': '🗓️ الجدول',
  // calendar
  'Coming up': 'قريبًا', 'Nothing planned yet.': 'لا يوجد شيء مخطط بعد.',
  // parents
  Parents: 'أولياء الأمور', Children: 'الأبناء', 'No children linked yet': 'لم يتم ربط أي طفل بعد', 'Ask the school office to link your child to your account.': 'اطلب من إدارة المدرسة ربط طفلك بحسابك.',
  'No class yet': 'لا يوجد صف بعد', 'Homework to do': 'واجبات مطلوبة', 'Marked work': 'أعمال مصححة', '{n}% average': 'المعدل {n}%', 'Stars from games': 'نجوم من الألعاب',
  '{n} games played': '{n} ألعاب', 'Attendance (30 days)': 'الحضور (30 يومًا)', '{a} of {b} days': '{a} من {b} أيام', 'not recorded yet': 'لم يُسجل بعد',
  '📝 Homework & tests': '📝 الواجبات والاختبارات', 'No homework yet.': 'لا توجد واجبات بعد.', 'due {date}': 'التسليم {date}', 'Lesson {n}: {title}': 'الدرس {n}: {title}',
  'handed in': 'تم التسليم', 'to do': 'مطلوب', '{n} piece(s) handed in, waiting for the teacher to mark.': '{n} عمل تم تسليمه بانتظار تصحيح المعلم.',
  '💬 What the teachers say': '💬 ماذا يقول المعلمون', 'No comments yet.': 'لا توجد ملاحظات بعد.', 'Badges appear when your child plays and reads.': 'تظهر الأوسمة عندما يلعب طفلك ويقرأ.',
  '📖 Reading': '📖 القراءة', 'No reading recorded yet.': 'لم تُسجل قراءة بعد.', '{n} pages': '{n} صفحات', 'Print report card': 'طباعة بطاقة التقرير',
  // badges
  'First game!': 'أول لعبة!', Superstar: 'نجم خارق', 'Game champion': 'بطل الألعاب', 'Star collector': 'جامع النجوم', 'Star hero': 'بطل النجوم',
  'Homework helper': 'نجم الواجبات', 'Busy bee': 'النحلة النشيطة', Bookworm: 'محب الكتب', 'Super reader': 'قارئ خارق', 'On fire': 'متحمس',
  'Finish your first game': 'أنهِ أول لعبة لك', 'Get 3 stars in a game': 'احصل على 3 نجوم في لعبة', 'Play 10 games': 'العب 10 ألعاب', 'Collect 25 stars': 'اجمع 25 نجمة',
  'Collect 100 stars': 'اجمع 100 نجمة', 'Hand in your first homework': 'سلّم أول واجب لك', 'Hand in 5 homework': 'سلّم 5 واجبات', 'Read 20 pages': 'اقرأ 20 صفحة',
  'Read 100 pages': 'اقرأ 100 صفحة', 'Learn 3 days in a row': 'تعلّم 3 أيام متتالية',
  '✅ On this device': '✅ على هذا الجهاز', "You are offline. Saved books still open.": 'أنت غير متصل. الكتب المحفوظة ما زالت تفتح.',
  '📝 Exam results': '📝 نتائج الامتحانات', Absent: 'غائب', 'No exam results yet.': 'لا توجد نتائج امتحانات بعد.',
  'New message': 'رسالة جديدة', Conversations: 'المحادثات', 'About {name}': 'بخصوص {name}', 'No messages yet.': 'لا توجد رسائل بعد.', 'Choose a conversation.': 'اختر محادثة.',
  'Say hello 👋': 'ألقِ التحية 👋', Message: 'الرسالة', 'Write a message…': 'اكتب رسالة…', Send: 'إرسال', 'Your child’s teachers and the school office.': 'معلمو طفلك وإدارة المدرسة.',
  'No teachers found for your child yet.': 'لم يتم العثور على معلمين لطفلك بعد.', Announcements: 'الإعلانات', 'Whole school': 'المدرسة كلها', 'Live lessons': 'الدروس المباشرة',
  Join: 'انضم', 'Opens 10 minutes before': 'يفتح قبل 10 دقائق', Messages: 'الرسائل', '💬 Messages': '💬 الرسائل', 'Online lesson': 'درس عبر الإنترنت',
  "Hi! I'm Owl 🦉 I can explain this page, answer a question about your book, or give you a little quiz.": 'مرحبًا! أنا البومة 🦉 أستطيع شرح هذه الصفحة، أو الإجابة عن سؤال حول كتابك، أو إعطاؤك اختبارًا صغيرًا.', "Hi! I'm Owl 🦉 I can explain the page you have open, answer a question about it, or give you a little quiz.": 'مرحبًا! أنا البومة 🦉 أستطيع شرح الصفحة المفتوحة أمامك، أو الإجابة عن سؤال عنها، أو إعطاؤك اختبارًا صغيرًا.', 'Turn to a page in your book, then ask Owl.': 'افتح صفحة في كتابك، ثم اسأل البومة.', "Hi! I'm Owl 🦉 I can explain the page you have open, answer a question about it, give you a little quiz, or listen to you read it.": 'مرحبًا! أنا البومة 🦉 أستطيع شرح الصفحة المفتوحة أمامك، أو الإجابة عن سؤال عنها، أو إعطاؤك اختبارًا صغيرًا، أو الاستماع إليك وأنت تقرؤها.', 'Read to Owl': 'اقرأ للبومة', 'Which page?': 'أي صفحة؟', 'Reading language': 'لغة القراءة', 'Listening… read the page aloud': 'أستمع… اقرأ الصفحة بصوت عالٍ', 'I finished reading': 'انتهيت من القراءة', 'This browser cannot listen. Please use Chrome, Edge or Safari.': 'هذا المتصفح لا يستطيع الاستماع. استخدم Chrome أو Edge أو Safari.', 'Please allow the microphone to read to Owl.': 'اسمح باستخدام الميكروفون لتقرأ للبومة.', "Owl didn't hear you. Tap 🎤 and read the page aloud, nice and clear.": 'لم تسمعك البومة. اضغط 🎤 واقرأ الصفحة بصوت واضح.', 'Score': 'النتيجة', 'Green: read right · Red: missed or not clear': 'الأخضر: قراءة صحيحة · الأحمر: كلمة فاتتك أو غير واضحة', 'Page {n}': 'صفحة {n}',
  'Explain this page': 'اشرح هذه الصفحة', 'Quiz me': 'اختبرني', 'Ask Owl': 'اسأل البومة', '{n} left today': 'باقي {n} اليوم', Close: 'إغلاق', 'Read to me': 'اقرأ لي',
  'Owl is thinking…': 'البومة تفكر…', 'Type your question': 'اكتب سؤالك', 'Your question': 'سؤالك', 'Ask about your book…': 'اسأل عن كتابك…', Ask: 'اسأل',
  'Owl only knows your book. Your teacher can see your questions.': 'البومة تعرف كتابك فقط. يستطيع معلمك رؤية أسئلتك.', 'Perfect! ⭐⭐⭐': 'ممتاز! ⭐⭐⭐', '{a} of {b} right — well done!': '{a} من {b} صحيحة — أحسنت!',
  "Today's goals": 'أهداف اليوم', 'Read a page': 'اقرأ صفحة', 'Play a game': 'العب لعبة', 'Do homework': 'أنجز الواجب', 'My bookshelf': 'رف كتبي', 'Read ▶': 'اقرأ ◀', 'Level {n}': 'المستوى {n}',
  // switch
  'العربية': 'العربية', English: 'English',
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });
/** True inside the areas that are translated; everything else stays English. */
const Scope = createContext(false);
export const KEY = 'kg-lang';

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => { try { if (localStorage.getItem(KEY) === 'ar') setLangState('ar'); } catch { /* private mode */ } }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

/** Marks a translated area (sign-in, student and parent portals) and sets the page language and direction. */
export function LangScope({ children }: { children: React.ReactNode }) {
  const { lang } = useContext(Ctx);
  useEffect(() => {
    const el = document.documentElement; const ar = lang === 'ar';
    el.lang = ar ? 'ar' : 'en'; el.dir = ar ? 'rtl' : 'ltr';
    return () => { el.lang = 'en'; el.dir = 'ltr'; };
  }, [lang]);
  return <Scope.Provider value>{children}</Scope.Provider>;
}

export function useT() {
  const { lang: chosen, setLang } = useContext(Ctx); const inScope = useContext(Scope);
  const lang: Lang = inScope ? chosen : 'en';
  const t = useCallback((s: string, vars?: Record<string, string | number>) => {
    let out = lang === 'ar' ? AR[s] ?? s : s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  }, [lang]);
  return { t, lang, setLang, rtl: lang === 'ar' };
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} lang={lang === 'ar' ? 'en' : 'ar'}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      className={`focus-ring rounded-full px-3 py-1.5 text-sm font-bold ${className}`}>{lang === 'ar' ? 'English' : 'العربية'}</button>
  );
}
