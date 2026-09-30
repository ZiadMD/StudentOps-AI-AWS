import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, Send } from 'lucide-react';
import { LandingMascot, type LandingMascotMood } from './LandingMascot';
import type { LandingContent } from './content';
import { wait } from './hooks';

interface Message {
  role: 'user' | 'agent';
  text: string;
  tools?: string[];
  roster?: { name: string; present: boolean }[];
}

interface Scripted {
  match: string[];
  tools: string[];
roster?: boolean;
  reply: string;
}

/**
 * Four scripted exchanges, matched on keywords in the visitor's input.
 *
 * This is a scripted demo, not a live agent: the landing page is public and
 * unauthenticated, so it cannot call `/agent/stream`, and inventing a
 * "conversational" box that answers by keyword would be the kind of thing
 * that reads as working and is not. The names in the transcripts are
 * fictional placeholders for the same reason.
 */
function scriptedIntents(content: LandingContent): Scripted[] {
  const tools = content.agent.tools;
  const en = content.dir === 'ltr';

  return [
    {
      match: ['miss', 'absent', 'غاب', 'غائب'],
      tools: [tools.checking, tools.reviewing],
      roster: true,
      reply: en
        ? 'Two members missed this week and neither has submitted the recap task. Both are above the absence threshold, so they are flagged for follow-up. Want me to draft a reminder?'
        : 'عضوين فاتهم الأسبوع ده وما سلّمومش مهمة التلخيص. الاتنين فوق حد الغياب، فبتم تعليمهم للمتابعة. أعمّلك تذكير؟',
    },
    {
      match: ['remind', 'ذكّر', 'ذكر'],
      tools: [tools.checking, tools.sending],
      reply: en
        ? 'Drafted. The reminders are queued for your approval rather than sent — confirm and they go out over WhatsApp, and anyone still outstanding after three days escalates to leadership.'
        : 'مسوّدة. التذكيرات مستنية موافقتك مش هتبعت — أكّد و هتبعت على الواتساب، وأي حد لسه متأخر بعد ٣ أيام هيتصعّد للقيادة.',
    },
    {
      match: ['attend', 'حضور', 'meet', 'حضر'],
      tools: [tools.reviewing],
      roster: true,
      reply: en
        ? 'This week: two present, two missed. Presence is evaluated against your 70% threshold, and the two misses are now flagged for follow-up.'
        : 'الأسبوع ده: اتنين حضر، اتنين غاب. الحضور بيتقيّم بنسبة الـ ٧٠٪، والاتنين غيابهم اتعلّموا للمتابعة.',
    },
    {
      match: ['score', 'درج', 'تقييم', 'سلوك'],
      tools: [tools.scoring],
      reply: en
        ? 'Behaviour is 18 out of 23 — group interaction 4, social media 4, hierarchy 5, conduct 5. Task quality is tracked separately, and the absence count is what decides the final rating.'
        : 'السلوك ١٨ من ٢٣ — تفاعل جماعي ٤، سوشيال ٤، هرمية ٥، conduct ٥. جودة التسليم متتبعة لوحدها، وعدد الغيابات هو اللي بيحسم التقييم النهائي.',
    },
  ];
}

/**
 * The scripted agent panel.
 *
 * Replies are typed out rather than revealed at once, because the point of
 * the section is that the agent does work before it answers — the tool chips
 * appear first, then the text streams. Under reduced motion the whole reply
 * is committed immediately.
 */
