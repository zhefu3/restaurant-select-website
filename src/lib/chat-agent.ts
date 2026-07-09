/**
 * 对话式选餐 Agent（工具调用型，只读）。
 *
 * Claude 根据用户的话决定调哪个工具；服务器执行后喂回结果；Claude 组织成中文回答。
 * v1 只给只读工具（查/口味/推荐/点菜），不做写操作。强约束「只推荐工具返回的真实店」。
 * 大脑 = Sonnet 5；成本记入 api_usage(anthropic)，月度软上限兜底。
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { listRestaurants } from "./restaurants";
import { getDishRecommendation } from "./dish-recs";
import { withDistanceFromHome } from "./recommend";
import { buildTasteProfile } from "./taste";
import { cuisineGroup, cuisineLabel } from "./cuisine";
import { extractCity } from "./filters";
import {
  anthropicCost,
  assertUnderCap,
  recordUsage,
} from "./api-usage";
import { costConfig } from "./config";
import type { RestaurantView } from "./types";

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6; // 工具循环上限，防跑飞
const ANTHROPIC_API = "anthropic";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 未配置");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_BASE = `你是「Athroics 餐厅」里的选餐助理，服务一位住在南湾（圣何塞一带）的美食爱好者。
你的任务：根据用户的话，从他**自己的餐厅库**里帮他挑店。

铁律：
- **只能推荐 search_restaurants 返回的真实餐厅，绝对不许凭空编造店名或评分。**
- 想推荐店时，务必调用 recommend_restaurants 把选中的餐厅 id 传进去——这样前端才能把它们渲染成可点的卡片。
- 回答用中文，简洁、像朋友推荐，不要复述整个列表；点出为什么推荐（离家近/你爱的菜系/高分/没去过等）。
- 用户口味不明时可先调 get_taste_profile 参考他的偏好。
- 用户问某家店"吃什么好/招牌菜"时，用 get_dish_recommendation。
- 距离单位是公里，都是相对他家算的。`;

// 只读模式（Telegram / 无写权限）：明确说明不能改数据。
const SYSTEM = `${SYSTEM_BASE}
- 你只负责推荐，无法替他下单、加收藏或改数据。`;

// 可写模式（网页端）：允许用 propose_action 提议操作，但强调「只提议、需用户确认」。
const SYSTEM_WRITE = `${SYSTEM_BASE}
- 当用户**明确要求**把某家店「加入想去吃 / 标记去过（可带自评分0-100）/ 加进某个清单 / 拉黑」时，调用 propose_action 生成一张待确认卡片。你**不会直接改数据**，必须等用户点「确认」才生效——所以尽管提议，别犹豫，但也别在用户没表达意图时自作主张。
- restaurantId 必须来自 search_restaurants 的真实结果；提议前若不确定是哪家，先搜一下确认。`;

const tools: Anthropic.Tool[] = [
  {
    name: "search_restaurants",
    description:
      "在用户的餐厅库里按条件搜索。返回匹配的真实餐厅（含 id、评分、菜系、离家距离等）。这是找店的唯一途径。",
    input_schema: {
      type: "object",
      properties: {
        cuisine: {
          type: "string",
          description:
            "菜系大类，如 中餐/日料/韩餐/东南亚/南亚·印度/墨西哥·拉美/美式/意·欧陆/中东/海鲜/咖啡·甜点·烘焙/快餐·简餐/早餐·早午餐/酒吧/素食",
        },
        keyword: { type: "string", description: "店名或地址关键词" },
        city: { type: "string", description: "城市名，如 San Jose、Sunnyvale、Palo Alto" },
        maxDistanceKm: { type: "number", description: "离家最大公里数" },
        minRating: { type: "number", description: "最低 Google 评分，如 4.5" },
        maxPriceLevel: {
          type: "number",
          description: "最高价位 1-4（1最便宜）",
        },
        onlyWantToEat: { type: "boolean", description: "只看「想去吃」清单" },
        excludeVisited: { type: "boolean", description: "排除已去过的" },
        sortBy: {
          type: "string",
          enum: ["rating", "reviews", "distance"],
          description: "排序：评分/评论数/距离。默认评分。",
        },
        limit: { type: "number", description: "返回条数，默认 8，最多 15" },
      },
    },
  },
  {
    name: "get_taste_profile",
    description: "读取用户的口味画像（他各菜系的平均自评分）。样本不足时返回提示。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "recommend_restaurants",
    description:
      "把你最终选定要推荐给用户的餐厅 id 列表提交给前端渲染成卡片。推荐店时必须调用。",
    input_schema: {
      type: "object",
      properties: {
        restaurantIds: {
          type: "array",
          items: { type: "number" },
          description: "推荐的餐厅 id（来自 search_restaurants 结果）",
        },
        reason: { type: "string", description: "一句总的推荐语（可选）" },
      },
      required: ["restaurantIds"],
    },
  },
  {
    name: "get_dish_recommendation",
    description: "查某家餐厅有什么招牌菜/值得点的（基于评论）。传 restaurantId。",
    input_schema: {
      type: "object",
      properties: {
        restaurantId: { type: "number" },
      },
      required: ["restaurantId"],
    },
  },
];

// 写模式专用：不直接改库，只生成待用户确认的卡片。
const proposeActionTool: Anthropic.Tool = {
  name: "propose_action",
  description:
    "用户明确要求对某家店做操作时调用，生成一张待用户确认的卡片。你不会直接改数据，用户点确认后才生效。",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["want_to_eat", "unwant", "visited", "add_to_list", "hide"],
        description:
          "want_to_eat=加入想去吃；unwant=移出想去吃；visited=标记去过；add_to_list=加进清单；hide=拉黑",
      },
      restaurantId: {
        type: "number",
        description: "来自 search_restaurants 的真实餐厅 id",
      },
      rating: {
        type: "number",
        description: "visited 时可选，用户的自评分 0-100",
      },
      listName: { type: "string", description: "add_to_list 时的清单名" },
    },
    required: ["action", "restaurantId"],
  },
};

/** 工具调用时给前端显示的状态提示。 */
const TOOL_STATUS: Record<string, string> = {
  search_restaurants: "🔍 翻你的餐厅库…",
  get_taste_profile: "📊 看看你的口味…",
  get_dish_recommendation: "🍽 查招牌菜…",
};

