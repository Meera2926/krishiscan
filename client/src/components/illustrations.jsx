import { useId } from 'react';

/**
 * Inline vector illustrations for the open pages. Drawn rather than photographed so they cost a
 * few kilobytes on 3G, work offline and stay sharp at any size. All of them are decorative.
 *
 * One style throughout: light from the top left, two-tone leaves (lit upper half, shaded lower
 * half), soft gradients rather than outlines, and a white highlight on anything glossy.
 */

/** Gradient ids must be unique per instance, or twelve crop cards on one page share one gradient. */
function useIds() {
  const base = 'ks' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name) => `${base}-${name}`;
  return { id, url: (name) => `url(#${id(name)})` };
}

const pt = ([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`;

/** A smooth closed outline through the given points (Catmull-Rom as cubic Beziers). */
function smooth(points) {
  const n = points.length;
  const p = (i) => points[(i + n) % n];
  let d = `M${pt(p(0))}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d + 'Z';
}

/** An irregular ellipse: radius multipliers `k` go round it, so potatoes and blobs are not perfect. */
function blob(cx, cy, rx, ry, k, rot = 0) {
  const r = (rot * Math.PI) / 180;
  return smooth(
    k.map((m, i) => {
      const a = (i / k.length) * Math.PI * 2;
      const x = Math.cos(a) * rx * m;
      const y = Math.sin(a) * ry * m;
      return [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)];
    }),
  );
}

/** A point and direction on a cubic Bezier, for laying grains along a stalk. */
function onCubic([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const at = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  const d = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { x: at(0), y: at(1), angle: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
}

/** Linear gradient from a list of colours, evenly spaced unless an [offset, colour] pair is given. */
function Grad({ id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1 }) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map((s, i) => {
        const [offset, color] = Array.isArray(s) ? s : [i / Math.max(1, stops.length - 1), s];
        return <stop key={i} offset={offset} stopColor={color} />;
      })}
    </linearGradient>
  );
}

function Radial({ id, stops, cx = 0.35, cy = 0.3, r = 0.75 }) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r}>
      {stops.map((color, i) => (
        <stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={color} />
      ))}
    </radialGradient>
  );
}

/**
 * A leaf drawn along its own x axis from the stalk (0,0) to the tip (len, bend): the upper half
 * catches the light, the lower half is in shade, and the veins run towards the tip.
 */
