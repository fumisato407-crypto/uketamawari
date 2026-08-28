// サンプル商品マスタ（ダミー品目）
// 仕様書では products.sample.json だが、file:// で直接開いたとき Chrome が
// fetch(JSON) をブロックするため、<script> で読める JS 形式にしている。
// 初回起動時に IndexedDB へ取り込み、以後は IndexedDB が正。
window.SAMPLE_MASTER = {
  categories: ["詰合せ1", "詰合せ2", "定番", "生菓子", "箱"],
  staff: ["担当A", "担当B"],
  products: [
    { id: "p_001", name: "詰合せ（小）", price: 1500, category: "詰合せ1", image: null, sortOrder: 10, active: true },
    { id: "p_002", name: "詰合せ（中）", price: 2500, category: "詰合せ1", image: null, sortOrder: 20, active: true },
    { id: "p_003", name: "詰合せ（大）", price: 3500, category: "詰合せ1", image: null, sortOrder: 30, active: true },
    { id: "p_004", name: "詰合せ（特上）", price: null, category: "詰合せ2", image: null, sortOrder: 10, active: true },
    { id: "p_005", name: "御進物詰合せ", price: null, category: "詰合せ2", image: null, sortOrder: 20, active: true },
    { id: "p_101", name: "最中 5個入箱", price: 1040, category: "箱", image: null, sortOrder: 10, active: true },
    { id: "p_102", name: "最中 10個入箱", price: 2080, category: "箱", image: null, sortOrder: 20, active: true },
    { id: "p_103", name: "羊羹 1本箱", price: 1300, category: "箱", image: null, sortOrder: 30, active: true },
    { id: "p_201", name: "どら焼き", price: 180, category: "定番", image: null, sortOrder: 10, active: true },
    { id: "p_202", name: "最中（バラ）", price: 160, category: "定番", image: null, sortOrder: 20, active: true },
    { id: "p_203", name: "カステラ", price: 950, category: "定番", image: null, sortOrder: 30, active: true },
    { id: "p_301", name: "上生菓子", price: 320, category: "生菓子", image: null, sortOrder: 10, active: true },
    { id: "p_302", name: "季節の生菓子", price: null, category: "生菓子", image: null, sortOrder: 20, active: true },
    { id: "p_303", name: "大福", price: 200, category: "生菓子", image: null, sortOrder: 30, active: true }
  ]
};
