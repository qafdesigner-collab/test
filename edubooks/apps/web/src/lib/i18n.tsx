'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * English / Arabic for the sign-in page, the student portal and the parent portal.
 * English text is the key; a missing Arabic entry falls back to English. `{name}` placeholders are filled from vars.
 */
export type Lang = 'en' | 'ar';
const AR: Record<string, string> = {
  // sign-in
  'Sign in': 'تسجيل الدخول', 'Use the login your school or publisher gave you.': 'استخدم بيانات الدخول التي أعطتك إياها مدرستك أو دار النشر.',
  School: 'المدرسة', 'Publisher staff': 'فريق دار النشر', 'School code': 'رمز المدرسة', Username: 'اسم المستخدم', Password: 'كلمة المرور', 'e.g. SUN01': 'مثال: SUN01',
  'Complete book packages, school licences, and a joyful digital classroom for teachers, children and parents.': 'كتب متكاملة وتراخيص مدرسية وفصل رقمي ممتع للمعلمين والأطفال وأولياء الأمور.',
  'Multi-school · secure · AI-assisted': 'لعدة مدارس · آمن · بمساعدة الذكاء الاصطناعي',
  // student shell
  Home: 'الرئيسية', 'My Books': 'كتبي', Play: 'العب', Timetable: 'الجدول', 'My Stars': 'نجومي', Bye: 'وداعًا', 'Sign out': 'تسجيل الخروج', 'Days in a row': 'أيام متتالية',
  'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء الخير',
  'You have {n} homework to do!': 'لديك {n} من الواجبات!', "Let's read {title}!": 'هيا نقرأ {title}!', "Let's play and learn!": 'هيا نلعب ونتعلم!',
  'Continue reading': 'تابع القراءة', 'page {n}': 'صفحة {n}', 'Go ▶': 'هيا ◀', "📝 Today's homework": '📝 واجبات اليوم', 'All done! 🎉': 'أنجزت كل شيء! 🎉',
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
