/**
 * Anthropic API：从小红书帖子文本里提取餐厅名。
 *
 * 一段文本可能含 0、1 或多家餐厅，且常混着 emoji / 排版噪声。
 * 让模型只吐结构化的候选店名列表，之后再交给 Google Places 反查确认。
 */

import Anthropic from "@anthropic-ai/sdk";

// 提取是轻任务，用快而省的 Haiku。需要更强可换 claude-sonnet-5。
const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface ExtractedRestaurant {
  name: string; // 餐厅名（尽量含可搜索的正式名）
  cityHint: string | null; // 文本里提到的城市/地点线索，用于反查 bias
  note: string | null; // 帖子里对这家店的简短描述
  summary: string | null; // 博主对这家店的评价摘要（1–2 句，中文）
  dishes: string[]; // 帖子里点名推荐的菜
}

const SYSTEM = `你是一个从小红书美食帖子里提取餐厅信息的助手。
用户会贴进一段中文（可能混英文）的帖子文字或截图内容。请找出其中提到的**餐厅/店名**，并为每家店概括博主的评价。
规则：
- 只提取实际的餐厅/饮品/美食店名，忽略博主名、话题标签、纯形容词。
- 名字尽量给出可在地图上搜索的形式（保留品牌名，去掉 emoji 和多余修饰）。
- note：一句话简短描述（保留原味）。
- summary：用中文概括**博主怎么评这家店**（口味/环境/性价比/踩雷点等，1–2 句，忠于原文，别编造；帖子没说就填 null）。
- dishes：帖子里**点名推荐的具体菜品**（数组，去掉修饰只留菜名；没有就空数组）。
- 如果同一段提到多家，全部列出；如果一家都没有，返回空数组。
- 只通过工具返回 JSON，不要额外解释。`;

const TOOL = {
  name: "report_restaurants",
  description: "返回从文本中提取到的餐厅列表",
  input_schema: {
    type: "object" as const,
    properties: {
      restaurants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            cityHint: { type: ["string", "null"] },
            note: { type: ["string", "null"] },
            summary: { type: ["string", "null"] },
            dishes: { type: "array", items: { type: "string" } },
          },
          required: ["name"],
        },
      },
    },
    required: ["restaurants"],
  },
};

function parseRestaurants(res: Anthropic.Message): ExtractedRestaurant[] {
  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const input = toolUse.input as {
    restaurants?: (Partial<ExtractedRestaurant> & { name: string })[];
  };
  return (input.restaurants ?? []).map((r) => ({
    name: r.name,
    cityHint: r.cityHint ?? null,
    note: r.note ?? null,
    summary: r.summary ?? null,
    dishes: Array.isArray(r.dishes) ? r.dishes.filter(Boolean) : [],
  }));
}

export async function extractRestaurants(
  rawText: string,
): Promise<ExtractedRestaurant[]> {
  const res = await getClient().messages.create({
    model: MODEL,
    // 合集帖可能几十家，每家还带 summary/dishes → 输出较大，给足 token 免得 JSON 被截断成空。
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_restaurants" },
    messages: [{ role: "user", content: rawText }],
  });
  return parseRestaurants(res);
}

export type ImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/** 从小红书截图里提取餐厅（vision）。 */
export async function extractRestaurantsFromImage(
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<ExtractedRestaurant[]> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_restaurants" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "这是一张小红书美食帖子的截图，请提取其中提到的餐厅。",
          },
        ],
      },
    ],
  });
  return parseRestaurants(res);
}

// ── 推荐点菜：从评论/帖子文本里提取被反复夸的菜 ─────────────

export interface ExtractedDish {
  name: string; // 菜名（中文优先，保留英文原名亦可）
  mentions: number; // 被提及/夸的次数
  quote: string | null; // 一句最有代表性的原话引用
}

const DISH_SYSTEM = `你是从餐厅评论中提取推荐菜品的助手。
用户会给你一家餐厅的名字和若干条食客评论（可能中英混合）。
请找出**被点名称赞的具体菜品**，按被提及次数排序，最多 6 道。
规则：
- 只提取具体菜品/饮品名，忽略"服务好""环境不错"这类非菜品内容。
- mentions = 该菜在所有评论里被正面提及的次数。
- quote 摘一句最有代表性的原话（保持原语言，截取 ≤40 字）。
- 如果评论太少或没有具体菜被夸，返回空数组，不要编造。
只通过工具返回 JSON。`;