function Leaf({ x, y, angle, len, w, bend: bendIn = 0, upper, lower, veins = 4, vein = '#fff', veinOpacity = 0.45, sw = 1.2, opacity }) {
  // A leaf pointing left is drawn mirrored, so its lit half still faces the light at the top.
  const flip = Math.cos((angle * Math.PI) / 180) < 0;
  const bend = flip ? -bendIn : bendIn;
  const tip = `${len} ${bend}`;
  const ctrl = `${len / 2} ${bend}`;
  const midY = (t) => bend * (2 * t - t * t);
  const half = (s) => w * 0.78 * Math.sin(Math.PI * Math.min(0.98, s));
  const lines = Array.from({ length: veins }, (_, i) => {
    const s = 0.16 + (i * 0.58) / Math.max(1, veins - 1);
    const s2 = s + 0.17;
    return [
      [s * len, midY(s)],
      [(s + 0.06) * len, midY(s) - half(s) * 0.55],
      [s2 * len, midY(s2) - half(s2) * 0.82],
      [(s + 0.06) * len, midY(s) + half(s) * 0.55],
      [s2 * len, midY(s2) + half(s2) * 0.82],
    ];
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})${flip ? ' scale(1 -1)' : ''}`} opacity={opacity}>
      <path d={`M0 0C${len * 0.22} ${-w + bend * 0.3} ${len * 0.64} ${-w * 0.92 + bend} ${tip}Q${ctrl} 0 0Z`} fill={upper} />
      <path d={`M0 0Q${ctrl} ${tip}C${len * 0.66} ${w * 0.78 + bend} ${len * 0.24} ${w * 0.92 + bend * 0.3} 0 0Z`} fill={lower} />
      <g fill="none" stroke={vein} strokeOpacity={veinOpacity} strokeWidth={sw} strokeLinecap="round">
        <path d={`M0 0Q${ctrl} ${tip}`} strokeWidth={sw * 1.3} />
        {veins > 0 &&
          lines.map(([m, cu, eu, cl, el], i) => (
            <path key={i} d={`M${pt(m)}Q${pt(cu)} ${pt(eu)}M${pt(m)}Q${pt(cl)} ${pt(el)}`} />
          ))}
      </g>
    </g>
  );
}

/** The two-tone leaf gradients every illustration shares, so all greens come from one palette. */
function LeafGradients({ id, tone = 'green' }) {
  const tones = {
    green: [['#3f8c46', '#8fd06a'], ['#245f30', '#4f9f45']],
    light: [['#6fb65a', '#b7e48f'], ['#3f8c46', '#7cc35e']],
    olive: [['#7a9a3c', '#c4d878'], ['#5b7a2c', '#94b04e']],
  }[tone];
  return (
    <>
      <Grad id={id(`lu-${tone}`)} stops={tones[0]} x1={0} y1={1} x2={1} y2={0} />
      <Grad id={id(`ll-${tone}`)} stops={tones[1]} x1={0} y1={0} x2={1} y2={1} />
    </>
  );
}

const leafFill = (url, tone = 'green') => ({ upper: url(`lu-${tone}`), lower: url(`ll-${tone}`) });

const Shadow = ({ rx = 46, cx = 80, cy = 105 }) => <ellipse cx={cx} cy={cy} rx={rx} ry="5" fill="#10351d" opacity=".11" />;

/* ---------------------------------------------------------------- crops */

function Tomato({ id, url }) {
  const fruits = [
    [88, 46, 15],
    [56, 70, 25],
    [108, 76, 21],
  ];
  const calyx = (cx, cy, r) =>
    Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.32 : r;
      return `${i ? 'L' : 'M'}${pt([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.55])}`;
    }).join('') + 'Z';
  return (
    <>
      <defs>
        <LeafGradients id={id} />
        <Radial id={id('fruit')} stops={['#ff9d7f', '#ee4a32', '#b3231a']} />
        <Grad id={id('calyx')} stops={['#7cc35e', '#2f7a38']} />
      </defs>
      <Shadow rx={52} cx={82} />
      <path d="M16 24C48 8 102 8 146 26" stroke="#4e8a3a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <Leaf x={138} y={22} angle={40} len={20} w={8} bend={2} veins={2} {...leafFill(url)} />
      <Leaf x={26} y={20} angle={160} len={18} w={7} bend={-2} veins={2} {...leafFill(url)} />
      {fruits.map(([cx, cy, r]) => (
        <path key={cx} d={`M${cx - 3} 14Q${cx + 4} ${(14 + cy - r) / 2} ${cx} ${cy - r + 2}`} stroke="#4e8a3a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      ))}
      {fruits.map(([cx, cy, r]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={r} fill={url('fruit')} />
          <path d={`M${cx} ${cy - r + 3}C${cx + r * 0.25} ${cy - r * 0.2} ${cx + r * 0.2} ${cy + r * 0.5} ${cx} ${cy + r * 0.9}`} stroke="#9e1c14" strokeOpacity=".25" strokeWidth="1.4" fill="none" />
          <ellipse cx={cx - r * 0.42} cy={cy - r * 0.38} rx={r * 0.3} ry={r * 0.15} transform={`rotate(-35 ${cx - r * 0.42} ${cy - r * 0.38})`} fill="#fff" opacity=".55" />
          <path d={calyx(cx, cy - r + 3, r * 0.62)} fill={url('calyx')} stroke="#3c8236" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      ))}
    </>
  );
}

function Potato({ id, url }) {
  const tubers = [
    { c: [104, 58, 20, 14, 18], k: [1, 0.95, 1.04, 0.98, 1, 0.94, 1.05, 0.97] },
    { c: [64, 72, 36, 24, -10], k: [1, 0.93, 1.03, 0.97, 1.04, 0.95, 1.02, 0.96] },
    { c: [114, 82, 24, 17, 14], k: [1.02, 0.95, 1, 0.94, 1.03, 0.97, 1, 0.95] },
  ];
  const eyes = [
    [44, 66], [62, 60], [80, 76], [58, 84], [106, 78], [120, 88], [98, 52],
  ];
  return (
    <>
      <defs>
        <Grad id={id('skin')} stops={['#f0cf98', '#d29f61', '#a56d3b']} x1={0} y1={0} x2={0.6} y2={1} />
      </defs>
      <Shadow rx={56} cx={84} />
      {tubers.map(({ c: [cx, cy, rx, ry, rot], k }) => (
        <g key={cx}>
          <path d={blob(cx, cy, rx, ry, k, rot)} fill={url('skin')} />
          <ellipse cx={cx - rx * 0.35} cy={cy - ry * 0.45} rx={rx * 0.32} ry={ry * 0.16} transform={`rotate(${rot - 12} ${cx - rx * 0.35} ${cy - ry * 0.45})`} fill="#fff" opacity=".35" />
        </g>
      ))}
      <g stroke="#7d4f27" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".6">
        {eyes.map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x - 2.5} ${y}q2.5 -2.2 5 0`} />
        ))}
      </g>
      <g fill="#7d4f27" opacity=".3">
        {[[52, 74], [70, 68], [74, 84], [92, 70], [110, 86], [124, 80], [100, 60], [48, 78]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />
        ))}
      </g>
      <g fill="#8a6443" opacity=".55">
        <ellipse cx="34" cy="100" rx="4" ry="2" />
        <ellipse cx="136" cy="102" rx="3" ry="1.6" />
        <ellipse cx="92" cy="104" rx="3.5" ry="1.8" />
      </g>
    </>
  );
}

