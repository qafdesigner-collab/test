/* Atelier Perfume ERP · Language switch (English / العربية / اردو) and right-to-left layout.
   Interface phrases are swapped after each screen draws; data such as names and numbers is left alone. */
'use strict';

const LANGUAGES = { en: { label: 'English', dir: 'ltr', column: -1 }, ar: { label: 'العربية', dir: 'rtl', column: 0 }, ur: { label: 'اردو', dir: 'rtl', column: 1 } };

function currentLanguage() {
  try {
    return LANGUAGES[localStorage.getItem('atelier-lang')] ? localStorage.getItem('atelier-lang') : 'en';
  } catch {
    return 'en';
  }
}

/** Phrases that carry numbers or names: [pattern, Arabic, Urdu] using $1, $2… */
const I18N_PATTERNS = [
  [/^Good to see you, (.+)\.$/, 'أهلًا بك يا $1.', 'خوش آمدید، $1۔'],
  [/^(.+) · here is what is happening across your perfume business\.$/, '$1 · إليك ما يجري في أعمال العطور لديك.', '$1 · آپ کے پرفیوم کاروبار کی تازہ صورتحال۔'],
  [/^Filter (\d+) rows…$/, 'تصفية $1 صف…', '$1 لائنیں فلٹر کریں…'],
  [/^(\d+)–(\d+) of (\d+) matching$/, '$1–$2 من $3 مطابقة', '$3 مطابق میں سے $1–$2'],
  [/^(\d+)–(\d+) of (\d+)$/, '$1–$2 من $3', '$3 میں سے $1–$2'],
  [/^No matching rows$/, 'لا توجد نتائج مطابقة', 'کوئی مطابق لائن نہیں'],
  [/^(\d+) active products · Inspiration references are internal staff information\.$/, '$1 منتج نشط · مراجع الإلهام معلومات داخلية للموظفين.', '$1 فعال پروڈکٹس · Inspiration حوالے صرف اسٹاف کے لیے ہیں۔'],
  [/^Inspiration library · (\d+) references$/, 'مكتبة الإلهام · $1 مرجع', 'Inspiration لائبریری · $1 حوالے'],
  [/^Development release · (.+)$/, 'إصدار تطويري · $1', 'ڈیولپمنٹ ریلیز · $1'],
  [/^(\d+) posted sales and invoices$/, '$1 عملية بيع وفاتورة', '$1 فروخت اور انوائس'],
  [/^([\d.]+)% margin on costed sales$/, 'هامش $1% على المبيعات محسوبة التكلفة', 'لاگت والی فروخت پر $1% مارجن'],
  [/^▲ (\d+)% vs previous 30 days$/, '▲ $1% مقارنة بالـ30 يومًا السابقة', '▲ پچھلے 30 دن سے $1% زیادہ'],
  [/^▼ (\d+)% vs previous 30 days$/, '▼ $1% مقارنة بالـ30 يومًا السابقة', '▼ پچھلے 30 دن سے $1% کم'],
  [/^(\d+) bottles? sold$/, 'بيع $1 زجاجة', '$1 بوتلیں فروخت'],
  [/^Paid · (Cash|Card|Bank)$/, 'مدفوع · $1', 'ادا شدہ · $1'],
  [/^Customer: (.+)$/, 'العميل: $1', 'کسٹمر: $1'],
  [/^(\d+) day(s)?$/, '$1 يوم', '$1 دن'],
  [/^Held \((\d+)\)$/, 'معلقة ($1)', 'روکی گئی ($1)'],
  [/^Paid (.+)$/, 'المدفوع $1', 'ادا شدہ $1'],
  [/^([\d,.]+) in stock$/, 'متوفر $1', '$1 اسٹاک میں'],
  [/^(.+) \/ (bottle|piece|hour|box|carton|litre)$/, '$1 / $2', '$1 / $2'],
  [/^(.+) · (Men|Women|Unisex)$/, '$1 · $2', '$1 · $2'],
  [/^(\d+) design or packaging projects? in progress\.$/, '$1 مشروع تصميم أو تغليف قيد التنفيذ.', '$1 ڈیزائن یا پیکیجنگ پروجیکٹ جاری ہیں۔'],
  [/^Development release (.+)\.$/, 'إصدار تطويري $1.', 'ڈیولپمنٹ ریلیز $1۔'],
  [/^· (\d+) invoices include estimated costs · (\d+) invoices have missing historical costs\.$/, '· $1 فاتورة بتكاليف تقديرية · $2 فاتورة بدون تكلفة تاريخية.', '· $1 انوائس میں تخمینی لاگت · $2 انوائس میں تاریخی لاگت نہیں۔'],
];

