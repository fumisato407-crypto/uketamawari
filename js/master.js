// 商品マスタ管理。
// data/products.js（価格表から生成した初期データ）を初回だけIndexedDBへ取り込み、
// 以後は IndexedDB が正。店主が設定画面で足した商品・直した値段はこちらに残る。
const master = (() => {
  const SEED_KEY = "masterSeed";

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
    };
  }

  async function settings(key, fallback) {
    const rows = await db.getAll("settings");
    const hit = rows.find((r) => r.key === key);
    return hit ? hit.value : fallback;
  }

  // 初回起動時だけ、同梱の商品データをIndexedDBへ流し込む
  async function seedIfEmpty() {
    const rows = await db.getAll("products");
    if (rows.length) return;
    await reseed();
  }

  // 同梱データで丸ごと入れ替える（新しい価格表を配ったときに設定画面から実行）
  async function reseed() {
    const m = window.SAMPLE_MASTER;
    await db.clear("products");
    for (const p of m.products) await db.put("products", normalize(p));
    await db.put("settings", { key: "categories", value: m.categories.slice() });
    if (!(await settings("staff", null))) {
      await db.put("settings", { key: "staff", value: m.staff.slice() });
    }
    await db.put("settings", { key: SEED_KEY, value: new Date().toISOString() });
  }

  async function load() {
    await seedIfEmpty();
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
    await seedIfEmpty();
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
