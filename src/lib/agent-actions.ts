/**
 * 执行 Agent 提议、用户已确认的写操作。
 * 只在 owner 模式跑（demo 模式下 /api/agent/act 是 POST，被中间件拦掉）。
 * 复用既有的写函数，清单按名 find-or-create。
 */

import "server-only";
import { setWantToEat, addVisit, setHidden } from "./restaurants";
import { getLists, createList, setListMembership } from "./lists";
import type { ProposedAction } from "./chat-agent";

/** 按名找清单，没有就建一个，返回 id。 */
async function findOrCreateList(name: string): Promise<number> {
  const trimmed = name.trim();
  const existing = await getLists();
  const hit = existing.find((l) => l.name === trimmed);
  if (hit) return hit.id;
  return createList(trimmed);
}

export async function applyProposedAction(a: ProposedAction): Promise<void> {
  switch (a.kind) {
    case "want_to_eat":
      await setWantToEat(a.restaurantId, a.want);
      return;
    case "visited":
      await addVisit(a.restaurantId, a.rating ?? null);
      return;
    case "add_to_list": {
      const listId = await findOrCreateList(a.listName);
      await setListMembership(listId, a.restaurantId, true);
      return;
    }
    case "hide":
      await setHidden(a.restaurantId, true);
      return;
    default: {
      // 穷尽检查：新增 kind 时这里会编译报错，提醒补齐
      const _exhaustive: never = a;
      throw new Error(`未知操作 ${JSON.stringify(_exhaustive)}`);
    }
  }
}
