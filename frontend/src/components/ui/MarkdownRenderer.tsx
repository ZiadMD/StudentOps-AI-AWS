import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

const isSafeUrl = (url?: string): boolean => {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (
    clean.startsWith('javascript:') ||
    clean.startsWith('vbscript:') ||
    clean.startsWith('data:') ||
    clean.startsWith('file:')
  ) {
    return false;
  }
  return true;
};

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  streaming = false,
  className = '',
}) => {
  return (
    <div className={`markdown-body text-[14.5px] leading-relaxed text-ink-800 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-ink-900 mt-4 mb-2 tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-ink-900 mt-3.5 mb-1.5 tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-ink-900 mt-3 mb-1 tracking-tight first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-ink-900 mt-2 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-ink-800">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-ink-800">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2.5 space-y-1 marker:text-ink-faint">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2.5 space-y-1 marker:text-ink-soft font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed font-normal text-ink-800">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-paper-400 pl-3.5 py-1 my-2.5 text-ink-soft italic bg-paper-100/70 rounded-r-md">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-rule" />,
          a: ({ href, children }) => {
            const safeHref = isSafeUrl(href) ? href : '#';
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 hover:text-indigo-700 hover:underline font-medium"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border border-rule rounded-lg">
              <table className="min-w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-paper-100/90 border-b border-rule text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-ink-800">{children}</th>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-ink-100 last:border-0 hover:bg-paper-100/50 transition-colors">
              {children}
            </tr>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-ink-800 font-normal">{children}</td>
          ),
          code: ({ className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const isInline = !codeClassName && !String(children).includes('\n');
            const codeString = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code
                  className="bg-paper-200 px-1.5 py-0.5 rounded text-[13px] font-mono text-ink-800 border border-rule/60 inline-block align-baseline"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match ? match[1] : ''} code={codeString} />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {streaming && (
        <span className="inline-block w-[2px] h-4 bg-indigo-500 ml-0.5 animate-[blink_0.8s_ease-in-out_infinite] align-middle" />
      )}
    </div>
  );
};

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg border border-rule bg-ink-900 text-ink-50 overflow-hidden text-[12.5px] font-mono shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-ink-950/60 border-b border-ink-800/80 text-[11px] text-ink-faint">
        <span className="uppercase font-sans font-semibold tracking-wider text-ink-faint text-[10px]">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-ink-800 text-ink-faint hover:text-ink-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-[10px] text-green-400 font-sans">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[10px] font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-ink-100 leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};