const bulb = (cx, top, w, h) => {
  const b = top + h;
  const mid = top + h * 0.6;
  return `M${cx} ${top}C${cx + w * 0.18} ${top + h * 0.22} ${cx + w} ${top + h * 0.3} ${cx + w} ${mid}C${cx + w} ${b - h * 0.1} ${cx + w * 0.45} ${b} ${cx} ${b}C${cx - w * 0.45} ${b} ${cx - w} ${b - h * 0.1} ${cx - w} ${mid}C${cx - w} ${top + h * 0.3} ${cx - w * 0.18} ${top + h * 0.22} ${cx} ${top}Z`;
};

const roots = (cx, y, color) => (
  <g stroke={color} strokeWidth="1.1" strokeLinecap="round" fill="none">
    {[-6, -3, 0, 3, 6].map((dx) => (
      <path key={dx} d={`M${cx + dx * 0.5} ${y}q${dx * 0.4} 3 ${dx * 0.7} 6`} />
    ))}
  </g>
);

function Onion({ id, url }) {
  const [cx, top, w, h] = [60, 30, 29, 64];
  return (
    <>
      <defs>
        <Grad id={id('skin')} stops={['#f4a6c0', '#c5477c', '#7c1f4b']} x1={0} y1={0} x2={1} y2={0.3} />
        <Grad id={id('neck')} stops={['#e2b08f', '#a8645a']} />
        <Radial id={id('cut')} stops={['#fff7fa', '#f6dbe7']} cx={0.4} cy={0.4} r={0.7} />
      </defs>
      <Shadow rx={56} cx={84} />
      {/* Whole bulb. */}
      <path d={`M${cx - 2} ${top + 2}C${cx - 3} ${top - 8} ${cx - 1} ${top - 14} ${cx + 3} ${top - 20}C${cx + 2} ${top - 12} ${cx + 3} ${top - 6} ${cx + 3} ${top + 2}Z`} fill={url('neck')} />
      <path d={bulb(cx, top, w, h)} fill={url('skin')} />
      <g stroke="#fff" strokeOpacity=".28" strokeWidth="1.2" fill="none">
        {[-0.6, -0.22, 0.2, 0.58].map((k) => (
          <path key={k} d={`M${cx} ${top + 4}C${cx + w * k * 1.25} ${top + h * 0.32} ${cx + w * k * 1.2} ${top + h * 0.78} ${cx + w * k * 0.45} ${top + h - 1}`} />
        ))}
      </g>
      <ellipse cx={cx - w * 0.5} cy={top + h * 0.5} rx="4" ry="11" transform={`rotate(14 ${cx - w * 0.5} ${top + h * 0.5})`} fill="#fff" opacity=".35" />
      {roots(cx, top + h - 1, '#d9b48c')}
      {/* Half an onion, showing its rings: the one detail nothing else has. */}
      <g transform="rotate(-8 112 76)">
        <ellipse cx="112" cy="78" rx="27" ry="24" fill={url('skin')} />
        {[1, 0.8, 0.6, 0.41, 0.22].map((s, i) => (
          <ellipse key={s} cx="112" cy={76 - (1 - s) * 2} rx={24 * s} ry={21 * s} fill={i % 2 ? '#f8e3ec' : url('cut')} stroke="#d784a8" strokeWidth="1.2" />
        ))}
      </g>
    </>
  );
}