/** 一个待用户确认的写操作（Agent 只提议，不直接执行）。 */
export type ProposedAction =
  | { kind: "want_to_eat"; restaurantId: number; restaurantName: string; want: boolean }
  | { kind: "visited"; restaurantId: number; restaurantName: string; rating?: number }
  | { kind: "add_to_list"; restaurantId: number; restaurantName: string; listName: string }
  | { kind: "hide"; restaurantId: number; restaurantName: string };

interface ChatCtx {
  recommendedIds: Set<number>;
  actions: ProposedAction[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function runTool(
  name: string,
  input: any,
  ctx: ChatCtx,
): Promise<string> {
  const all = withDistanceFromHome(await listRestaurants({}));

  if (name === "search_restaurants") {
    let list = all.slice();
    if (input.cuisine)
      list = list.filter((r) => cuisineGroup(r.cuisine) === input.cuisine);
    if (input.city)
      list = list.filter(
        (r) => extractCity(r.address)?.toLowerCase() === String(input.city).toLowerCase(),
      );
    if (input.keyword) {
      const q = String(input.keyword).toLowerCase();
      list = list.filter((r) =>
        `${r.name} ${r.address ?? ""}`.toLowerCase().includes(q),
      );
    }
    if (input.maxDistanceKm != null)
      list = list.filter(
        (r) => r.distanceKm != null && r.distanceKm <= input.maxDistanceKm,
      );
    if (input.minRating != null)
      list = list.filter((r) => (r.rating ?? 0) >= input.minRating);
    if (input.maxPriceLevel != null)
      list = list.filter(
        (r) => r.priceLevel != null && r.priceLevel <= input.maxPriceLevel,
      );
    if (input.onlyWantToEat) list = list.filter((r) => r.wantToEat && !r.visited);
    if (input.excludeVisited) list = list.filter((r) => !r.visited);

    const sortBy = input.sortBy ?? "rating";
    list.sort((a, b) => {
      if (sortBy === "distance")
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      if (sortBy === "reviews") return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      return (b.rating ?? 0) - (a.rating ?? 0);
    });

    const limit = Math.min(input.limit ?? 8, 15);
    const results = list.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      cuisine: cuisineLabel(r.cuisine),
      rating: r.rating,
      reviews: r.reviewCount,
      priceLevel: r.priceLevel,
      distanceKm: r.distanceKm != null ? Number(r.distanceKm.toFixed(1)) : null,
      city: extractCity(r.address),
      visited: r.visited,
      myRating: r.myRating,
      wantToEat: r.wantToEat,
    }));
    return JSON.stringify({ count: results.length, results });
  }

  if (name === "get_taste_profile") {
    const profile = buildTasteProfile(all);
    if (!profile)
      return JSON.stringify({
        available: false,
        note: "打分记录不足 3 条，口味画像还没建立。",
      });
    return JSON.stringify({
      available: true,
      overallAvg: Number(profile.overallAvg.toFixed(2)),
      sampleSize: profile.sampleSize,
      byGroup: Object.fromEntries(
        [...profile.groupAvg.entries()].map(([g, v]) => [g, Number(v.toFixed(2))]),
      ),
    });
  }

  if (name === "recommend_restaurants") {
    const ids: number[] = Array.isArray(input.restaurantIds)
      ? input.restaurantIds
      : [];
    ids.forEach((id) => ctx.recommendedIds.add(id));
    return JSON.stringify({ ok: true, count: ids.length });
  }

  if (name === "get_dish_recommendation") {
    const rec = await getDishRecommendation(Number(input.restaurantId));
    return JSON.stringify({
      dishes: rec.dishes.slice(0, 6),
      myDishes: rec.myDishes,
    });
  }

  if (name === "propose_action") {
    const id = Number(input.restaurantId);
    const r = all.find((x) => x.id === id);
    if (!r)
      return JSON.stringify({ error: "找不到这家店，请先用 search_restaurants 确认 id" });
    const nm = r.name;
    let action: ProposedAction;
    switch (input.action) {
      case "want_to_eat":
        action = { kind: "want_to_eat", restaurantId: id, restaurantName: nm, want: true };
        break;
      case "unwant":
        action = { kind: "want_to_eat", restaurantId: id, restaurantName: nm, want: false };
        break;
      case "visited":
        action = {
          kind: "visited",
          restaurantId: id,
          restaurantName: nm,
          rating: input.rating != null ? Number(input.rating) : undefined,
        };
        break;
      case "add_to_list":
        if (!input.listName)
          return JSON.stringify({ error: "add_to_list 需要 listName" });
        action = {
          kind: "add_to_list",
          restaurantId: id,
          restaurantName: nm,
          listName: String(input.listName),
        };
        break;
      case "hide":
        action = { kind: "hide", restaurantId: id, restaurantName: nm };
        break;
      default:
        return JSON.stringify({ error: `未知操作 ${input.action}` });
    }
    ctx.actions.push(action);
    return JSON.stringify({
      ok: true,
      note: "已生成确认卡片发给用户，等他点确认后才会真正执行。用一句话告诉用户你准备好了这个操作、请他确认。",
    });
  }

  return JSON.stringify({ error: `未知工具 ${name}` });
}

