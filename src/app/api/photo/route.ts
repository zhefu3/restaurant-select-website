import { getRestaurantPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** 返回缓存的餐厅照片（免费，纯读库）。GET ?restaurantId= */
export async function GET(req: Request) {
  const restaurantId = Number(
    new URL(req.url).searchParams.get("restaurantId"),
  );
  if (!restaurantId) return new Response("缺少 restaurantId", { status: 400 });

  const photo = await getRestaurantPhoto(restaurantId);
  if (!photo) return new Response("无照片", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