function Garlic({ id, url }) {
  const [cx, top, w, h] = [66, 30, 34, 66];
  const b = top + h;
  const body = `M${cx - 4} ${top}C${cx - 5} ${top + h * 0.22} ${cx - w} ${top + h * 0.3} ${cx - w} ${top + h * 0.62}C${cx - w} ${b - h * 0.06} ${cx - w * 0.5} ${b} ${cx} ${b}C${cx + w * 0.5} ${b} ${cx + w} ${b - h * 0.06} ${cx + w} ${top + h * 0.62}C${cx + w} ${top + h * 0.3} ${cx + 5} ${top + h * 0.22} ${cx + 4} ${top}Z`;
  const clove = (x, y, rot) => (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <path d={`M${x} ${y - 15}C${x + 7} ${y - 8} ${x + 10} ${y + 2} ${x + 7} ${y + 9}C${x + 3} ${y + 12} ${x - 6} ${y + 12} ${x - 8} ${y + 7}C${x - 10} ${y} ${x - 5} ${y - 9} ${x} ${y - 15}Z`} fill={url('bulb')} />
      <path d={`M${x} ${y - 13}C${x + 3} ${y - 4} ${x + 3} ${y + 4} ${x + 1} ${y + 10}`} stroke="#cdbda4" strokeWidth="1.2" fill="none" />
      <ellipse cx={x - 3.5} cy={y - 3} rx="1.6" ry="4.5" transform={`rotate(20 ${x - 3.5} ${y - 3})`} fill="#fff" opacity=".8" />
    </g>
  );
  return (
    <>
      <defs>
        <Radial id={id('bulb')} stops={['#ffffff', '#f5efe4', '#d6c6ad']} cx={0.38} cy={0.4} r={0.8} />
        <Grad id={id('neck')} stops={['#efe2c8', '#c9ad84']} />
      </defs>
      <Shadow rx={56} cx={84} />
      <path d={`M${cx - 4} ${top + 2}C${cx - 5} ${top - 6} ${cx - 3} ${top - 11} ${cx + 1} ${top - 15}C${cx + 1} ${top - 9} ${cx + 4} ${top - 5} ${cx + 4} ${top + 2}Z`} fill={url('neck')} />
      <path d={body} fill={url('bulb')} />
      <g stroke="#cbbba0" strokeWidth="1.3" fill="none" strokeLinecap="round">
        {[-0.62, -0.24, 0.16, 0.56].map((k) => (
          <path key={k} d={`M${cx + k * 6} ${top + 6}C${cx + k * w * 1.15} ${top + h * 0.35} ${cx + k * w * 1.15} ${top + h * 0.78} ${cx + k * w * 0.62} ${b - 2}`} />
        ))}
      </g>
      <g stroke="#a77fb6" strokeOpacity=".45" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d={`M${cx - 20} ${b - 4}q-2 -9 -1 -16`} />
        <path d={`M${cx + 12} ${b - 3}q2 -8 1 -14`} />
        <path d={`M${cx - 4} ${b - 2}q-1 -6 0 -10`} />
      </g>
      <ellipse cx={cx - w * 0.52} cy={top + h * 0.56} rx="4" ry="12" transform={`rotate(12 ${cx - w * 0.52} ${top + h * 0.56})`} fill="#fff" opacity=".85" />
      {roots(cx, b - 1, '#bfa58a')}
      {clove(114, 86, 18)}
      {clove(134, 90, 34)}
    </>
  );
}

