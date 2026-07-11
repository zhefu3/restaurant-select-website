/**
 * 深色模式全屏星空 + 流星（固定层，覆盖整页，浅色时隐形）。
 * 位置用确定式伪随机算出（不用 Math.random，避免 SSR 水合不一致）。
 * CSS 负责闪烁 + 流星划过；「减少动态效果」下自动静止。
 */

const STARS = Array.from({ length: 64 }, (_, i) => ({
  left: (i * 61.803) % 100,
  top: (i * 37.5 + ((i * i) % 29)) % 100,
  size: 1 + (i % 3) * 0.7,
  dur: 2.4 + (i % 5) * 0.55,
  delay: (i % 8) * 0.45,
}));

// [left%, top%, 周期 s, 延迟 s] —— 错开延迟，让流星几乎一直有、从不同位置划过
const METEORS: [number, number, number, number][] = [
  [82, 2, 6, 0.5],
  [58, -4, 7, 1.8],
  [95, 10, 6.5, 3],
  [44, 4, 7.5, 4.2],
  [72, 18, 6, 5.4],
  [90, 28, 7, 6.6],
  [64, -6, 6.5, 7.8],
  [50, 24, 7.5, 9],
  [86, 40, 6, 10.5],
  [38, 14, 7, 12],
];

export function StarField() {
  return (
    <>
      {/* 星星层：浮在内容之下，作氛围 */}
      <div className="starfield" aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={`s${i}`}
            className="sf-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              // @ts-expect-error CSS 自定义属性
              "--dur": `${s.dur}s`,
              "--delay": `${s.delay}s`,
            }}
          />
        ))}
      </div>
      {/* 流星层：浮在内容之上，真的划过整页 */}
      <div className="meteor-layer" aria-hidden>
        {METEORS.map(([left, top, dur, delay], i) => (
          <span
            key={`m${i}`}
            className="meteor"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              // @ts-expect-error CSS 自定义属性
              "--dur": `${dur}s`,
              "--delay": `${delay}s`,
            }}
          />
        ))}
        {/* 偶尔飞过的宇宙飞船（UFO） */}
        <div className="spaceship">
          <svg width="48" height="26" viewBox="0 0 48 26" fill="none">
            <ellipse cx="24" cy="16" rx="22" ry="6.5" fill="#8b9dff" />
            <ellipse cx="24" cy="16" rx="22" ry="6.5" fill="#c7d2fe" opacity="0.4" />
            <ellipse cx="24" cy="12" rx="10.5" ry="7.5" fill="#dbe4ff" />
            <ellipse cx="24" cy="11" rx="6" ry="4" fill="#a5c8ff" opacity="0.7" />
            <circle className="ufo-light" cx="12" cy="17.5" r="1.5" fill="#fde68a" />
            <circle className="ufo-light" cx="24" cy="19" r="1.5" fill="#fca5a5" />
            <circle className="ufo-light" cx="36" cy="17.5" r="1.5" fill="#86efac" />
          </svg>
        </div>
      </div>
    </>
  );
}
