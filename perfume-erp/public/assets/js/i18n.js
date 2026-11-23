/* Atelier Perfume ERP · Language switch (English / العربية) and right-to-left layout.
   Interface phrases are swapped after each screen draws; data such as names and numbers is left alone. */
'use strict';

const LANGUAGES = { en: { label: 'English', dir: 'ltr' }, ar: { label: 'العربية', dir: 'rtl' } };

function currentLanguage() {
  try {
    return LANGUAGES[localStorage.getItem('atelier-lang')] ? localStorage.getItem('atelier-lang') : 'en';
  } catch {
    return 'en';
  }
}

/** Phrases that carry numbers or names: [pattern, Arabic] using $1, $2… */
const I18N_PATTERNS = [
  [/^Good to see you, (.+)\.$/, 'أهلًا بك يا $1.'],
  [/^(.+) · here is what is happening across your perfume business\.$/, '$1 · إليك ما يجري في أعمال العطور لديك.'],
  [/^Filter (\d+) rows…$/, 'تصفية $1 صف…'],
  [/^(\d+)–(\d+) of (\d+) matching$/, '$1–$2 من $3 مطابقة'],
  [/^(\d+)–(\d+) of (\d+)$/, '$1–$2 من $3'],
  [/^No matching rows$/, 'لا توجد نتائج مطابقة'],
  [/^(\d+) active products · Inspiration references are internal staff information\.$/, '$1 منتج نشط · مراجع الإلهام معلومات داخلية للموظفين.'],
  [/^Inspiration library · (\d+) references$/, 'مكتبة الإلهام · $1 مرجع'],
  [/^Development release · (.+)$/, 'إصدار تطويري · $1'],
  [/^(\d+) posted sales and invoices$/, '$1 عملية بيع وفاتورة'],
  [/^([\d.]+)% margin on costed sales$/, 'هامش $1% على المبيعات محسوبة التكلفة'],
  [/^▲ (\d+)% vs previous 30 days$/, '▲ $1% مقارنة بالـ30 يومًا السابقة'],
  [/^▼ (\d+)% vs previous 30 days$/, '▼ $1% مقارنة بالـ30 يومًا السابقة'],
  [/^(\d+) bottles? sold$/, 'بيع $1 زجاجة'],
  [/^Paid · (Cash|Card|Bank)$/, 'مدفوع · $1'],
  [/^Customer: (.+)$/, 'العميل: $1'],
  [/^(\d+) day(s)?$/, '$1 يوم'],
  [/^Held \((\d+)\)$/, 'معلقة ($1)'],
  [/^Paid (.+)$/, 'المدفوع $1'],
  [/^(\d+) open documents?( · oldest (\d+) days late)?$/, '$1 مستند مفتوح'],
  [/^Statement · (.+)$/, 'كشف حساب · $1'],
  [/^([\d.]+%|—) gross margin$/, 'هامش إجمالي $1'],
  [/^([\d.−-]+%|—) net margin$/, 'هامش صافٍ $1'],
  [/^(\d+) sold line\(s\) have no recorded cost, so cost of goods may be understated\.$/, '$1 بند مباع بدون تكلفة مسجلة، لذا قد تكون تكلفة البضاعة أقل من الفعلية.'],
  [/^(\d+) entr(y|ies)$/, '$1 قيد'],
  [/^VAT (AED .+)$/, 'الضريبة $1'],
  [/^Void (EXP-\d+)$/, 'إلغاء $1'],
  [/^Voided · (.+)$/, 'ملغى · $1'],
  [/^([\d,.]+) in stock$/, 'متوفر $1'],
  [/^(.+) \/ (bottle|piece|hour|box|carton|litre)$/, '$1 / $2'],
  [/^(.+) · (Men|Women|Unisex)$/, '$1 · $2'],
  [/^(\d+) design or packaging projects? in progress\.$/, '$1 مشروع تصميم أو تغليف قيد التنفيذ.'],
  [/^Development release (.+)\.$/, 'إصدار تطويري $1.'],
  [/^· (\d+) invoices include estimated costs · (\d+) invoices have missing historical costs\.$/, '· $1 فاتورة بتكاليف تقديرية · $2 فاتورة بدون تكلفة تاريخية.'],
];