function Grape({ id, url }) {
  const rows = [4, 5, 4, 4, 3, 2, 1];
  const berries = rows.flatMap((n, row) =>
    Array.from({ length: n }, (_, i) => {
      const jitter = ((row * 7 + i * 3) % 5) - 2;
      return [76 + (i - (n - 1) / 2) * 13 + jitter * 0.6, 38 + row * 10.6 + (i % 2) * 1.2];
    }),
  );
  // A grape leaf: five lobes round the stalk point.
  const leafPts = [
    [190, 6], [215, 17], [235, 18], [255, 13], [272, 20], [292, 20], [310, 13], [330, 19], [352, 18], [372, 12], [392, 16],
    [412, 15], [432, 10], [455, 12], [490, 5],
  ].map(([a, r]) => [110 + Math.cos((a * Math.PI) / 180) * r, 26 + Math.sin((a * Math.PI) / 180) * r]);
  return (
    <>
      <defs>
        <LeafGradients id={id} />
        <Radial id={id('berry')} stops={['#c39ae6', '#8250b8', '#4a2475']} r={0.8} />
      </defs>
      <Shadow rx={34} cx={78} cy={108} />
      <path d={smooth(leafPts)} fill={url('lu-green')} />
      <path d={[225, 282, 340, 402].map((a) => `M110 26L${pt([110 + Math.cos((a * Math.PI) / 180) * 14, 26 + Math.sin((a * Math.PI) / 180) * 14])}`).join('')} stroke="#fff" strokeOpacity=".45" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M96 10C88 14 82 20 78 32" stroke="#8a6239" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M90 14c6 -6 14 -6 14 0c0 4 -6 4 -5 0" stroke="#6f9e3e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {berries.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7.4" fill={url('berry')} />
          <circle cx={x - 2.6} cy={y - 2.8} r="1.8" fill="#fff" opacity=".7" />
        </g>
      ))}
    </>
  );
}

function Broccoli({ id, url }) {
  const florets = [
    [46, 64, 12],
    [52, 52, 16],
    [114, 58, 14],
    [106, 44, 17],
    [68, 38, 18],
    [88, 32, 18],
    [72, 60, 16],
    [96, 58, 16],
  ];
  return (
    <>
      <defs>
        <Grad id={id('stalk')} stops={['#e2f1c2', '#a9cf7c', '#86b45a']} x1={0} y1={0} x2={1} y2={0} />
        <radialGradient id={id('head')} gradientUnits="userSpaceOnUse" cx="66" cy="28" r="80">
          <stop offset="0" stopColor="#7fc064" />
          <stop offset=".5" stopColor="#3f8a3c" />
          <stop offset="1" stopColor="#23592a" />
        </radialGradient>
      </defs>
      <Shadow rx={34} cx={82} cy={107} />
      <g stroke="#9cc56c" strokeWidth="7" strokeLinecap="round">
        <path d="M80 86L56 60M82 86L106 56M81 84L82 46" />
      </g>
      <path d="M69 106C72 94 71 82 64 70L98 70C92 82 91 94 94 106Z" fill={url('stalk')} />
      <ellipse cx="81.5" cy="106" rx="12.5" ry="3" fill="#eef7d8" />
      {florets.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={url('head')} stroke="#1f5226" strokeOpacity=".3" strokeWidth="1" />
      ))}
      {florets.map(([x, y, r]) =>
        [0, 1, 2, 3, 4].map((i) => {
          const a = (i * 72 + x) * (Math.PI / 180);
          const px = x + Math.cos(a) * r * 0.55;
          const py = y + Math.sin(a) * r * 0.55;
          return (
            <g key={`${x}-${y}-${i}`}>
              <circle cx={px} cy={py} r="2.2" fill="#1f5226" opacity=".2" />
              <circle cx={px - 0.8} cy={py - 0.9} r="1.4" fill="#b6e39a" opacity=".55" />
            </g>
          );
        }),
      )}
    </>
  );
}

