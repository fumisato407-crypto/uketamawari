// 商品マスタ管理。
// data/products.js（価格表から生成した初期データ）を初回だけIndexedDBへ取り込み、
// 以後は IndexedDB が正。店主が設定画面で足した商品・直した値段はこちらに残る。
const master = (() => {
  const SEED_KEY = "masterSeed";
  // 同梱データのうち、この端末へ既に届けたidの控え。
  // 「あとから足した商品だけを配る」ためと、「店主が消した商品を毎回復活させない」ため。
  const SEEDED_KEY = "seededProductIds";

  // 店主が追加した商品にも、プルダウンの候補になるかの印を必ず持たせる
  function normalize(p) {
    return {
      id: p.id,
      name: p.name,
      price: p.price == null ? null : Number(p.price),
      category: p.category,
      image: p.image ?? null,
      sortOrder: p.sortOrder ?? 9999,
      active: p.active !== false,
      packaging: !!p.packaging,
      sweet: !!p.sweet,
      // ピッカーの絞り込み見出し。無ければタブ名で代用する
      srcCategory: p.srcCategory || p.category,
      contents: p.contents ?? null,
      // 店主が設定画面で決めた詰合せの定番の中身 [{id,name,qty}]。無ければ null
      // （空配列は「未設定」と同じ扱いにして null に寄せる）
      fixedPicks: Array.isArray(p.fixedPicks) && p.fixedPicks.length
        ? p.fixedPicks.map((x) => ({ id: x.id, name: x.name, qty: Number(x.qty) || 1 }))
        : null,
    };
  }

  async function settings(key, fallback) {
    const rows = await db.getAll("settings");
    const hit = rows.find((r) => r.key === key);
    return hit ? hit.value : fallback;
  }

  // 起動のたびに、同梱データと突き合わせる。
  //   まだ商品が一件も無い＝初回 → 丸ごと取り込む
  //   既に使っている端末       → **まだ届けていない商品だけ**を足す
  // 既にある商品は contents（価格表の中身欄。アプリで編集できない値）以外触らない。
  // 店主が直した値段・名前・かくす設定は必ず残る。
  // （新しい商品を配るのに「価格表の内容に戻す」を押させると、店の修正が消えてしまうため）
  async function syncBundled() {
    const m = window.SAMPLE_MASTER;
    const rows = await db.getAll("products");
    if (!rows.length) { await reseed(); return; }

    let seeded = await settings(SEEDED_KEY, null);
    const hadRecord = Array.isArray(seeded);
    // 控えが無い＝この仕組みより前から使っている端末。
    // 今入っている商品を「届け済み」とみなす（以後に足した分だけが配られる）
    if (!hadRecord) seeded = rows.map((r) => r.id);

    const known = new Set(seeded);
    const byId = new Map(rows.map((r) => [r.id, r]));
    let added = 0;
    for (const p of m.products) {
      if (known.has(p.id)) {
        // 価格表の「中身」欄（contents）だけは既存の商品にも配る。アプリでは編集できない値で、
        // 店の修正と衝突しないため（2026-09-02: 詰合せ7の「笑窪205→5」を配るのに
        // 「価格表の内容に戻す」を押させないで済むように）。店主が決めた fixedPicks は別物で触らない
        const cur = byId.get(p.id);
        if (cur && (p.contents ?? null) !== (cur.contents ?? null)) {
          await db.put("products", normalize({ ...cur, contents: p.contents ?? null }));
        }
        continue;
      }
      await db.put("products", normalize(p));
      known.add(p.id);
      added++;
    }
    if (added || !hadRecord) {
      await db.put("settings", { key: SEEDED_KEY, value: [...known] });
    }
  }

  // 同梱データで丸ごと入れ替える（新しい価格表を配ったときに設定画面から実行）
  // 店主が決めた「詰合せの中身」（fixedPicks）は価格表に無い情報なので、同じidの商品が
  // 新しい価格表にもあれば引き継ぐ（値段・名前は価格表どおりに戻る）
  async function reseed() {
    const m = window.SAMPLE_MASTER;
    const keep = new Map();
    for (const r of await db.getAll("products")) if (r.fixedPicks) keep.set(r.id, r.fixedPicks);
    await db.clear("products");
    for (const p of m.products) await db.put("products", normalize({ ...p, fixedPicks: keep.get(p.id) || null }));
    await db.put("settings", { key: "categories", value: m.categories.slice() });
    await db.put("settings", { key: SEEDED_KEY, value: m.products.map((p) => p.id) });
    if (!(await settings("staff", null))) {
      await db.put("settings", { key: "staff", value: m.staff.slice() });
    }
    await db.put("settings", { key: SEED_KEY, value: new Date().toISOString() });
  }

  async function load() {
    await syncBundled();
    const m = window.SAMPLE_MASTER;
    const products = (await db.getAll("products")).map(normalize);
    return {
      categories: await settings("categories", m.categories.slice()),
      staff: await settings("staff", m.staff.slice()),
      // 非表示にした商品は受注画面に出さない
      products: products.filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  // 設定画面用: 非表示のものも含めた全件
  async function loadAll() {
    await syncBundled();
    return (await db.getAll("products")).map(normalize)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function newId() {
    // 同梱データは p_001形式。店主が足した分は衝突しないよう別の接頭辞にする
    return "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  const save = (p) => db.put("products", normalize(p));
  const remove = (id) => db.delete("products", id);
  const setStaff = (list) => db.put("settings", { key: "staff", value: list });

  return { load, loadAll, save, remove, newId, reseed, setStaff, settings };
})();
