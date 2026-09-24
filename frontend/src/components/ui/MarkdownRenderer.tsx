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
    <div className={`markdown-body text-[14.5px] leading-relaxed text-slate-800 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-slate-900 mt-3.5 mb-1.5 tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-slate-900 mt-3 mb-1 tracking-tight first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-slate-900 mt-2 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-slate-800">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2.5 space-y-1 marker:text-slate-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2.5 space-y-1 marker:text-slate-500 font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed font-normal text-slate-800">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 pl-3.5 py-1 my-2.5 text-slate-600 italic bg-slate-50/70 rounded-r-md">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-slate-200" />,
          a: ({ href, children }) => {
            const safeHref = isSafeUrl(href) ? href : '#';
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border border-slate-200 rounded-lg shadow-xs">
              <table className="min-w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-slate-700">{children}</th>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
              {children}
            </tr>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-slate-700 font-normal">{children}</td>
          ),
          code: ({ className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const isInline = !codeClassName && !String(children).includes('\n');
            const codeString = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code
                  className="bg-slate-100 px-1.5 py-0.5 rounded text-[13px] font-mono text-slate-800 border border-slate-200/60 inline-block align-baseline"
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
        <span className="inline-block w-[2px] h-4 bg-blue-500 ml-0.5 animate-[blink_0.8s_ease-in-out_infinite] align-middle" />
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
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-900 text-slate-50 overflow-hidden text-[12.5px] font-mono shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-950/60 border-b border-slate-800/80 text-[11px] text-slate-400">
        <span className="uppercase font-sans font-semibold tracking-wider text-slate-400 text-[10px]">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-sans">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[10px] font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-slate-100 leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};