const I18N_EXTRA = {
  RECEIPT: ['إيصال', 'رسید'],
  RETURN: ['إرجاع', 'واپسی'],
  TOTAL: ['الإجمالي', 'کل'],
  INVOICE: ['فاتورة', 'انوائس'],
  QUOTATION: ['عرض سعر', 'کوٹیشن'],
  'SALES RECEIPT': ['إيصال بيع', 'فروخت کی رسید'],
  'PURCHASE ORDER': ['أمر شراء', 'پرچیز آرڈر'],
  PURCHASE: ['شراء', 'خریداری'],
  'RETURN TO SUPPLIER': ['إرجاع إلى المورد', 'سپلائر کو واپسی'],
  'Thank you for your business.': ['شكرًا لتعاملكم معنا.', 'آپ کے کاروبار کا شکریہ۔'],
  'Thank you for your visit.': ['شكرًا لزيارتكم.', 'تشریف لانے کا شکریہ۔'],
  'Walk-in customer': ['عميل نقدي', 'عام گاہک'],
  'Walk-in': ['عميل نقدي', 'عام گاہک'],
  'Payment received': ['تم استلام الدفعة', 'ادائیگی وصول'],
  "+ Add customer": ["+ إضافة عميل", "+ کسٹمر شامل کریں"],
  "+ Add product": ["+ إضافة منتج", "+ پروڈکٹ شامل کریں"],
  "+ Adjust / transfer stock": ["+ تعديل / نقل المخزون", "+ اسٹاک میں ترمیم / منتقلی"],
  "+ Quotation": ["+ عرض سعر", "+ کوٹیشن"],
  "+ Create invoice": ["+ إنشاء فاتورة", "+ انوائس بنائیں"],
  "+ Purchase order": ["+ أمر شراء", "+ پرچیز آرڈر"],
  "+ Receive purchase": ["+ استلام مشتريات", "+ خریداری وصول کریں"],
  "+ Plan batch": ["+ تخطيط دفعة", "+ بیچ کی منصوبہ بندی"],
  "+ Formula version": ["+ إصدار تركيبة", "+ فارمولا ورژن"],
  "+ New project": ["+ مشروع جديد", "+ نیا پروجیکٹ"],
  "+ Stock location": ["+ موقع مخزون", "+ اسٹاک کا مقام"],
  "+ Invite / create user": ["+ دعوة / إنشاء مستخدم", "+ صارف بنائیں"],
  "+ Add item": ["+ إضافة صنف", "+ آئٹم شامل کریں"],
  "+ Add one": ["+ إضافة واحد", "+ ایک شامل کریں"],
  "+ Split payment": ["+ تقسيم الدفع", "+ ادائیگی تقسیم کریں"],
  "Customers": ["العملاء", "کسٹمرز"],
  "Suppliers": ["الموردون", "سپلائرز"],
  "Close shift · active": ["إغلاق الوردية · نشطة", "شفٹ بند کریں · جاری"],
  "Open shift · required": ["فتح الوردية · مطلوب", "شفٹ کھولیں · ضروری"],
  "Internal material": ["مادة داخلية", "اندرونی مواد"],
  "Service": ["خدمة", "سروس"],
  "No records yet.": ["لا توجد سجلات بعد.", "ابھی کوئی ریکارڈ نہیں۔"],
  "Quotations, posted invoices, payments and full returns.": ["عروض الأسعار والفواتير المرحّلة والمدفوعات والمرتجعات.", "کوٹیشن، انوائس، ادائیگیاں اور واپسیاں۔"],
  "Invoices deduct stock immediately. Quotations do not reserve or deduct stock. Separate sales orders, partial deliveries and partial returns are later-stage features.": ["الفواتير تخصم المخزون فورًا. عروض الأسعار لا تحجز ولا تخصم المخزون.", "انوائس فوراً اسٹاک کم کرتی ہے۔ کوٹیشن اسٹاک نہ روکتی ہے نہ کم کرتی ہے۔"],
  "Record supplier purchases and receive stock into a location.": ["سجّل مشتريات الموردين واستلم المخزون في موقع.", "سپلائر سے خریداری درج کریں اور اسٹاک وصول کریں۔"],
  "Place a purchase order with a supplier, then receive goods against it as they arrive, in one or several deliveries. Receiving adds stock at the ordered price. \"Receive purchase\" records goods that arrived without an order. To send goods back, open the purchase receipt and choose \"Return to supplier\".": ["أنشئ أمر شراء لدى المورد ثم استلم البضاعة عند وصولها على دفعة أو عدة دفعات، فتُضاف إلى المخزون بسعر الطلب. \"استلام مشتريات\" لبضاعة وصلت دون طلب. لإرجاع بضاعة افتح إيصال الشراء واختر \"إرجاع إلى المورد\".", "سپلائر کو پرچیز آرڈر دیں، پھر مال آنے پر ایک یا کئی بار وصول کریں؛ اسٹاک آرڈر کی قیمت پر بڑھتا ہے۔ بغیر آرڈر آئے مال کے لیے \"خریداری وصول کریں\"۔ مال واپس کرنے کے لیے خریداری کی رسید کھول کر \"سپلائر کو واپسی\" چنیں۔"],
  "Opening stock, adjustments and transfers require a reason. Purchase receipts, production and sales update this ledger automatically.": ["الرصيد الافتتاحي والتعديلات والنقل تتطلب سببًا. إيصالات الشراء والإنتاج والمبيعات تحدّث هذا السجل تلقائيًا.", "ابتدائی اسٹاک، ترمیم اور منتقلی کے لیے وجہ ضروری ہے۔ خریداری، پیداوار اور فروخت یہ کھاتہ خود اپ ڈیٹ کرتے ہیں۔"],
  "Batch materials and packaging are issued from the approved per-bottle BOM. Actual consumption overrides, staged bottling and rework are later-stage features.": ["تُصرف مواد الدفعة والتغليف حسب قائمة المواد المعتمدة لكل زجاجة.", "بیچ کا مواد اور پیکیجنگ منظور شدہ فی بوتل فہرست کے مطابق نکلتی ہے۔"],
  "This build uses material quantities in each item's base unit per bottle. It does not convert density or mass/volume automatically. Released versions are preserved.": ["تُستخدم كميات المواد بالوحدة الأساسية لكل زجاجة دون تحويل تلقائي للكثافة أو الكتلة/الحجم. الإصدارات المعتمدة محفوظة.", "مواد کی مقدار ہر آئٹم کے بنیادی یونٹ میں فی بوتل ہے؛ کثافت یا وزن/حجم خود نہیں بدلتا۔ منظور شدہ ورژن محفوظ رہتے ہیں۔"],
  "Artwork approvals are recorded by authorized managers, with their identity and comments. A customer approval portal and production-order linkage are later-stage features.": ["يسجّل المديرون المخوّلون اعتماد التصاميم مع هويتهم وتعليقاتهم.", "مجاز مینیجر آرٹ ورک کی منظوری اپنے نام اور تبصرے کے ساتھ درج کرتے ہیں۔"],
  "Gross profit = sales after discounts, excluding tax − cost of goods sold. It excludes general business expenses. Stock is consumed in receipt order. Existing stock is valued from configured costs when tracking begins; historical invoices without cost snapshots remain uncosted.": ["إجمالي الربح = المبيعات بعد الخصم دون ضريبة − تكلفة البضاعة المباعة، ولا يشمل المصاريف العامة. يُصرف المخزون حسب ترتيب الاستلام.", "مجموعی منافع = رعایت کے بعد فروخت (بغیر ٹیکس) − فروخت شدہ مال کی لاگت؛ عام اخراجات شامل نہیں۔ اسٹاک وصولی کی ترتیب سے نکلتا ہے۔"],
  "Purchases excluding tax": ["المشتريات بدون ضريبة", "خریداری بغیر ٹیکس"],
  "Supplier bills": ["فواتير الموردين", "سپلائر بل"],
  "Active posted sales": ["المبيعات المرحّلة", "درج شدہ فروخت"],
  "Stock cost captured on sale": ["تكلفة المخزون عند البيع", "فروخت پر اسٹاک کی لاگت"],
  "Before general expenses": ["قبل المصاريف العامة", "عام اخراجات سے پہلے"],
  "Remaining / value": ["المتبقي / القيمة", "باقی / مالیت"],
  "Cost": ["التكلفة", "لاگت"],
  "Cost status": ["حالة التكلفة", "لاگت کی حالت"],
  "SQLite file": ["ملف SQLite", "SQLite فائل"],
  "MySQL / MariaDB": ["MySQL / MariaDB", "MySQL / MariaDB"],
  "Keeps the newest 14 backups in perfume-erp/storage/app/backups. Also keep cPanel's own backups switched on.": ["يحتفظ بآخر 14 نسخة في perfume-erp/storage/app/backups. أبقِ نسخ cPanel الاحتياطية مفعّلة أيضًا.", "آخری 14 بیک اپ perfume-erp/storage/app/backups میں رہتے ہیں۔ cPanel کے اپنے بیک اپ بھی آن رکھیں۔"],
  "No automatic backups yet. Add the daily cron job shown above in cPanel → Cron Jobs.": ["لا توجد نسخ تلقائية بعد. أضف مهمة Cron اليومية الموضحة أعلاه في cPanel.", "ابھی خودکار بیک اپ نہیں۔ اوپر دی گئی روزانہ Cron Job کو cPanel میں شامل کریں۔"],
  "Local LAN operation is supported by the server. Hybrid branch syncing, electronic invoicing and terminal drivers are not enabled.": ["التشغيل على الشبكة المحلية مدعوم. مزامنة الفروع والفوترة الإلكترونية وأجهزة الدفع غير مفعّلة.", "مقامی نیٹ ورک پر چلتا ہے۔ برانچ سنکنگ، الیکٹرانک انوائسنگ اور کارڈ مشین فعال نہیں۔"],
};

