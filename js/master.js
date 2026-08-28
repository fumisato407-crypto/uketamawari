// 商品マスタ管理
// 骨組み段階: サンプルマスタをそのまま返す。
// 実装順5〜6で「初回はIndexedDBへ取り込み、以後IndexedDBが正」に切り替える。
const master = (() => {
  function load() {
    const m = window.SAMPLE_MASTER;
    return Promise.resolve({
      categories: m.categories.slice(),
      staff: m.staff.slice(),
      products: m.products.filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }

  return { load };
})();