export function AgentDemo({
  content,
  reducedMotion,
}: {
  content: LandingContent;
  reducedMotion: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [mood, setMood] = useState<LandingMascotMood>('idle');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const scripts = useMemo(() => scriptedIntents(content), [content]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const run = useCallback(
    async (text: string) => {
      if (busy || !text.trim()) return;

      setBusy(true);
      setMessages(previous => [...previous, { role: 'user', text }]);
      setInput('');
      setMood('thinking');

      const lowered = text.toLowerCase();
      const intent =
        scripts.find(candidate => candidate.match.some(keyword => lowered.includes(keyword))) ?? scripts[0];

      for (let index = 0; index < intent.tools.length; index += 1) {
        await wait(reducedMotion ? 60 : 520);
      }

      const complete = intent.reply;

      if (reducedMotion) {
        setMessages(previous => [
          ...previous,
          { role: 'agent', text: complete, tools: intent.tools, roster: intent.roster ? content.agent.roster : undefined },
        ]);
      } else {
        setMood('excited');
        let accumulated = '';
        for (const word of complete.split(' ')) {
          accumulated += (accumulated ? ' ' : '') + word;
          setStreaming(accumulated);
          await wait(38);
        }
        setStreaming('');
        setMessages(previous => [
          ...previous,
          { role: 'agent', text: complete, tools: intent.tools, roster: intent.roster ? content.agent.roster : undefined },
        ]);
      }

      setMood('proud');
      window.setTimeout(() => setMood('idle'), 1400);
      setBusy(false);
    },
    [busy, reducedMotion, scripts, content.agent.roster],
  );

  return (
    <section id="agent" className="lo-edge relative z-10 py-28" style={{ background: 'var(--lo-canvas)' }}>
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <div className="eyebrow mb-5">{content.agent.eyebrow}</div>
          <h2 className="lo-display text-[clamp(2rem,5vw,3.6rem)]">{content.agent.title}</h2>
          <p className="mt-4 max-w-md" style={{ color: 'var(--lo-ink-soft)' }}>
            {content.agent.body}
          </p>
          <p className="lo-mono mt-4 max-w-md text-[0.7rem]" style={{ color: 'var(--lo-muted)' }}>
            {content.agent.confirmNote}
          </p>
          <div className="mt-8 hidden lg:block">
            <LandingMascot
              mood={mood}
              size={140}
              ink="var(--lo-ink)"
              paper="var(--lo-canvas)"
              reducedMotion={reducedMotion}
            />
          </div>
        </div>

        <div
          className="flex h-[520px] flex-col overflow-hidden rounded-[24px] border shadow-lg"
          style={{ borderColor: 'var(--lo-line-strong)', background: '#ffffff' }}
        >
          <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--lo-line)' }}>
            <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: 'var(--lo-ink)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--lo-lime)' }} />
            </span>
            <span className="lo-mono text-xs">StudentOps agent</span>
            <span
              aria-live="polite"
              className="lo-mono ms-auto text-[0.62rem]"
              style={{ color: busy ? 'var(--lo-lime-deep)' : 'var(--lo-muted)' }}
            >
              {busy ? `● ${content.agent.typing}…` : `● ${content.agent.online}`}
            </span>
          </div>

          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && !streaming && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <LandingMascot
                    mood="curious"
                    size={90}
                    ink="var(--lo-ink)"
                    paper="#f1f5f9"
                    reducedMotion={reducedMotion}
                  />
                  <p className="lo-mono mt-3 text-xs" style={{ color: 'var(--lo-muted)' }}>
                    {content.agent.placeholder}
                  </p>
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <Bubble
                key={index}
                message={message}
                rosterLabel={content.agent.rosterLabel}
                roster={content.agent.roster}
                presentLabel={content.agent.presentLabel}
                missedLabel={content.agent.missedLabel}
              />
            ))}

            {streaming && (
              <div
                className="lo-animate-caret max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
                style={{ background: '#f1f5f9', borderStartStartRadius: 4 }}
              >
                {streaming}
              </div>
            )}
          </div>

          <div className="border-t p-3" style={{ borderColor: 'var(--lo-line)' }}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {content.agent.suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void run(suggestion)}
                  disabled={busy}
                  className="lo-mono rounded-full border px-3 py-1 text-[0.68rem] transition-colors hover:bg-[var(--lo-ink)] hover:text-[var(--lo-canvas)] disabled:opacity-40"
                  style={{ borderColor: 'var(--lo-line-strong)' }}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={event => {
                event.preventDefault();
                void run(input);
              }}
            >
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={content.agent.placeholder}
                aria-label={content.agent.placeholder}
                className="lo-mono flex-1 rounded-full border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-[var(--lo-ink)]"
                style={{ borderColor: 'var(--lo-line-strong)' }}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label={content.agent.send}
                className="grid h-10 w-10 place-items-center rounded-full disabled:opacity-40"
                style={{ background: 'var(--lo-ink)', color: 'var(--lo-canvas)' }}
                data-cursor="magnetic"
              >
                <Send size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bubble({
  message,
  rosterLabel,
  roster,
  presentLabel,
  missedLabel,
}: {
  message: Message;
  rosterLabel: string;
  roster: { name: string; present: boolean }[];
  presentLabel: string;
  missedLabel: string;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        {message.tools && message.tools.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {message.tools.map(tool => (
              <span
                key={tool}
                className="lo-mono flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem]"
                style={{ background: 'var(--lo-lime)', color: 'var(--lo-ink)' }}
              >
                <CheckCircle2 size={10} aria-hidden="true" /> {tool}
              </span>
            ))}
          </div>
        )}

        <div
          className="rounded-2xl px-4 py-2.5 text-sm"
          style={{
            background: isUser ? 'var(--lo-ink)' : '#f1f5f9',
            color: isUser ? 'var(--lo-canvas)' : 'var(--lo-ink)',
            borderStartEndRadius: isUser ? 4 : undefined,
            borderStartStartRadius: isUser ? undefined : 4,
          }}
        >
          {message.text}
        </div>

        {message.roster && (
          <div className="lo-mono mt-2 overflow-hidden rounded-xl border text-xs" style={{ borderColor: 'var(--lo-line)' }}>
            <div className="border-b px-3 py-1" style={{ borderColor: 'var(--lo-line)', color: 'var(--lo-muted)' }}>
              {rosterLabel}
            </div>
            {roster.map(row => (
              <div
                key={row.name}
                className="flex items-center justify-between border-b px-3 py-1.5 last:border-0"
                style={{ borderColor: 'var(--lo-line)' }}
              >
                <span>{row.name}</span>
                <span
                  className="flex items-center gap-1"
                  style={{ color: row.present ? 'var(--lo-lime-deep)' : 'var(--lo-coral)' }}
                >
                  {row.present ? <CheckCircle2 size={12} aria-hidden="true" /> : <Bell size={12} aria-hidden="true" />}
                  {row.present ? presentLabel : missedLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