const I18N_EXTRA = {
  RECEIPT: 'إيصال',
  RETURN: 'إرجاع',
  TOTAL: 'الإجمالي',
  INVOICE: 'فاتورة',
  QUOTATION: 'عرض سعر',
  'SALES RECEIPT': 'إيصال بيع',
  'PURCHASE ORDER': 'أمر شراء',
  PURCHASE: 'شراء',
  'RETURN TO SUPPLIER': 'إرجاع إلى المورد',
  'Thank you for your business.': 'شكرًا لتعاملكم معنا.',
  'Thank you for your visit.': 'شكرًا لزيارتكم.',
  'Walk-in customer': 'عميل نقدي',
  'Walk-in': 'عميل نقدي',
  'Payment received': 'تم استلام الدفعة',
  "+ Add customer": "+ إضافة عميل",
  "+ Add product": "+ إضافة منتج",
  "+ Adjust / transfer stock": "+ تعديل / نقل المخزون",
  "+ Quotation": "+ عرض سعر",
  "+ Create invoice": "+ إنشاء فاتورة",
  "+ Purchase order": "+ أمر شراء",
  "+ Receive purchase": "+ استلام مشتريات",
  "+ Plan batch": "+ تخطيط دفعة",
  "+ Formula version": "+ إصدار تركيبة",
  "+ New project": "+ مشروع جديد",
  "+ Stock location": "+ موقع مخزون",
  "+ Invite / create user": "+ دعوة / إنشاء مستخدم",
  "+ Add item": "+ إضافة صنف",
  "+ Add one": "+ إضافة واحد",
  "+ Split payment": "+ تقسيم الدفع",
  "Customers": "العملاء",
  "Suppliers": "الموردون",
  "Close shift · active": "إغلاق الوردية · نشطة",
  "Open shift · required": "فتح الوردية · مطلوب",
  "Internal material": "مادة داخلية",
  "Service": "خدمة",
  "No records yet.": "لا توجد سجلات بعد.",
  "Quotations, posted invoices, payments and full returns.": "عروض الأسعار والفواتير المرحّلة والمدفوعات والمرتجعات.",
  "Invoices deduct stock immediately. Quotations do not reserve or deduct stock. Separate sales orders, partial deliveries and partial returns are later-stage features.": "الفواتير تخصم المخزون فورًا. عروض الأسعار لا تحجز ولا تخصم المخزون.",
  "Record supplier purchases and receive stock into a location.": "سجّل مشتريات الموردين واستلم المخزون في موقع.",
  "Place a purchase order with a supplier, then receive goods against it as they arrive, in one or several deliveries. Receiving adds stock at the ordered price. \"Receive purchase\" records goods that arrived without an order. To send goods back, open the purchase receipt and choose \"Return to supplier\".": "أنشئ أمر شراء لدى المورد ثم استلم البضاعة عند وصولها على دفعة أو عدة دفعات، فتُضاف إلى المخزون بسعر الطلب. \"استلام مشتريات\" لبضاعة وصلت دون طلب. لإرجاع بضاعة افتح إيصال الشراء واختر \"إرجاع إلى المورد\".",
  "Opening stock, adjustments and transfers require a reason. Purchase receipts, production and sales update this ledger automatically.": "الرصيد الافتتاحي والتعديلات والنقل تتطلب سببًا. إيصالات الشراء والإنتاج والمبيعات تحدّث هذا السجل تلقائيًا.",
  "Batch materials and packaging are issued from the approved per-bottle BOM. Actual consumption overrides, staged bottling and rework are later-stage features.": "تُصرف مواد الدفعة والتغليف حسب قائمة المواد المعتمدة لكل زجاجة.",
  "This build uses material quantities in each item's base unit per bottle. It does not convert density or mass/volume automatically. Released versions are preserved.": "تُستخدم كميات المواد بالوحدة الأساسية لكل زجاجة دون تحويل تلقائي للكثافة أو الكتلة/الحجم. الإصدارات المعتمدة محفوظة.",
  "Artwork approvals are recorded by authorized managers, with their identity and comments. A customer approval portal and production-order linkage are later-stage features.": "يسجّل المديرون المخوّلون اعتماد التصاميم مع هويتهم وتعليقاتهم.",
  "Gross profit = sales after discounts, excluding tax − cost of goods sold. It excludes general business expenses. Stock is consumed in receipt order. Existing stock is valued from configured costs when tracking begins; historical invoices without cost snapshots remain uncosted.": "إجمالي الربح = المبيعات بعد الخصم دون ضريبة − تكلفة البضاعة المباعة، ولا يشمل المصاريف العامة. يُصرف المخزون حسب ترتيب الاستلام.",
  "Purchases excluding tax": "المشتريات بدون ضريبة",
  "Supplier bills": "فواتير الموردين",
  "Active posted sales": "المبيعات المرحّلة",
  "Stock cost captured on sale": "تكلفة المخزون عند البيع",
  "Before general expenses": "قبل المصاريف العامة",
  "Remaining / value": "المتبقي / القيمة",
  "Cost": "التكلفة",
  "Cost status": "حالة التكلفة",
  "SQLite file": "ملف SQLite",
  "MySQL / MariaDB": "MySQL / MariaDB",
  "Keeps the newest 14 backups in perfume-erp/storage/app/backups. Also keep cPanel's own backups switched on.": "يحتفظ بآخر 14 نسخة في perfume-erp/storage/app/backups. أبقِ نسخ cPanel الاحتياطية مفعّلة أيضًا.",
  "No automatic backups yet. Add the daily cron job shown above in cPanel → Cron Jobs.": "لا توجد نسخ تلقائية بعد. أضف مهمة Cron اليومية الموضحة أعلاه في cPanel.",
  "Local LAN operation is supported by the server. Hybrid branch syncing, electronic invoicing and terminal drivers are not enabled.": "التشغيل على الشبكة المحلية مدعوم. مزامنة الفروع والفوترة الإلكترونية وأجهزة الدفع غير مفعّلة.",
};

function translatePhrase(text) {
  if (state.lang !== 'ar') return null;
  const hit = I18N_DICT[text] || I18N_EXTRA[text];
  if (hit) return hit;
  for (const [pattern, ar] of I18N_PATTERNS) {
    const m = text.match(pattern);
    if (m) return ar.replace(/\$(\d)/g, (_, i) => translatePhrase(m[i]) || m[i]);
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

/** English ⇄ العربية. Reloads so every screen redraws in the new language; a cookie lets the server answer in the same language. */
function cycleLanguage() {
  const order = Object.keys(LANGUAGES);
  const next = order[(order.indexOf(state.lang) + 1) % order.length];
  setLanguage(next);
  location.reload();
}

state.lang = currentLanguage();

function setLanguage(lang) {
  try {
    localStorage.setItem('atelier-lang', lang);
  } catch {}
  document.cookie = 'atelier_lang=' + lang + '; path=/; max-age=31536000; SameSite=Lax';
}

/* Keep the server-side language cookie in step with this browser's choice. */
if (state.lang === 'ar' && !document.cookie.includes('atelier_lang=ar')) setLanguage('ar');
if (state.lang === 'en' && document.cookie.includes('atelier_lang=ar')) setLanguage('en');
