/**
 * Bilingual copy for the public landing page.
 *
 * Every claim here is checkable against shipped behaviour. Three claims in
 * the original Figma copy were not, and were corrected rather than ported:
 *
 *  1. "At 12:00 AM it checks who hasn't submitted" — the scheduler is a
 *     300-second poll (`BackgroundScheduler(interval_seconds=300)`), and
 *     the task cycle is deadline-relative (`task_pre_hours`, default 24h
 *     before the deadline) rather than a fixed midnight run. The copy now
 *     describes deadline-relative follow-up.
 *  2. "Google Meet integration marks who joined" — `GoogleMeetAttendanceProvider
 *     .get_raw_meeting_attendance` is an unimplemented stub that returns
 *     `None`. Attendance is recorded by HR against a session. The Meet panel
 *     is described as a provider seam instead of a live feature.
 *  3. The scoreboard claim of "up 9 points from last month" — `scoring_service`
 *     returns no historical series, so a month-over-month delta cannot be
 *     computed and is not shown anywhere in the app. The demo now quotes the
 *     real scale instead (behaviour /23, plus task quality).
 *
 * The names in the demo transcript and the sample roster are fictional
 * placeholders, which is why they are confined to the scripted demo rather
 * than presented as records.
 */

export type LandingLang = 'en' | 'ar';

export interface FeatureItem {
  key: string;
  kicker: string;
  title: string;
  body: string;
}

export interface LandingContent {
  dir: 'ltr' | 'rtl';
  meta: { title: string; description: string };
  nav: { features: string; agent: string; cta: string; signIn: string };
  lang: { toggle: string; label: string };
  preloader: { line: string; skip: string };
  hero: {
    eyebrow: string;
    titleA: string;
    titleB: string;
    titleEm: string;
    sub: string;
    organize: string;
    organizing: string;
    organized: string;
    replay: string;
    bubble: string;
    stageLabel: string;
    stageHint: string;
  };
  week: {
    eyebrow: string;
    title: string;
    keepScrolling: string;
    stats: { n: number; label: string }[];
    noise: string[];
    silence: string;
    enter: string;
  };
  features: { eyebrow: string; items: FeatureItem[] };
  agent: {
    eyebrow: string;
    title: string;
    body: string;
    confirmNote: string;
    placeholder: string;
    send: string;
    suggestions: string[];
    typing: string;
    online: string;
    you: string;
    rosterLabel: string;
    roster: { name: string; present: boolean }[];
    presentLabel: string;
    missedLabel: string;
    tools: { checking: string; scoring: string; sending: string; reviewing: string };
  };
  finale: { eyebrow: string; title: string; body: string; cta: string; note: string };
  footer: { tag: string; line: string; cols: { h: string; links: { label: string; href: string }[] }[]; rights: string };
}

