import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
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

function renderMath(root: HTMLElement): void {
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
    if (!element) return;
    if (html) renderMath(element);
  }, [html]);

  if (!content?.trim()) return <p className="text-sm subtle">{empty}</p>;

  return <div ref={containerRef} className={cn('prose-content', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
