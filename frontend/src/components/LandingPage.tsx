import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Languages,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { AgentMascot } from './AgentMascot';
import { useLanguage } from '../context/LanguageContext';

type ChaosItem = {
  text: string;
  tone: 'coral' | 'amber' | 'cyan' | 'violet';
  x: string;
  y: string;
  rotate: string;
};

const CHAOS: ChaosItem[] = [
  { text: 'did u submit??', tone: 'coral', x: '7%', y: '18%', rotate: '-7deg' },
  { text: '12:00 AM', tone: 'amber', x: '72%', y: '12%', rotate: '6deg' },
  { text: '47 unread', tone: 'cyan', x: '78%', y: '64%', rotate: '-5deg' },
  { text: 'where is the sheet', tone: 'violet', x: '10%', y: '70%', rotate: '4deg' },
  { text: 'deadline missed', tone: 'coral', x: '42%', y: '9%', rotate: '3deg' },
  { text: 'salam? salam?', tone: 'amber', x: '47%', y: '82%', rotate: '-4deg' },
];

const FEATURES = [
  { id: 'reminders', label: 'Reminders', icon: BellRing, title: 'It nags so you don’t have to.', body: 'StudentOps spots the quiet gaps, then follows up on schedule — even through WhatsApp.', visual: 'clock' },
  { id: 'attendance', label: 'Attendance', icon: Video, title: 'A room that remembers who showed up.', body: 'Google Meet attendance flows into the same record as the session, without another spreadsheet.', visual: 'tiles' },
  { id: 'tasks', label: 'Tasks', icon: ClipboardCheck, title: 'From “soon” to submitted.', body: 'Members submit in one place. Tech and HR review in the view built for them.', visual: 'lane' },
  { id: 'scoring', label: 'Scoring', icon: Sparkles, title: 'Feedback that has somewhere to land.', body: 'Technical and behaviour scores stay tied to the member, the task and the month.', visual: 'score' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, title: 'The week, finally in one shape.', body: 'Sessions, deadlines and events share one calendar your whole committee can read.', visual: 'calendar' },
] as const;

const ROLES = [
  { name: 'Member', note: 'Your tasks, attendance and questions.', sees: ['My tasks', 'My attendance', 'Committee Q&A'] },
  { name: 'Committee Head', note: 'The work moving through your committee.', sees: ['Task reviews', 'Session roster', 'Committee scores'] },
  { name: 'Regional Head', note: 'The signals that need leadership.', sees: ['All committees', 'Escalations', 'Reports'] },
];

const MESSAGES = [
  { from: 'bloub', text: 'I found 3 tasks waiting on a follow-up. Want me to check the list?' },
  { from: 'you', text: 'Check this week’s submissions.' },
  { from: 'bloub', text: 'On it. I’m checking submissions…' },
  { from: 'bloub', text: 'Two members are missing a submission. I can send a reminder with the deadline attached.' },
];

