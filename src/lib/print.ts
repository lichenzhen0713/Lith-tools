/**
 * Open a print-friendly window. Uses the browser's native "Save as PDF"
 * instead of shipping a multi-hundred-KB PDF library.
 */
const PRINT_BASE_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111827;
    background: #ffffff;
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    line-height: 1.75;
  }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  code { font-family: ui-monospace, Consolas, monospace; }
  blockquote { margin: 1em 0; padding-left: 12px; border-left: 3px solid #c7d2fe; color: #374151; }
  h1, h2, h3, h4 { line-height: 1.3; }
  a { color: #4338ca; }
  .print-page { break-after: page; }
  .print-page:last-child { break-after: auto; }
  @media print {
    a { text-decoration: none; }
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printHtmlDocument(title: string, bodyHtml: string, extraCss = ''): void {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
  if (!win) {
    throw new Error('浏览器拦截了打印窗口，请允许本站弹出窗口后重试');
  }
  win.document.open();
  win.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_BASE_CSS}${extraCss}</style>
</head>
<body>
${bodyHtml}
<script>
  window.addEventListener('load', function () {
    window.setTimeout(function () { window.focus(); window.print(); }, 250);
  });
</script>
</body>
</html>`);
  win.document.close();
}
