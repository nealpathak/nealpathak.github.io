// Tiny DOM helpers for the tool pages.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Build a data table. columns: [{key, label, num?, render?, class?}]
export function table(columns, rows, { class: cls = 'data', caption = '', footer = null } = {}) {
  let h = `<table class="${cls}">`;
  if (caption) h += `<caption>${escapeHtml(caption)}</caption>`;
  h += '<thead><tr>' + columns.map(c => `<th class="${c.num ? 'num' : ''} ${c.class || ''}">${c.label}</th>`).join('') + '</tr></thead><tbody>';
  for (const r of rows) {
    h += `<tr class="${r._class || ''}">` + columns.map(c => {
      const v = c.render ? c.render(r[c.key], r) : escapeHtml(r[c.key] ?? '');
      return `<td class="${c.num ? 'num' : ''} ${c.class || ''}">${v}</td>`;
    }).join('') + '</tr>';
  }
  h += '</tbody>';
  if (footer) h += '<tfoot><tr>' + columns.map(c => `<td class="${c.num ? 'num' : ''}">${footer[c.key] ?? ''}</td>`).join('') + '</tr></tfoot>';
  return h + '</table>';
}

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Read a control set into an object; controls carry data-param and data-type.
export function readParams(root) {
  const out = {};
  for (const input of $$('[data-param]', root)) {
    const v = input.type === 'checkbox' ? input.checked : input.value;
    out[input.dataset.param] = input.dataset.type === 'number' ? Number(v) : v;
  }
  return out;
}

export function bindOutputs(root) {
  for (const input of $$('input[type=range][data-param]', root)) {
    const out = $(`output[for="${input.id}"]`, root);
    const fmt = input.dataset.format;
    const show = () => {
      if (!out) return;
      const v = Number(input.value);
      out.textContent = fmt === 'pct' ? Math.round(v * 100) + '%' : fmt === 'pct1' ? (v * 100).toFixed(1) + '%' : fmt === 'money' ? (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'm' : '$' + v.toLocaleString('en-US')) : fmt === 'x' ? v.toFixed(2) + '×' : fmt === 'int' ? String(Math.round(v)) : input.value;
    };
    input.addEventListener('input', show); show();
  }
}