function Cabbage({ id, url }) {
  const outer = Array.from({ length: 14 }, (_, i) => (i % 2 ? 0.88 : 1));
  return (
    <>
      <defs>
        <Grad id={id('outer')} stops={['#7fbe63', '#3f8a3f']} x1={0} y1={0} x2={0} y2={1} />
        <Radial id={id('head')} stops={['#f1f9df', '#c7e6a4', '#86c06a']} cx={0.4} cy={0.35} r={0.75} />
        <Grad id={id('wrap')} stops={['#b3de90', '#5fa24d']} x1={0} y1={0} x2={1} y2={1} />
      </defs>
      <Shadow rx={56} />
      <path d={blob(80, 80, 60, 27, outer)} fill={url('outer')} />
      <g stroke="#d7efbf" strokeOpacity=".7" strokeWidth="1.3" fill="none" strokeLinecap="round">
        <path d="M80 94L28 80M80 94L36 64M80 94L124 64M80 94L132 80" />
      </g>
      <circle cx="80" cy="60" r="33" fill={url('head')} />
      <g stroke="#7fb663" strokeOpacity=".75" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M58 52C66 36 90 32 104 46" />
        <path d="M62 70C72 54 96 52 108 64" />
        <path d="M82 34C78 44 80 54 86 60" />
      </g>
      <ellipse cx="66" cy="44" rx="9" ry="5" transform="rotate(-30 66 44)" fill="#fff" opacity=".5" />
      <path d="M34 98C28 78 36 58 56 46C52 62 58 82 78 98Z" fill={url('wrap')} />
      <path d="M126 98C132 78 124 58 104 46C108 62 102 82 82 98Z" fill={url('wrap')} />
      <g stroke="#e7f5d4" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".85">
        <path d="M56 96C48 82 48 66 54 52" />
        <path d="M104 96C112 82 112 66 106 52" />
      </g>
      <g stroke="#e7f5d4" strokeWidth="1" fill="none" strokeLinecap="round" opacity=".6">
        <path d="M51 80L40 76M50 68L42 62M109 80L120 76M110 68L118 62" />
      </g>
    </>
  );
}

function Maize({ id, url }) {
  const cob = 'M80 12C90 12 96 30 96 54C96 80 90 100 80 102C70 100 64 80 64 54C64 30 70 12 80 12Z';
  const kernels = [];
  for (let y = 14; y < 102; y += 6) {
    for (let x = 62 + ((y / 6) % 2) * 2.8; x < 98; x += 5.6) kernels.push([x, y]);
  }
  return (
    <>
      <defs>
        <Radial id={id('kernel')} stops={['#fff3b0', '#ffd34d', '#e9a91f']} cx={0.4} cy={0.35} r={0.7} />
        <linearGradient id={id('round')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a5200" stopOpacity=".38" />
          <stop offset=".3" stopColor="#8a5200" stopOpacity="0" />
          <stop offset=".62" stopColor="#8a5200" stopOpacity="0" />
          <stop offset="1" stopColor="#8a5200" stopOpacity=".42" />
        </linearGradient>
        <Grad id={id('husk')} stops={['#c3e48e', '#6aab4c', '#3f8a3f']} x1={0} y1={0} x2={0.4} y2={1} />
        <clipPath id={id('cob')}>
          <path d={cob} />
        </clipPath>
      </defs>
      <Shadow rx={44} cx={80} />
      <g transform="rotate(-28 80 62)">
        <path d="M78 108C56 100 42 84 38 62C52 72 64 88 82 100Z" fill={url('husk')} opacity=".8" />
        <rect x="75" y="98" width="10" height="16" rx="3" fill="#8fae5a" />
        <path d={cob} fill="#f2b62c" />
        <g clipPath={url('cob')}>
          {kernels.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x - 2.5} y={y - 2.6} width="5" height="5.2" rx="1.8" fill={url('kernel')} />
          ))}
          <rect x="60" y="8" width="40" height="100" fill={url('round')} />
        </g>
        <ellipse cx="73" cy="40" rx="2.5" ry="14" fill="#fff" opacity=".45" />
        <g stroke="#b9874a" strokeWidth="1" fill="none" strokeLinecap="round">
          <path d="M80 13C78 6 75 2 71 0" />
          <path d="M80 13C81 6 84 2 88 0" />
          <path d="M80 13C80 7 79 3 80 -2" />
        </g>
        <path d="M80 106C66 98 58 80 56 62C55 52 58 44 62 36C66 54 70 74 84 100Z" fill={url('husk')} />
        <path d="M80 106C96 100 104 84 106 66C107 58 104 50 100 44C98 60 92 80 76 100Z" fill={url('husk')} />
        <g stroke="#e3f4c8" strokeOpacity=".6" strokeWidth="1" fill="none" strokeLinecap="round">
          <path d="M78 102C68 90 63 72 62 50" />
          <path d="M82 102C92 92 98 78 100 58" />
        </g>
      </g>
    </>
  );
}

