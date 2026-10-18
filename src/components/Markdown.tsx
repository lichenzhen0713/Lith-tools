import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { cn } from '../lib/utils';

marked.setOptions({ gfm: true, breaks: true });

let hooksInstalled = false;
function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

interface MathSegment {
  type: 'text' | 'math';
  value: string;
  display: boolean;
}

interface KatexLike {
  renderToString(expression: string, options?: Record<string, unknown>): string;
}

const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/;
const BLOCK_MATH = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

function splitMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, index), display: false });
    const display = Boolean(match[1]);
    segments.push({ type: 'math', value: (match[1] ?? match[2] ?? '').trim(), display });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex), display: false });
  return segments;
}

function renderMath(root: HTMLElement, katex: KatexLike): void {
  // Block math often arrives as "$$<br>…<br>$$" because marked breaks newlines.
  for (const block of Array.from(root.querySelectorAll<HTMLElement>('p, li, div'))) {
    if (block.closest('pre') || block.closest('code')) continue;
    const children = Array.from(block.children);
    if (children.some((child) => child.tagName !== 'BR')) continue;
    const match = (block.textContent ?? '').match(BLOCK_MATH);
    if (!match) continue;
    try {
      block.innerHTML = katex.renderToString(match[1].trim(), {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch {
      /* leave the original text in place */
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    if (!text.includes('$')) continue;
    const parent = node.parentElement;
    if (!parent || ['CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) continue;
    const segments = splitMath(text);
    if (!segments.some((segment) => segment.type === 'math')) continue;
    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.type === 'text') {
        fragment.appendChild(document.createTextNode(segment.value));
      } else {
        const span = document.createElement('span');
        try {
          span.innerHTML = katex.renderToString(segment.value, {
            displayMode: segment.display,
            throwOnError: false,
            strict: false,
          });
        } catch {
          span.textContent = segment.display ? `$$${segment.value}$$` : `$${segment.value}$`;
        }
        fragment.appendChild(span);
      }
    }
    node.replaceWith(fragment);
  }
}

export function Markdown({ content, className, empty = '暂无内容' }: { content: string; className?: string; empty?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content?.trim()) return '';
    installHooks();
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [content]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !html) return;
    // KaTeX (JS + CSS + fonts) is only fetched when the content really has math.
    if (!MATH_PATTERN.test(content)) return;
    let cancelled = false;
    Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([module]) => {
        if (!cancelled) renderMath(element, module.default as unknown as KatexLike);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [html, content]);

  if (!content?.trim()) return <p className="text-sm subtle">{empty}</p>;

  return <div ref={containerRef} className={cn('prose-content', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
