/**
 * 小红书链接 best-effort 抓取。
 *
 * 小红书反爬很强：笔记页常返回验证墙 / 纯 JS 壳，能不能抓到看运气。
 * 这里只做「尽力而为」——伪装移动端 UA、跟随短链跳转，从 HTML 的
 * og:title / og:description / 内嵌 __INITIAL_STATE__ 里挖笔记标题与正文。
 * 抓不到就如实返回空，让上层提示用户改贴文字/截图。
 */

import "server-only";

const FETCH_TIMEOUT_MS = 10_000;

// 支持完整笔记页与 xhslink 短链（短链常裹在「XX发布了一篇小红书笔记…」分享文案里）。
const XHS_URL_RE =
  /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s，。、]+/i;

/** 从一段文本里找出第一个小红书链接（含短链）。没有则返回 null。 */
export function findXhsUrl(text: string): string | null {
  const m = text.match(XHS_URL_RE);
  return m ? m[0] : null;
}

export interface XhsFetchResult {
  ok: boolean; // 是否挖到了可用内容
  url: string; // 跟随跳转后的最终链接
  text: string; // 提取到的标题 + 正文（可能为空）
}

// 小红书反爬会随机返回内容空壳，换 UA 再试一次能提高命中率。
const UAS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

/** 抓取小红书链接内容（尽力而为，失败静默返回空）。空壳时换 UA 重试一次。 */
export async function fetchXhsContent(rawUrl: string): Promise<XhsFetchResult> {
  let finalUrl = rawUrl;
  for (const ua of UAS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(rawUrl, {
        redirect: "follow",
        signal: controller.signal,
        // Next.js 会缓存 fetch：反爬空壳一旦被缓存，重试全返回空壳。强制每次新抓。
        cache: "no-store",
        headers: {
          "User-Agent": ua,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      });
      finalUrl = res.url || rawUrl;
      if (res.ok) {
        const text = parseXhsHtml(await res.text());
        if (text.length > 0) return { ok: true, url: finalUrl, text };
      }
    } catch {
      // 忽略，进入下一次尝试
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, url: finalUrl, text: "" };
}

/**
 * 从笔记页 HTML 里挖标题 + 正文描述。best-effort，多路兜底。
 * 登录墙下 og:title 常是空的「 - 小红书」、og:description 为空，
 * 真正的笔记正文在内嵌 __INITIAL_STATE__ 的 title/desc 里 → JSON 优先。
 */
function parseXhsHtml(html: string): string {
  const title = firstMeaningful([
    jsonField(html, "title"),
    metaContent(html, "og:title"),
    tagText(html, "title"),
  ]);
  const desc = firstMeaningful([
    jsonField(html, "desc"),
    metaContent(html, "description"),
    metaContent(html, "og:description"),
  ]);

  return [title, desc]
    .filter((p): p is string => Boolean(p))
    .filter((p, i, a) => a.indexOf(p) === i) // 标题==正文首句时去重
    .join("\n");
}

/** 取第一个「有意义」的候选：去掉「- 小红书」后缀，剔除空串 / 纯「小红书」占位。 */
function firstMeaningful(cands: (string | null)[]): string | null {
  for (const c of cands) {
    if (!c) continue;
    const t = cleanup(c.replace(/[-|｜]\s*小红书.*$/, ""));
    if (t && t !== "小红书" && t.length > 1) return t;
  }
  return null;
}

/** 抓 <meta name/property="X" content="Y"> 的 Y（两种属性名都试，顺序无所谓）。 */
function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escapeRe(key)}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapeRe(key)}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function tagText(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m?.[1] ? decodeEntities(m[1]) : null;
}

/** 从内嵌 JSON（__INITIAL_STATE__ 等）里挖 "field":"..."。 */
function jsonField(html: string, field: string): string | null {
  const m = html.match(new RegExp(`"${escapeRe(field)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`); // 让 JSON 解转义 \uXXXX / \n 等
  } catch {
    return decodeEntities(m[1]);
  }
}

function cleanup(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