export interface ChatTurnInput {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  recommendations: RestaurantView[];
  actions?: ProposedAction[];
}

/** 流式事件（NDJSON 逐行发给前端）。 */
export type ChatEvent =
  | { type: "delta"; text: string } // 回复文本增量
  | { type: "status"; text: string } // 工具调用中的状态提示
  | { type: "recommendations"; items: RestaurantView[] } // 推荐卡片
  | { type: "action"; action: ProposedAction } // 待确认的写操作
  | { type: "done"; reply: string }; // 收尾（reply=完整文本）

export interface StreamChatOptions {
  /** 是否允许 propose_action 写操作（网页端 true；Telegram false）。 */
  enableWrites?: boolean;
}

/**
 * 预检对话预算。路由在开始流式响应「之前」调用它，
 * 好让超限时能返回 429 JSON（一旦开流就只能发 200 了）。
 */
export async function assertChatBudget(): Promise<void> {
  await assertUnderCap(ANTHROPIC_API, 0.02, costConfig.anthropicMonthlyCapUsd);
}

/**
 * 流式跑 Agent：逐 turn 用 messages.stream() 拿文本增量，工具循环照旧。
 * 通过 async generator 把「文本增量 / 工具状态 / 推荐 / 待确认操作 / 收尾」逐个 yield 出去。
 */
