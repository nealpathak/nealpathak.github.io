// Swim-lane flow diagrams as SVG strings. Nodes sit on a (column, lane)
// grid; edges are routed as simple curves. Colours come from site.css.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function flow({ lanes, nodes, edges, colWidth = 200, laneHeight = 96, nodeW = 150, nodeH = 50, labelW = 110 }) {
  const cols = Math.max(...nodes.map(n => n.col)) + 1;
  const width = labelW + cols * colWidth + 20;
  const height = lanes.length * laneHeight + 20;
  const pos = {};
  for (const n of nodes) {
    const lane = lanes.indexOf(n.lane);
    pos[n.id] = { x: labelW + n.col * colWidth + (colWidth - nodeW) / 2 + (n.dx || 0), y: 10 + lane * laneHeight + (laneHeight - nodeH) / 2 + (n.dy || 0) };
  }
  let s = `<svg viewBox="0 0 ${width} ${height}" class="diagram" role="img"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)"/></marker></defs>`;
  lanes.forEach((l, i) => {
    const y = 10 + i * laneHeight;
    s += `<rect class="lane" x="10" y="${y}" width="${width - 20}" height="${laneHeight}"/>`;
    s += `<text class="lane-label" x="20" y="${y + 16}">${esc(l)}</text>`;
  });
  for (const [a, b, o = {}] of edges) {
    const A = pos[a], B = pos[b];
    let x1, y1, x2, y2;
    if (B.x > A.x + nodeW / 2) { x1 = A.x + nodeW; y1 = A.y + nodeH / 2; x2 = B.x; y2 = B.y + nodeH / 2; }
    else if (B.x + nodeW / 2 < A.x) { x1 = A.x; y1 = A.y + nodeH / 2; x2 = B.x + nodeW; y2 = B.y + nodeH / 2; }
    else if (B.y > A.y) { x1 = A.x + nodeW / 2; y1 = A.y + nodeH; x2 = B.x + nodeW / 2; y2 = B.y; }
    else { x1 = A.x + nodeW / 2; y1 = A.y; x2 = B.x + nodeW / 2; y2 = B.y + nodeH; }
    const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
    const d = horizontal ? `M${x1},${y1} C${x1 + (x2 - x1) * 0.4},${y1} ${x2 - (x2 - x1) * 0.4},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${y1 + (y2 - y1) * 0.4} ${x2},${y2 - (y2 - y1) * 0.4} ${x2},${y2}`;
    s += `<path class="edge ${o.dashed ? 'dashed' : ''}" d="${d}"/>`;
    if (o.label) s += `<text class="t small" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${esc(o.label)}</text>`;
  }
  for (const n of nodes) {
    const { x, y } = pos[n.id];
    s += `<rect class="box ${n.kind || ''}" x="${x}" y="${y}" width="${nodeW}" height="${nodeH}"/>`;
    s += `<text class="t ${n.kind === 'human' ? 'accent' : ''}" x="${x + 10}" y="${y + 20}">${esc(n.label)}</text>`;
    if (n.sub) s += `<text class="t small" x="${x + 10}" y="${y + 36}">${esc(n.sub)}</text>`;
  }
  return s + '</svg>';
}