function translatePhrase(text) {
  const col = LANGUAGES[state.lang]?.column ?? -1;
  if (col < 0) return null;
  const hit = I18N_DICT[text] || I18N_EXTRA[text];
  if (hit) return hit[col];
  for (const [pattern, ar, ur] of I18N_PATTERNS) {
    const m = text.match(pattern);
    if (m) return (col === 0 ? ar : ur).replace(/\$(\d)/g, (_, i) => translatePhrase(m[i]) || m[i]);
  }
  return null;
}

function translateTextNode(node) {
  const raw = node.nodeValue;
  const text = raw.trim();
  if (!text || text.length > 600 || !/[A-Za-z]/.test(text)) return;
  const out = translatePhrase(text);
  if (out && out !== text) node.nodeValue = raw.replace(text, out);
}

function translateTree(root) {
  if (state.lang === 'en' || !root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest('script, style, [data-no-translate]')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && !n.parentElement.closest('script, style, textarea, [data-no-translate]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(translateTextNode);
  root.querySelectorAll('[placeholder], [aria-label], [title]').forEach(el => {
    ['placeholder', 'aria-label', 'title'].forEach(attr => {
      const value = el.getAttribute(attr);
      const out = value && translatePhrase(value.trim());
      if (out) el.setAttribute(attr, out);
    });
  });
}

/** Translate whatever is added to the page from now on. */
function watchLanguage() {
  if (state.lang === 'en') return;
  const pending = new Set();
  let queued = false;
  new MutationObserver(records => {
    records.forEach(r => r.addedNodes.forEach(n => pending.add(n)));
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      pending.forEach(translateTree);
      pending.clear();
    });
  }).observe(document.body, { childList: true, subtree: true });
  translateTree(document.body);
}

/** English → العربية → اردو. Reloads so every screen redraws in the new language. */
function cycleLanguage() {
  const order = Object.keys(LANGUAGES);
  const next = order[(order.indexOf(state.lang) + 1) % order.length];
  try {
    localStorage.setItem('atelier-lang', next);
  } catch {}
  location.reload();
}

state.lang = currentLanguage();