export async function* streamChatAgent(
  history: ChatTurnInput[],
  opts: StreamChatOptions = {},
): AsyncGenerator<ChatEvent> {
  await assertUnderCap(ANTHROPIC_API, 0.02, costConfig.anthropicMonthlyCapUsd);

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const activeTools = opts.enableWrites ? [...tools, proposeActionTool] : tools;
  const system = opts.enableWrites ? SYSTEM_WRITE : SYSTEM;

  const ctx: ChatCtx = { recommendedIds: new Set<number>(), actions: [] };
  let totalCost = 0;
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system,
      tools: activeTools,
      messages,
    });

    let turnHadText = false;
    for await (const ev of stream) {
      if (
        ev.type === "content_block_delta" &&
        ev.delta.type === "text_delta" &&
        ev.delta.text
      ) {
        // 新 turn 又冒出文本且已有内容 → 先补一个空行分隔，保证前端与 reply 一致
        if (!turnHadText && reply) {
          reply += "\n\n";
          yield { type: "delta", text: "\n\n" };
        }
        turnHadText = true;
        reply += ev.delta.text;
        yield { type: "delta", text: ev.delta.text };
      }
    }

    const res = await stream.finalMessage();
    totalCost += anthropicCost(MODEL, res.usage);

    if (res.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: res.content });

    const toolUses = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    for (const tu of toolUses) {
      const s = TOOL_STATUS[tu.name];
      if (s) yield { type: "status", text: s };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let out: string;
      try {
        out = await runTool(tu.name, tu.input, ctx);
      } catch (err) {
        out = JSON.stringify({ error: String(err) });
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: out,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  await recordUsage(ANTHROPIC_API, totalCost, 1);

  // 推荐 id → 完整餐厅对象（带距离），按推荐顺序
  if (ctx.recommendedIds.size > 0) {
    const all = withDistanceFromHome(await listRestaurants({}));
    const byId = new Map(all.map((r) => [r.id, r]));
    const items = [...ctx.recommendedIds]
      .map((id) => byId.get(id))
      .filter((r): r is RestaurantView => Boolean(r));
    if (items.length) yield { type: "recommendations", items };
  }

  for (const a of ctx.actions) yield { type: "action", action: a };

  yield { type: "done", reply: reply || "（没有生成回复）" };
}

/**
 * 非流式封装：把 streamChatAgent 收集成一个 ChatResult。
 * Telegram（一次一问一答、无写权限）用它。
 */
export async function runChatAgent(
  history: ChatTurnInput[],
): Promise<ChatResult> {
  let reply = "";
  let recommendations: RestaurantView[] = [];
  const actions: ProposedAction[] = [];
  for await (const ev of streamChatAgent(history)) {
    if (ev.type === "done") reply = ev.reply;
    else if (ev.type === "recommendations") recommendations = ev.items;
    else if (ev.type === "action") actions.push(ev.action);
  }
  return { reply, recommendations, actions };
}
