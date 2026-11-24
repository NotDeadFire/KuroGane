import React, { useState } from 'react';
import hljs from 'highlight.js';
import katex from 'katex';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  let highlightedNodes: React.ReactNode = code;
  try {
    const result =
      language && hljs.getLanguage(language)
        ? hljs.highlight(code, { language, ignoreIllegals: true })
        : hljs.highlightAuto(code);
    // Parse highlight.js span output safely via DOMParser -> React elements (no dangerouslySetInnerHTML)
    const doc = new DOMParser().parseFromString(`<code>${result.value}</code>`, 'text/html');
    const convertNode = (node: ChildNode, key: string): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const cls = el.getAttribute('class') || '';
        const children = Array.from(el.childNodes).map((child, idx) =>
          convertNode(child, `${key}-${idx}`),
        );
        return (
          <span key={key} className={cls}>
            {children}
          </span>
        );
      }
      return null;
    };
    const rootCode = doc.body.firstChild;
    if (rootCode) {
      highlightedNodes = Array.from(rootCode.childNodes).map((c, idx) =>
        convertNode(c, `hl-${idx}`),
      );
    }
  } catch {
    highlightedNodes = code;
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/10 bg-[#08080b]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0e0e13] px-3.5 py-2 text-xs text-[#777780]">
        <span className="font-mono uppercase tracking-wider text-[#9c9ca6]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[#C9C9D1] transition-colors hover:bg-white/5 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#FF263F]" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed font-mono">
        <code className="hljs">{highlightedNodes}</code>
      </pre>
    </div>
  );
};

const MathBlock: React.FC<{ tex: string; displayMode: boolean }> = ({ tex, displayMode }) => {
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
    if (displayMode) {
      return (
        <div
          className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-[#0b0b0f] px-4 py-3 text-center"
          // KaTeX output with trust: false produces sanitized math typography only
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    return (
      <span
        className="inline-block align-middle"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">{tex}</code>;
  }
};

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Tokenize inline math ($...$), inline code (`...`), bold (**...**), italic (*...*), links ([text](url))
  const pattern =
    /(\$\$[^$]+\$\$|\$[^$\n]+\$|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!part) return null;

    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      return <MathBlock key={key} tex={part.slice(2, -2).trim()} displayMode={false} />;
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return <MathBlock key={key} tex={part.slice(1, -1).trim()} displayMode={false} />;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded border border-white/10 bg-[#18181f] px-1.5 py-0.5 font-mono text-[0.86em] text-[#e8e8f0]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-white">
          {renderInline(part.slice(2, -2), `${key}-b`)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={key} className="italic text-[#d7d7e0]">
          {renderInline(part.slice(1, -1), `${key}-i`)}
        </em>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      if (isSafeHttpUrl(href)) {
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF263F] underline decoration-[#A40019]/60 underline-offset-2 hover:text-[#ff596d]"
          >
            {label}
          </a>
        );
      }
      return <span key={key}>{label}</span>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

function renderProseBlock(block: string, blockKey: string): React.ReactNode {
  // Handle display math blocks $$...$$
  const displayMathRegex = /\$\$([\s\S]+?)\$\$/g;
  const segments: Array<{ type: 'text' | 'math'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = displayMathRegex.exec(block)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: block.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'math', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < block.length) {
    segments.push({ type: 'text', value: block.slice(lastIndex) });
  }

  return segments.map((seg, sIdx) => {
    if (seg.type === 'math') {
      return <MathBlock key={`${blockKey}-dm-${sIdx}`} tex={seg.value} displayMode={true} />;
    }

    const lines = seg.value.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // Headings
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const cls =
          level === 1
            ? 'font-display text-xl font-semibold text-white mt-4 mb-2'
            : level === 2
              ? 'font-display text-lg font-semibold text-white mt-3.5 mb-1.5'
              : 'text-base font-semibold text-[#ececf2] mt-3 mb-1';
        elements.push(
          <div key={`${blockKey}-h-${i}`} className={cls}>
            {renderInline(text, `${blockKey}-h-${i}`)}
          </div>,
        );
        i++;
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        elements.push(<hr key={`${blockKey}-hr-${i}`} className="my-4 border-white/10" />);
        i++;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        elements.push(
          <blockquote
            key={`${blockKey}-bq-${i}`}
            className="my-3 rounded-lg border border-white/10 bg-[#14141a] px-4 py-2.5 text-sm text-[#b9b9c4]"
          >
            {renderInline(quoteLines.join(' '), `${blockKey}-bq-${i}`)}
          </blockquote>,
        );
        continue;
      }

      // Markdown table
      if (
        trimmed.includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:-]+\|[\s|:-]+\s*$/.test(lines[i + 1])
      ) {
        const parseCells = (row: string) =>
          row
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());

        const headers = parseCells(lines[i]);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          rows.push(parseCells(lines[i]));
          i++;
        }
        elements.push(
          <div key={`${blockKey}-tbl-${i}`} className="my-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#131319] text-xs uppercase tracking-wider text-[#9c9ca8]">
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="border-b border-white/10 px-3.5 py-2 font-medium">
                      {renderInline(h, `${blockKey}-th-${hi}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, ri) => (
                  <tr key={ri} className="hover:bg-white/[0.02]">
                    {r.map((cell, ci) => (
                      <td key={ci} className="px-3.5 py-2 text-[#d2d2dc]">
                        {renderInline(cell, `${blockKey}-td-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        elements.push(
          <ul key={`${blockKey}-ul-${i}`} className="my-2.5 list-disc space-y-1.5 pl-5 text-[#d4d4dd]">
            {items.map((item, li) => (
              <li key={li}>{renderInline(item, `${blockKey}-ul-${i}-${li}`)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        elements.push(
          <ol key={`${blockKey}-ol-${i}`} className="my-2.5 list-decimal space-y-1.5 pl-5 text-[#d4d4dd]">
            {items.map((item, li) => (
              <li key={li}>{renderInline(item, `${blockKey}-ol-${i}-${li}`)}</li>
            ))}
          </ol>,
        );
        continue;
      }

      // Paragraph
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,4}\s+|[-*+]\s+|\d+\.\s+|>\s?|-{3,}|\*{3,})/.test(lines[i].trim())
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      elements.push(
        <p key={`${blockKey}-p-${i}`} className="my-2 leading-7 text-[#d4d4dd]">
          {renderInline(paraLines.join(' '), `${blockKey}-p-${i}`)}
        </p>,
      );
    }

    return <React.Fragment key={`${blockKey}-seg-${sIdx}`}>{elements}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Split fenced code blocks first
  const codeFenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const blocks: Array<{ type: 'prose' | 'code'; lang?: string; value: string }> = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFenceRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      blocks.push({ type: 'prose', value: content.slice(lastIdx, match.index) });
    }
    blocks.push({ type: 'code', lang: match[1], value: match[2].replace(/\n$/, '') });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    blocks.push({ type: 'prose', value: content.slice(lastIdx) });
  }

  return (
    <div className="kurogane-markdown text-[15px] leading-relaxed break-words">
      {blocks.map((block, idx) =>
        block.type === 'code' ? (
          <CodeBlock key={`cb-${idx}`} language={block.lang || ''} code={block.value} />
        ) : (
          <React.Fragment key={`pr-${idx}`}>{renderProseBlock(block.value, `pr-${idx}`)}</React.Fragment>
        ),
      )}
    </div>
  );
};
