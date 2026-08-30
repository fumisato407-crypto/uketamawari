// バックアップ: 予約データをJSONファイルへ書き出し／読み込み。
// iPadのSafariはデータを勝手に消すことがあるため、定期的な書き出しが運用の前提。
// 保存先は店のPCの共有フォルダを想定（店内Wi-Fi直・インターネットは経由しない）。
const backup = (() => {
  const FORMAT = 1;   // ファイル形式の版。読み込み時の互換チェックに使う
  const STORES = ["orders", "products", "settings"];  // 画像Blobは対象外（別途検討）

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  async function build() {
    const data = {};
    for (const s of STORES) data[s] = await db.getAll(s);
    return {
      format: FORMAT,
      app: "uketamawari",
      exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(STORES.map((s) => [s, data[s].length])),
      data,
    };
  }

  // ファイルの中身を用意する（まだ保存はしない）
  async function prepare() {
    const payload = await build();
    const blob = new Blob([JSON.stringify(payload, null, 1)], {
      type: "application/json",
    });
    return {
      url: URL.createObjectURL(blob),
      filename: `承り表バックアップ_${stamp()}.json`,
      counts: payload.counts,
    };
  }

  // 保存ダイアログを出す。iPad Safariでは「ダウンロード」扱いになり保存先を選べる。
  // ここを踏むと後続のJSが中断されることがあるため、記録の保存など
  // 必ずやりたい処理は呼び出し側でこれより前に済ませておくこと。
  function download({ url, filename }) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 即時revokeするとSafariが保存前に失う場合があるため少し置く
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function parse(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error("ファイルが壊れているか、バックアップファイルではありません");
    }
    if (!obj || obj.app !== "uketamawari" || !obj.data) {
      throw new Error("このアプリのバックアップファイルではありません");
    }
    if (obj.format > FORMAT) {
      throw new Error("新しい版のバックアップです。アプリを更新してください");
    }
    return obj;
  }

  // 読み込み。mode="merge"=同じIDのみ上書き / "replace"=全消しして入れ替え
  async function importPayload(payload, mode) {
    const d = payload.data;
    const result = {};
    for (const s of STORES) {
      const rows = Array.isArray(d[s]) ? d[s] : [];
      if (mode === "replace") await db.clear(s);
      for (const row of rows) await db.put(s, row);
      result[s] = rows.length;
    }
    return result;
  }

  return { build, prepare, download, parse, importPayload, FORMAT };
})();