function Rice({ id, url }) {
  const panicles = [
    [[92, 26], [114, 16], [128, 36], [130, 66]],
    [[62, 30], [46, 20], [34, 38], [32, 64]],
    [[84, 46], [98, 42], [106, 56], [106, 74]],
  ];
  const stems = ['M80 100C80 70 82 44 92 26', 'M78 100C76 72 70 46 62 30', 'M81 100C81 80 80 60 84 46'];
  return (
    <>
      <defs>
        <LeafGradients id={id} />
        <Grad id={id('grain')} stops={['#f6e49a', '#d7b44c', '#b08a2c']} x1={0} y1={0} x2={1} y2={1} />
        <Grad id={id('water')} stops={['#d5ecef', '#b9dde3']} x1={0} y1={0} x2={0} y2={1} />
      </defs>
      <ellipse cx="80" cy="104" rx="64" ry="9" fill={url('water')} />
      <g stroke="#fff" strokeOpacity=".8" strokeWidth="1.1" strokeLinecap="round">
        <path d="M30 104h14M110 106h18M60 109h10" />
      </g>
      <Leaf x={80} y={102} angle={-128} len={62} w={3.4} bend={-10} veins={0} {...leafFill(url)} />
      <Leaf x={80} y={102} angle={-54} len={60} w={3.4} bend={10} veins={0} {...leafFill(url)} />
      <Leaf x={80} y={102} angle={-150} len={44} w={3} bend={-6} veins={0} {...leafFill(url)} />
      <Leaf x={80} y={102} angle={-30} len={46} w={3} bend={6} veins={0} {...leafFill(url)} />
      {stems.map((d) => (
        <path key={d} d={d} stroke="#7fa84a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ))}
      {panicles.map((curve, p) => (
        <g key={p}>
          <path d={`M${pt(curve[0])}C${pt(curve[1])} ${pt(curve[2])} ${pt(curve[3])}`} stroke="#9bab4a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {Array.from({ length: 12 }, (_, i) => {
            const t = 0.1 + i * 0.082;
            const { x, y, angle } = onCubic(curve, Math.min(1, t));
            const side = i % 2 ? 1 : -1;
            const rad = ((angle + 90) * Math.PI) / 180;
            const gx = x + Math.cos(rad) * 3.8 * side;
            const gy = y + Math.sin(rad) * 3.8 * side;
            return <ellipse key={i} cx={gx} cy={gy} rx="5" ry="2.6" transform={`rotate(${angle + side * 28} ${gx} ${gy})`} fill={url('grain')} />;
          })}
        </g>
      ))}
    </>
  );
}