const EN: LandingContent = {
  dir: 'ltr',
  meta: {
    title: 'StudentOps — Run your org. Not your group chats.',
    description:
      'Attendance, tasks, scoring and follow-up for student organizations, in one system with role-based access.',
  },
  nav: { features: 'Features', agent: 'The agent', cta: 'Get started', signIn: 'Sign in' },
  lang: { toggle: 'العربية', label: 'Switch to Arabic' },
  preloader: { line: 'gathering the chaos', skip: 'Skip' },
  hero: {
    eyebrow: 'Operations for student organizations',
    titleA: 'Run your org.',
    titleB: 'Not your',
    titleEm: 'group chats.',
    sub: "StudentOps replaces the pings, the spreadsheets and the “did u submit??” with one system that keeps the record for you.",
    organize: 'Hold to organize',
    organizing: 'Organizing',
    organized: 'Order.',
    replay: 'replay',
    bubble: 'Watch this.',
    stageLabel: 'studentops · committee',
    stageHint: 'Hold the button, or press Enter, to sort the noise into a roster.',
  },
  week: {
    eyebrow: 'A week in the life',
    title: 'Every organizer knows this feeling.',
    keepScrolling: 'keep scrolling →',
    stats: [
      { n: 47, label: 'unread messages' },
      { n: 12, label: '“salam?” pings' },
      { n: 3, label: 'missed deadlines' },
      { n: 0, label: 'hours of peace' },
    ],
    noise: [
      'did u submit??',
      'salam?',
      'guys the meeting??',
      "who's doing the slides",
      '@everyone reminder',
      'is this due today',
      'sorry i missed it',
      'can someone screenshot',
      'wait what channel',
    ],
    silence: 'Then — silence.',
    enter: 'Meet the one who keeps up.',
  },
  features: {
    eyebrow: 'What it does',
    items: [
      {
        key: 'reminders',
        kicker: 'Reminders',
        title: 'It follows up so you don’t have to.',
        body: 'Missed submissions and unexcused absences are detected, then queued for a person to approve before anything is sent over WhatsApp.',
      },
      {
        key: 'attendance',
        kicker: 'Attendance',
        title: 'Attendance against your own policy.',
        body: 'HR records who attended each session. Statuses are evaluated by the 70% and 50% thresholds your organization sets, not by interpretation.',
      },
      {
        key: 'tasks',
        kicker: 'Tasks & review',
        title: 'Submit once. Reviewed cleanly.',
        body: 'Members hand in work in one place. Technical and HR reviewers work in their own lanes — nothing lost in a thread.',
      },
      {
        key: 'scoring',
        kicker: 'Scoring',
        title: 'A score you can explain.',
        body: 'Behavior is scored out of 23 across group interaction, social media, hierarchy and conduct, alongside task quality and attendance.',
      },
      {
        key: 'calendar',
        kicker: 'Calendar',
        title: 'One source of truth for dates.',
        body: 'Sessions, deadlines and events on a shared calendar, with Google Calendar as a provider seam. Everyone looking at the same week.',
      },
    ],
  },
  agent: {
    eyebrow: 'The agent',
    title: 'Ask. It acts.',
    body: 'Not a chatbot that shrugs. It retrieves member information, reads scores and attendance, and takes real actions.',
    confirmNote: 'Anything that sends a message or changes a record waits for your confirmation first.',
    placeholder: 'Ask about a member, or type “remind”…',
    send: 'Send',
    suggestions: ['Who missed this week?', 'Remind them', 'Show attendance'],
    typing: 'typing',
    online: 'online',
    you: 'You',
    rosterLabel: 'attendance this week',
    presentLabel: 'present',
    missedLabel: 'missed',
    // Fictional, and confined to the scripted demo below the fold. Never
    // presented as a record from a real committee.
    roster: [
      { name: 'Sara M.', present: true },
      { name: 'Youssef A.', present: false },
      { name: 'Lina K.', present: true },
      { name: 'Omar T.', present: false },
    ],
    tools: {
      checking: 'checking submissions',
      scoring: 'reading scores',
      sending: 'sending reminder',
      reviewing: 'reading attendance',
    },
  },
  finale: {
    eyebrow: 'From chaos to committee',
    title: 'Ready to bring order?',
    body: 'Stop refereeing group chats. Give your organization a system that keeps up with it.',
    cta: 'Start with StudentOps',
    note: 'No lorem. No logos you don’t have. Just the system.',
  },
  footer: {
    tag: 'StudentOps',
    line: 'Run your org. Not your group chats.',
    cols: [
      {
        h: 'Product',
        links: [
          { label: 'Reminders', href: '#features' },
          { label: 'Attendance', href: '#features' },
          { label: 'Tasks', href: '#features' },
          { label: 'Scoring', href: '#features' },
          { label: 'Calendar', href: '#features' },
        ],
      },
      {
        // The role ladder was its own section and has been removed. The column
        // is kept and repointed rather than deleted, because a three-column
        // footer on a page this typographic reads better than two, and every
        // link now resolves to a destination that exists.
        h: 'Access',
        links: [
          { label: 'Sign in', href: '/login' },
          { label: 'Create account', href: '/signup' },
          { label: 'Get started', href: '#finale' },
        ],
      },
      {
        h: 'More',
        links: [
          { label: 'The agent', href: '#agent' },
          { label: 'Features', href: '#features' },
        ],
      },
    ],
    rights: 'Built for the people who run things.',
  },
};