const DISH_KNOWLEDGE_SYSTEM = `你是餐厅推荐助手。用户给你一家餐厅的名字和地址。
如果这是一家你**确切了解**的知名餐厅/连锁（如 Din Tai Fung、In-N-Out），列出它最出名的招牌菜（≤5道，mentions 填 0，quote 填 null）。
如果你不确定这家店，返回空数组。**宁可返回空，绝不编造。**`;

const DISH_TOOL = {
  name: "report_dishes",
  description: "返回提取到的推荐菜品列表",
  input_schema: {
    type: "object" as const,
    properties: {
      dishes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            mentions: { type: "number" },
            quote: { type: ["string", "null"] },
          },
          required: ["name", "mentions"],
        },
      },
    },
    required: ["dishes"],
  },
};

// ── 菜单归纳 + 翻译（照片 vision / 文字）─────────────────

export interface MenuItem {
  original: string; // 菜名原文
  translated: string; // 中文翻译（原文已是中文则照抄）
  price: string | null;
  note: string | null; // 简短描述/备注（中文）
}
export interface MenuSection {
  name: string; // 分类名（中文，可带原文）
  items: MenuItem[];
}

const MENU_SYSTEM = `你是把餐厅菜单整理成结构化数据并翻译成中文的助手。
用户会给你一张菜单照片或一段菜单文字。请提取菜品，按分类整理。
规则：
- 每道菜给出：original(菜名原文)、translated(中文翻译，原文已是中文就照抄)、price(价格,没有填null)、note(简短中文描述,没有填null)。
- 按菜单本身的分类归类(开胃菜/主菜/饮品等)，分类名用中文。
- 忠实于菜单，不要编造菜品或价格。看不清的尽力识别。
- 只通过工具返回 JSON。`;

const MENU_TOOL = {
  name: "report_menu",
  description: "返回结构化菜单",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original: { type: "string" },
                  translated: { type: "string" },
                  price: { type: ["string", "null"] },
                  note: { type: ["string", "null"] },
                },
                required: ["original", "translated"],
              },
            },
          },
          required: ["name", "items"],
        },
      },
    },
    required: ["sections"],
  },
};

export async function extractMenu(input: {
  text?: string;
  imageBase64?: string;
  mediaType?: ImageMediaType;
}): Promise<MenuSection[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64 && input.mediaType) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.mediaType,
        data: input.imageBase64,
      },
    });
    content.push({ type: "text", text: "这是一张菜单照片，请整理并翻译。" });
  } else if (input.text) {
    content.push({ type: "text", text: `菜单文字：\n${input.text}` });
  } else {
    return [];
  }

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: MENU_SYSTEM,
    tools: [MENU_TOOL],
    tool_choice: { type: "tool", name: "report_menu" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const parsed = toolUse.input as { sections?: MenuSection[] };
  return (parsed.sections ?? []).map((s) => ({
    name: s.name,
    items: (s.items ?? []).map((i) => ({
      original: i.original,
      translated: i.translated,
      price: i.price ?? null,
      note: i.note ?? null,
    })),
  }));
}

export async function extractDishes(
  restaurantName: string,
  address: string | null,
  reviewTexts: string[],
): Promise<ExtractedDish[]> {
  const useKnowledge = reviewTexts.length === 0;
  const userContent = useKnowledge
    ? `餐厅：${restaurantName}\n地址：${address ?? "未知"}`
    : `餐厅：${restaurantName}\n\n评论：\n${reviewTexts
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n\n")}`;

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: useKnowledge ? DISH_KNOWLEDGE_SYSTEM : DISH_SYSTEM,
    tools: [DISH_TOOL],
    tool_choice: { type: "tool", name: "report_dishes" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const input = toolUse.input as { dishes?: ExtractedDish[] };
  return (input.dishes ?? []).map((d) => ({
    name: d.name,
    mentions: d.mentions ?? 0,
    quote: d.quote ?? null,
  }));
}