function FeatureVisual({ type }: { type: string }) {
  if (type === 'clock') return <div className="feature-visual clock-visual"><Clock3 size={76} strokeWidth={1.2} /><span>12:00 AM</span><i /><i /><i /></div>;
  if (type === 'tiles') return <div className="feature-visual tiles-visual">{['AM', 'SK', 'NA', 'HR', ''].map((label, index) => <div key={index} className={label ? 'person-tile' : 'person-tile empty'}><span>{label}</span>{label && <Check size={14} />}</div>)}</div>;
  if (type === 'lane') return <div className="feature-visual lane-visual"><div className="lane-card">Build onboarding form <span>reviewed</span></div><div className="lane-card">Upload session notes <span>in review</span></div><div className="lane-line" /></div>;
  if (type === 'score') return <div className="feature-visual score-visual"><div className="score-ring"><strong>18</strong><small>/ 23</small></div><div className="score-bars"><i style={{ height: '55%' }} /><i style={{ height: '76%' }} /><i style={{ height: '92%' }} /><i style={{ height: '68%' }} /></div></div>;
  return <div className="feature-visual calendar-visual">{['M', 'T', 'W', 'T', 'F'].map((day, index) => <div key={index}><small>{day}</small><strong>{12 + index}</strong><span>{index === 2 ? 'session' : index === 4 ? 'deadline' : ''}</span></div>)}</div>;
}

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  const { language, toggleLanguage } = useLanguage();
  const [organized, setOrganized] = useState(false);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [roleIndex, setRoleIndex] = useState(0);
  const [messages, setMessages] = useState(MESSAGES);
  const [query, setQuery] = useState('');
  const [showPreloader, setShowPreloader] = useState(true);
  const isArabic = language === 'ar';
  const feature = FEATURES[featureIndex];
  const role = ROLES[roleIndex];

  useEffect(() => {
    const timer = window.setTimeout(() => setShowPreloader(false), 850);
    return () => window.clearTimeout(timer);
  }, []);

  const copy = useMemo(() => isArabic ? {
    nav: 'StudentOps', kicker: 'للنشاطات والمنظمات الطلابية', hero: 'أدِر نشاطك الطلابي، لا مجموعات الواتساب.', sub: 'من الفوضى إلى نظام. مكان واحد للمهام، الحضور، التقييمات والمتابعة — عشان تركز على الناس، مش على البحث وراهم.', organize: 'نظّم الفوضى', explore: 'شوف كيف بيشتغل', signIn: 'تسجيل الدخول', start: 'ابدأ الآن', order: 'الفوضى → نظام', week: 'أسبوع المنظّم', role: 'كل شخص يرى ما يلزمه فقط', ask: 'اسأل Bloub أي حاجة عن نشاطك', ready: 'جاهز تنظّم؟', language: 'EN',
  } : {
    nav: 'StudentOps', kicker: 'FOR STUDENT ORGANIZATIONS', hero: 'Run your org. Not your group chats.', sub: 'From chaos to committee. One place for tasks, attendance, evaluations and follow-ups — so you can spend time on people, not chasing them.', organize: 'Organize the chaos', explore: 'See how it works', signIn: 'Sign in', start: 'Get started', order: 'CHAOS → ORDER', week: 'A week in the life of an organizer', role: 'Everyone sees exactly enough', ask: 'Ask Bloub anything about your org', ready: 'Ready to bring order?', language: 'عربي',
  }, [isArabic]);

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setMessages(prev => [...prev, { from: 'you', text: query.trim() }, { from: 'bloub', text: 'I’m on it. I’ll check the records and bring back what needs attention.' }]);
    setQuery('');
  }

  return <div className={`landing ${isArabic ? 'landing-ar' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
    {showPreloader && <div className="landing-preloader" role="status" aria-label="Loading StudentOps"><div className="preloader-mark"><AgentMascot sizePx={72} state="idle" follow={false} /><span>StudentOps</span></div><div className="preloader-line"><i /></div></div>}
    <a href="#landing-main" className="skip-link">Skip to content</a>
    <header className="landing-nav"><a href="/" className="landing-logo" aria-label="StudentOps home"><span className="logo-dot" />{copy.nav}</a><nav aria-label="Main navigation"><a href="#features">{isArabic ? 'المميزات' : 'The system'}</a><a href="#roles">{isArabic ? 'الأدوار' : 'Roles'}</a><a href="#agent">{isArabic ? 'المساعد' : 'The agent'}</a></nav><div className="nav-actions"><button className="language-button" onClick={toggleLanguage} aria-label={`Switch language to ${copy.language}`}><Languages size={16} />{copy.language}</button><a className="text-link" href={signedIn ? '/app/dashboard' : '/login'}>{signedIn ? (isArabic ? 'مساحة العمل' : 'Workspace') : copy.signIn}</a><a className="dark-button small" href="/signup">{copy.start}<ArrowRight size={15} /></a></div></header>

    <main id="landing-main">
      <section className="hero-section">
        <div className="hero-copy"><p className="section-kicker">{copy.kicker}</p><h1>{isArabic ? <>أدِر نشاطك الطلابي، <em>لا مجموعات الواتساب.</em></> : <>Run your org. <em>Not your group chats.</em></>}</h1><p className="hero-sub">{copy.sub}</p><div className="hero-ctas"><button className={`lime-button organize-button ${organized ? 'is-organized' : ''}`} onClick={() => setOrganized(true)}><span>{organized ? (isArabic ? 'تم الترتيب' : 'Order restored') : copy.organize}</span><ArrowRight size={18} /></button><a href="#week" className="quiet-link"><Play size={14} fill="currentColor" />{copy.explore}</a></div><p className="hero-footnote">{isArabic ? 'بصلاحيات واضحة، وبدون اختراع أرقام.' : 'Clear roles. Real records. No invented numbers.'}</p></div>
        <div className={`chaos-playground ${organized ? 'organized' : ''}`} aria-label={isArabic ? 'مشهد الفوضى يتحول إلى نظام' : 'Interactive chaos playground'}><div className="playground-grid" />{CHAOS.map(item => <div key={item.text} className={`chaos-object ${item.tone}`} style={{ left: item.x, top: item.y, transform: `rotate(${item.rotate})` }}>{item.text}</div>)}<div className="bloub-hero"><AgentMascot sizePx={organized ? 174 : 148} state={organized ? 'wide' : 'idle'} follow /><div className="bloub-bubble">{organized ? (isArabic ? 'أهو كده!' : 'Much better.') : (isArabic ? 'سيبها عليّ.' : 'Leave it with me.')}</div></div><div className="playground-label"><span>01</span>{copy.order}</div></div>
      </section>

      <section id="week" className="week-section"><div className="week-top"><p className="section-kicker light">02 / {copy.week}</p><span className="mono-label">{isArabic ? 'من الإثنين إلى الأحد' : 'MONDAY — SUNDAY'}</span></div><div className="week-story"><div className="week-number">47</div><div><p className="week-quote">{isArabic ? 'لسه هنبدأ؟' : '“Did u submit??”'}</p><p className="week-note">{isArabic ? 'رسائل، جداول، ومواعيد تضيع في النص.' : 'Messages, sheets, and deadlines disappearing into the scroll.'}</p></div></div><div className="week-pings"><span>12 {isArabic ? 'رسالة سلام؟' : '“salam?” pings'}</span><span>3 {isArabic ? 'مواعيد فائتة' : 'missed deadlines'}</span><span>1 {isArabic ? 'منظّم متعب' : 'tired organizer'}</span></div><div className="week-cut"><AgentMascot sizePx={100} state="sleep" follow={false} /><span>{isArabic ? 'ثم… هدوء.' : 'Then… silence.'}</span></div></section>

      <section id="features" className="feature-section"><div className="feature-intro"><p className="section-kicker">03 / {isArabic ? 'النظام' : 'THE SYSTEM'}</p><h2>{isArabic ? 'الفوضى لها علاج.' : 'Chaos has a system.'}</h2><p>{isArabic ? 'المميزات دي مش جزر منفصلة. هي سلسلة واحدة تخلي الشغل يمشي.' : 'Not a pile of features. One connected rhythm that keeps the work moving.'}</p></div><div className="feature-stage"><div className="feature-tabs" role="tablist" aria-label="StudentOps features">{FEATURES.map((item, index) => { const Icon = item.icon; return <button key={item.id} role="tab" aria-selected={index === featureIndex} className={index === featureIndex ? 'active' : ''} onClick={() => setFeatureIndex(index)}><Icon size={16} />{item.label}</button> })}</div><div className="feature-panel"><div className="feature-text"><span className="feature-index">0{featureIndex + 1}</span><h3>{feature.title}</h3><p>{feature.body}</p><button className="arrow-button" onClick={() => setFeatureIndex((featureIndex + 1) % FEATURES.length)}>{isArabic ? 'التالي' : 'Next scene'} <ArrowRight size={16} /></button></div><FeatureVisual type={feature.visual} /></div></div></section>

      <section id="roles" className="roles-section"><div className="roles-heading"><p className="section-kicker light">04 / {isArabic ? 'الأدوار' : 'PERSPECTIVE'}</p><h2>{copy.role}</h2><p>{isArabic ? 'الصلاحيات مش تعقيد. هي طريقة نحافظ بيها على تركيز كل شخص.' : 'Permissions aren’t bureaucracy. They’re how every person keeps the right amount of focus.'}</p></div><div className="role-switcher"><div className="role-list" role="tablist" aria-label="Roles">{ROLES.map((item, index) => <button key={item.name} role="tab" aria-selected={roleIndex === index} className={roleIndex === index ? 'active' : ''} onClick={() => setRoleIndex(index)}><span>0{index + 1}</span>{item.name}<ChevronDown size={15} /></button>)}</div><div className="role-screen"><div className="screen-top"><span className="screen-dot" /><span>{role.name} / workspace</span><span className="screen-lock"><ShieldCheck size={14} /> scoped view</span></div><div className="screen-body"><div className="mini-sidebar"><i /><i /><i /><i /></div><div className="mini-content"><div className="mini-title"><span>{role.note}</span><small>Today</small></div><div className="mini-rows">{role.sees.map((item, index) => <div key={item} className="mini-row"><span className={`mini-icon tone-${index}`} />{item}<b>{index === 1 ? '12' : index === 2 ? '3' : 'View'}</b></div>)}</div></div></div></div></div><div className="escalation-line"><span className="node one" /><span className="node two" /><span className="node three" /><span>{isArabic ? 'إذا لم تتم المتابعة خلال 3 أيام، يصل التنبيه للقيادة.' : 'If a follow-up waits 3 days, leadership gets the signal.'}</span></div></section>

      <section id="agent" className="agent-section"><div className="agent-heading"><p className="section-kicker">05 / {isArabic ? 'المساعد' : 'THE AGENT'}</p><h2>{isArabic ? 'قلها بصوت عالي.' : 'Say the messy thing out loud.'}</h2><p>{isArabic ? 'Bloub يقرأ السجلات، يفهم المطلوب، ويستأذن قبل ما ياخد إجراء.' : 'Bloub reads the records, understands the ask, and checks before taking an action.'}</p></div><div className="agent-demo"><div className="agent-side"><AgentMascot sizePx={180} state={query ? 'thinking' : 'idle'} follow /><div className="agent-status"><span />{isArabic ? 'متاح للمساعدة' : 'ready to help'}</div></div><div className="chat-window"><div className="chat-top"><span>StudentOps / Bloub</span><span className="mono-label">LIVE AGENT</span></div><div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div key={`${message.text}-${index}`} className={`chat-message ${message.from}`}>{message.from === 'bloub' && <span className="chat-avatar">B</span>}<p>{message.text}</p></div>)}</div><form className="chat-form" onSubmit={sendMessage}><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isArabic ? 'مثال: مين لسه ما سلّمش؟' : 'Try: who has not submitted yet?'} aria-label={copy.ask} /><button aria-label="Send message" type="submit"><Send size={17} /></button></form></div></div></section>

      <section className="finale-section"><div className="finale-orbit orbit-one" /><div className="finale-orbit orbit-two" /><AgentMascot sizePx={210} state="wide" follow /><p className="section-kicker">06 / STUDENTOPS</p><h2>{copy.ready}</h2><p>{isArabic ? 'خلي Bloub يشيل عنك الجزء الممل.' : 'Let Bloub take the boring part from here.'}</p><a className="lime-button" href="/signup">{copy.start}<ArrowRight size={18} /></a></section>
    </main>
    <footer className="landing-footer"><span>StudentOps © 2026</span><span>{isArabic ? 'مبني للمنظمات التي تتحرك.' : 'Built for organizations in motion.'}</span><a href="#landing-main"><ArrowDownRight size={16} /> top</a></footer>
  </div>;
}

export default LandingPage;