const AR: LandingContent = {
  dir: 'rtl',
  meta: {
    title: 'ستودنت‌أوبس — أدِر نشاطك، لا مجموعات الواتساب.',
    description: 'الحضور والمهام والتقييم والمتابعة لنشطات الطلاب، في نظام واحد بصلاحيات حسب الدور.',
  },
  nav: { features: 'المزايا', agent: 'المساعد', cta: 'ابدأ الآن', signIn: 'تسجيل الدخول' },
  lang: { toggle: 'English', label: 'التبديل للإنجليزية' },
  preloader: { line: 'نلمّ الفوضى', skip: 'تخطّي' },
  hero: {
    eyebrow: 'تشغيل ذكي للأنشطة الطلابية',
    titleA: 'أدِر نشاطك الطلابي،',
    titleB: 'لا',
    titleEm: 'مجموعات الواتساب.',
    sub: 'ستودنت‌أوبس بيستبدل الرنّات والجداول ورسائل «قدّمت ولا لسه؟؟» بنظام واحد بيحفظلك السجل.',
    organize: 'اضغط مطوّلًا لتنظّم',
    organizing: 'جارٍ التنظيم',
    organized: 'نظام.',
    replay: 'إعادة',
    bubble: 'بصّ هنا.',
    stageLabel: 'ستودنت‌أوبس · اللجنة',
    stageHint: 'اضغط المطوّل على الزر، أو اضغط Enter، عشان ترتّب الفوضى في قائمة.',
  },
  week: {
    eyebrow: 'أسبوع في حياة منظّم',
    title: 'كل منظّم بيعرف الإحساس ده.',
    keepScrolling: '← اسحب',
    stats: [
      { n: 47, label: 'رسالة غير مقروءة' },
      { n: 12, label: 'رنّة «سلام؟»' },
      { n: 3, label: 'مواعيد فاتت' },
      { n: 0, label: 'ساعة راحة' },
    ],
    noise: [
      'قدّمت ولا لسه؟؟',
      'سلام؟',
      'يا جماعة الاجتماع؟؟',
      'مين هيعمل السلايدز',
      'تذكير للكل',
      'ده تسليمه النهاردة؟',
      'آسف فاتني',
      'حد ياخد سكرين',
      'استنى أنهي قناة',
    ],
    silence: 'وبعدين — سكون.',
    enter: 'اتعرّف على اللي بيلحق.',
  },
  features: {
    eyebrow: 'بيعمل إيه',
    items: [
      {
        key: 'reminders',
        kicker: 'المتابعات',
        title: 'هو اللي بيتبع، عشان انت تريّح.',
        body: 'التسليمات الناقصة والغياب بدون عذر بتتشاف، وبعدين بتستنى موافقة حد قبل ما تتبعت على الواتساب.',
      },
      {
        key: 'attendance',
        kicker: 'الحضور',
        title: 'حضور بسياسة بتاعتك.',
        body: 'الموارد البشرية بتسجّل مين حضر كل جلسة. الحالات بتتحسب بنسب الـ ٧٠٪ والـ ٥٠٪ اللي بتحدّدها مؤسستك، مش بالاجتهاد.',
      },
      {
        key: 'tasks',
        kicker: 'التسليم والمراجعة',
        title: 'سلّم مرة، وتتراجع بنظام.',
        body: 'الأعضاء بيسلّموا في مكان واحد. المراجع التقني والموارد البشرية كلٌّ في مساره — مفيش حاجة بتضيع.',
      },
      {
        key: 'scoring',
        kicker: 'التقييم',
        title: 'درجة تقدر تشرحلها.',
        body: 'السلوك بيتقيّم من ٢٣ موزّعين على التفاعل الجماعي والسوشيال والهرمية والمظهر، مع جودة التسليم والحضور.',
      },
      {
        key: 'calendar',
        kicker: 'التقويم',
        title: 'مصدر واحد لكل المواعيد.',
        body: 'جلسات ومواعيد نهائية وفعاليات في تقويم مشترك، مع Google Calendar كطبقة ربط. الكل بيبصّ لنفس الأسبوع.',
      },
    ],
  },
  agent: {
    eyebrow: 'المساعد',
    title: 'اسأل. وهو ينفّذ.',
    body: 'مش بوت بيرفع إيده. بيجيب بيانات الأعضاء، ويقرأ الدرجات والحضور، وياخد إجراءات فعلية.',
    confirmNote: 'أي حاجة بتبعت رسالة أو تغيّر سجل، بتستنى تأكيدك الأول.',
    placeholder: 'اسأل عن عضو، أو اكتب «ذكّر»…',
    send: 'إرسال',
    suggestions: ['مين غاب الأسبوع ده؟', 'ذكّرهم', 'اعرض الحضور'],
    typing: 'بيكتب',
    online: 'متصل',
    you: 'أنت',
    rosterLabel: 'حضور الأسبوع ده',
    presentLabel: 'حاضر',
    missedLabel: 'غائب',
    roster: [
      { name: 'سارة م.', present: true },
      { name: 'يوسف أ.', present: false },
      { name: 'لينا ك.', present: true },
      { name: 'عمر ط.', present: false },
    ],
    tools: {
      checking: 'يفحص التسليمات',
      scoring: 'يقرأ الدرجات',
      sending: 'يرسل تذكيرًا',
      reviewing: 'يقرأ الحضور',
    },
  },
  finale: {
    eyebrow: 'من الفوضى إلى نظام',
    title: 'جاهز تنظّم؟',
    body: 'بطّل تحكّم بين مجموعات الواتساب. اِدّي نشاطك نظام بيلحق بيه.',
    cta: 'ابدأ مع ستودنت‌أوبس',
    note: 'بدون حشو. بدون شعارات مش عندك. النظام بس.',
  },
  footer: {
    tag: 'ستودنت‌أوبس',
    line: 'أدِر نشاطك، لا مجموعات الواتساب.',
    cols: [
      {
        h: 'المنتج',
        links: [
          { label: 'المتابعات', href: '#features' },
          { label: 'الحضور', href: '#features' },
          { label: 'المهام', href: '#features' },
          { label: 'التقييم', href: '#features' },
          { label: 'التقويم', href: '#features' },
        ],
      },
      {
        h: 'الحساب',
        links: [
          { label: 'تسجيل الدخول', href: '/login' },
          { label: 'إنشاء حساب', href: '/signup' },
          { label: 'ابدأ الآن', href: '#finale' },
        ],
      },
      {
        h: 'المزيد',
        links: [
          { label: 'المساعد', href: '#agent' },
          { label: 'المزايا', href: '#features' },
        ],
      },
    ],
    rights: 'مصنوع لناس بتدير الأمور.',
  },
};

export const LANDING_CONTENT: Record<LandingLang, LandingContent> = { en: EN, ar: AR };