function Wheat({ id, url }) {
  const ear = (rot) => (
    <g key={rot} transform={`rotate(${rot} 80 106)`}>
      <path d="M80 106C80 92 80 78 80 64" stroke="#c99a45" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g stroke="#d9ad52" strokeWidth=".9" strokeLinecap="round">
        {Array.from({ length: 7 }, (_, i) => {
          const y = 64 - i * 5.8;
          const s = 1 - i * 0.05;
          return <path key={i} d={`M${80 - 4.6 * s} ${y - 5 * s}l-4.5 -14M${80 + 4.6 * s} ${y - 8 * s}l4.5 -14`} />;
        })}
        <path d="M80 22v-14" />
      </g>
      {Array.from({ length: 7 }, (_, i) => {
        const y = 64 - i * 5.8;
        const s = 1 - i * 0.05;
        const [lx, rx] = [80 - 3.8 * s, 80 + 3.8 * s];
        return (
          <g key={i}>
            <ellipse cx={lx} cy={y} rx={3.7 * s} ry={6.2 * s} transform={`rotate(-26 ${lx} ${y})`} fill={url('grain')} />
            <ellipse cx={rx} cy={y - 2.9} rx={3.7 * s} ry={6.2 * s} transform={`rotate(26 ${rx} ${y - 2.9})`} fill={url('grain')} />
          </g>
        );
      })}
      <ellipse cx="80" cy="26" rx="3" ry="5.4" fill={url('grain')} />
    </g>
  );
  return (
    <>
      <defs>
        <LeafGradients id={id} tone="olive" />
        <Grad id={id('grain')} stops={['#fbe3a0', '#e6b354', '#b9822b']} x1={0} y1={0} x2={1} y2={1} />
      </defs>
      <Shadow rx={40} />
      <Leaf x={80} y={98} angle={-152} len={42} w={4.4} bend={-8} veins={0} {...leafFill(url, 'olive')} />
      <Leaf x={80} y={94} angle={-26} len={40} w={4.2} bend={8} veins={0} {...leafFill(url, 'olive')} />
      {[-20, 20, 0].map(ear)}
    </>
  );
}

function Turnip({ id, url }) {
  return (
    <>
      <defs>
        <LeafGradients id={id} />
        <Grad
          id={id('root')}
          stops={[[0, '#7f3586'], [0.3, '#a8509f'], [0.5, '#e8cbe3'], [0.62, '#fbf6f8'], [1, '#e9dde3']]}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
        />
      </defs>
      <Shadow rx={32} cy={107} />
      <Leaf x={80} y={50} angle={-128} len={44} w={13} bend={-4} veins={3} {...leafFill(url)} />
      <Leaf x={80} y={50} angle={-52} len={44} w={13} bend={4} veins={3} {...leafFill(url)} />
      <Leaf x={80} y={50} angle={-92} len={43} w={14} bend={-3} veins={3} {...leafFill(url)} />
      <path d="M80 47C97 46 108 57 107 71C106 85 95 95 83 101L78 101C66 95 54 85 53 71C52 57 63 46 80 47Z" fill={url('root')} />
      <path d="M80 100C80 106 82 110 87 114" stroke="#e2d2da" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M71 96l-3 3M90 95l3 3" stroke="#e2d2da" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="66" cy="70" rx="4" ry="11" transform="rotate(12 66 70)" fill="#fff" opacity=".45" />
      <ellipse cx="80" cy="48" rx="7" ry="2.4" fill="#5e2462" />
    </>
  );
}

function Fallback({ id, url }) {
  return (
    <>
      <defs>
        <LeafGradients id={id} />
      </defs>
      <Shadow rx={40} />
      <Leaf x={42} y={96} angle={-42} len={100} w={30} bend={-10} veins={5} {...leafFill(url)} />
    </>
  );
}

const CROPS = {
  tomato: { bg: '#fde4df', Draw: Tomato },
  potato: { bg: '#f1e6d6', Draw: Potato },
  onion: { bg: '#fbe3ec', Draw: Onion },
  garlic: { bg: '#e6e5f7', Draw: Garlic },
  grape: { bg: '#dcefea', Draw: Grape },
  broccoli: { bg: '#e2f1dc', Draw: Broccoli },
  cabbage: { bg: '#f1e7f5', Draw: Cabbage },
  maize: { bg: '#fbf1cc', Draw: Maize },
  rice: { bg: '#eef4d5', Draw: Rice },
  wheat: { bg: '#fde6cf', Draw: Wheat },
  turnip: { bg: '#e1ebf8', Draw: Turnip },
};

/** A friendly picture of a crop on its own pastel ground. Unknown keys get a plain leaf. */
export function CropArt({ crop, className }) {
  const ids = useIds();
  const { bg, Draw } = CROPS[crop] ?? { bg: '#e2f1dc', Draw: Fallback };
  return (
    <svg viewBox="0 0 160 120" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="160" height="120" fill={bg} />
      <circle cx="80" cy="58" r="50" fill="#fff" opacity=".45" />
      <Draw {...ids} />
    </svg>
  );
}
