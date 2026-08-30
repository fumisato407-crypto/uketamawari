// 画面制御・受注入力・顧客情報・印刷プレビュー
(() => {
  const state = {
    master: null,          // { categories, staff, products }
    currentCategory: null,
    items: [],             // { productId, name, price, qty, note }
    info: {                // 顧客・受渡情報（フォームと同期）
      date: "", staff: "", name: "", address: "", phone: "",
      method: "来店", visitDate: "", visitTime: "",
      shipDate: "", arriveDate: "",
      noshiType: "なし", noshiSize: "", omotegaki: "",
      packaging: "", packagingPicks: [], memo: "", paid: false,   // paid=会計済み（店主が印刷前に付ける）
    },
    currentOrderId: null,  // 保存済みの予約を編集中ならそのID（上書き保存用）
    orderMeta: null,       // { createdAt, status } 既存予約の引き継ぎ
    listFilter: "all",
  };

  const OMOTEGAKI_PRESETS = ["御祝", "内祝", "御供", "志", "御中元", "御歳暮"];

  const $ = (sel) => document.querySelector(sel);
  const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmtDateJa = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const w = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
    return `${y}年${m}月${d}日（${w}）`;
  };

  /* ===== 画面遷移 ===== */
  function goto(screenId) {
    if (screenId === "screen-customer") onEnterCustomer();
    if (screenId === "screen-list") renderOrderList();
    if (screenId === "screen-master") renderSettings();
    // お客様入力画面の間はタブレットをお客様に渡すため、
    // 他画面（予約一覧・設定）へ行けるメニューを隠す
    document.body.classList.toggle("customer-mode", screenId === "screen-customer");
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#" + screenId).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.goto === screenId);
    });
  }
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => goto(b.dataset.goto));
  });

  /* ===== テンキー ===== */
  const numpad = {
    _onOk: null,
    open({ title, initial, onOk }) {
      $("#numpad-title").textContent = title;
      $("#numpad-display").textContent = String(initial ?? 0);
      this._onOk = onOk;
      this._fresh = true; // 最初のキーで置き換え（レジと同じ挙動）
      $("#numpad-overlay").classList.remove("hidden");
    },
    close() {
      $("#numpad-overlay").classList.add("hidden");
      this._onOk = null;
    },
  };
  $("#numpad-keys").addEventListener("click", (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    const disp = $("#numpad-display");
    if (key === "C") { disp.textContent = "0"; numpad._fresh = false; return; }
    let cur = numpad._fresh ? "" : disp.textContent.replace(/^0$/, "");
    numpad._fresh = false;
    cur = (cur + key).slice(0, 7); // 最大7桁
    disp.textContent = cur === "" ? "0" : String(Number(cur));
  });
  $("#numpad-cancel").addEventListener("click", () => numpad.close());
  $("#numpad-ok").addEventListener("click", () => {
    const val = Number($("#numpad-display").textContent);
    const fn = numpad._onOk;
    numpad.close();
    if (fn) fn(val);
  });

  /* ===== 選択リスト（商品内容・菓子包材） =====
     店主の指示で、どちらも手打ちではなく「種類＋個数を選ぶ」方式にする。
       商品内容 … 詰合せの中身。候補は菓子（sweet）
       菓子・包材 … 箱・紙袋など。候補は包材（packaging）
     保存は picks（配列）が正で、紙に出す文字列はそこから組み立てる。 */
  const fmtPicks = (picks) =>
    (picks || []).map((p) => `${p.name}${p.qty}`).join("・");

  const picker = {
    _onPick: null,
    _kind: null,
    _cat: null,
    open({ title, kind, onPick }) {
      this._onPick = onPick;
      this._kind = kind;
      this._cat = null;
      $("#picker-title").textContent = title;
      this.render();
      $("#picker-overlay").classList.remove("hidden");
    },
    close() {
      $("#picker-overlay").classList.add("hidden");
      this._onPick = null;
    },
    candidates() {
      return state.master.products.filter((p) => p[this._kind]);
    },
    render() {
      const all = this.candidates();
      // 候補が多いので価格表の分類で絞り込めるようにする
      const cats = [...new Set(all.map((p) => p.srcCategory || p.category))];
      if (!this._cat) this._cat = cats[0];
      const tabs = $("#picker-tabs");
      tabs.innerHTML = "";
      cats.forEach((c) => {
        const b = document.createElement("button");
        b.className = "picker-tab" + (c === this._cat ? " active" : "");
        b.textContent = c;
        b.addEventListener("click", () => { this._cat = c; this.render(); });
        tabs.appendChild(b);
      });
      const list = $("#picker-list");
      list.innerHTML = "";
      all.filter((p) => (p.srcCategory || p.category) === this._cat).forEach((p) => {
        const b = document.createElement("button");
        b.className = "picker-item";
        b.textContent = p.name;
        b.addEventListener("click", () => {
          const fn = this._onPick;
          this.close();
          numpad.open({
            title: `${p.name} の個数`,
            initial: 1,
            onOk: (qty) => { if (qty > 0 && fn) fn({ id: p.id, name: p.name, qty }); },
          });
        });
        list.appendChild(b);
      });
      if (!list.children.length) {
        list.innerHTML = '<div class="picker-none">この分類に商品がありません</div>';
      }
    },
  };
  $("#picker-close").addEventListener("click", () => picker.close());
  $("#picker-overlay").addEventListener("click", (e) => {
    if (e.target.id === "picker-overlay") picker.close();
  });

  // 選んだものを「もなろん3 ×」のタグで並べる。タグを押すと取り消し
  function renderPicks(el, picks, onChange) {
    el.innerHTML = "";
    if (!picks.length) {
      el.innerHTML = '<span class="picks-none">（未選択）</span>';
      return;
    }
    picks.forEach((p, idx) => {
      const tag = document.createElement("button");
      tag.className = "pick-tag";
      tag.innerHTML = `${esc(p.name)}<b>${p.qty}</b><span class="x">×</span>`;
      tag.title = "押すと取り消します";
      tag.addEventListener("click", () => { picks.splice(idx, 1); onChange(); });
      el.appendChild(tag);
    });
  }

  /* ===== カテゴリタブ・商品グリッド ===== */
  function renderTabs() {
    const wrap = $("#category-tabs");
    wrap.innerHTML = "";
    state.master.categories.forEach((cat) => {
      const b = document.createElement("button");
      b.className = "cat-tab" + (cat === state.currentCategory ? " active" : "");
      b.textContent = cat;
      b.addEventListener("click", () => {
        state.currentCategory = cat;
        renderTabs();
        renderGrid();
      });
      wrap.appendChild(b);
    });
  }

  function renderGrid() {
    const grid = $("#product-grid");
    grid.innerHTML = "";
    state.master.products
      .filter((p) => p.category === state.currentCategory)
      .forEach((p) => {
        const b = document.createElement("button");
        b.className = "product-btn";
        const priceLabel = p.price == null
          ? '<span class="p-price undecided">価格 手入力</span>'
          : `<span class="p-price">${yen(p.price)}</span>`;
        b.innerHTML = `<span class="p-name">${esc(p.name)}</span>${priceLabel}`;
        b.addEventListener("click", () => tapProduct(p));
        grid.appendChild(b);
      });
  }

  /* ===== 明細操作 ===== */
  function tapProduct(p) {
    const existing = state.items.find((it) => it.productId === p.id);
    if (existing) { existing.qty += 1; renderDetails(); return; }

    if (p.price == null) {
      // 価格未定商品: 単価を手入力してから明細へ
      numpad.open({
        title: `${p.name} の単価（税込）`,
        initial: 0,
        onOk: (price) => {
          if (price <= 0) return;
          state.items.push({ productId: p.id, name: p.name, price, qty: 1, note: "", picks: [] });
          renderDetails();
        },
      });
      return;
    }
    state.items.push({ productId: p.id, name: p.name, price: p.price, qty: 1, note: "", picks: [] });
    renderDetails();
  }

  function changeQty(item) {
    numpad.open({
      title: `${item.name} の個数`,
      initial: item.qty,
      onOk: (qty) => {
        if (qty <= 0) {
          state.items = state.items.filter((it) => it !== item);
        } else {
          item.qty = qty;
        }
        renderDetails();
      },
    });
  }

  function removeItem(item) {
    if (confirm(`「${item.name}」を明細から削除しますか？`)) {
      state.items = state.items.filter((it) => it !== item);
      renderDetails();
    }
  }

  function totals() {
    return {
      qty: state.items.reduce((s, it) => s + it.qty, 0),
      price: state.items.reduce((s, it) => s + it.price * it.qty, 0),
    };
  }

  function renderDetails() {
    const ul = $("#detail-list");
    ul.innerHTML = "";
    state.items.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="d-name">${esc(it.name)}</span>` +
        `<span class="d-price">${yen(it.price)}</span>` +
        `<span class="d-qty">${it.qty}</span>` +
        `<span class="d-sub">${yen(it.price * it.qty)}</span>`;

      // タップ=数量変更 / 長押し=削除
      let pressTimer = null, longPressed = false;
      const start = () => {
        longPressed = false;
        pressTimer = setTimeout(() => { longPressed = true; removeItem(it); }, 600);
      };
      const cancel = () => clearTimeout(pressTimer);
      li.addEventListener("touchstart", start, { passive: true });
      li.addEventListener("touchend", (e) => {
        cancel();
        if (!longPressed) { e.preventDefault(); changeQty(it); }
      });
      li.addEventListener("touchmove", cancel, { passive: true });
      // PC(マウス)でも動作確認できるように
      li.addEventListener("mousedown", start);
      li.addEventListener("mouseup", () => { cancel(); if (!longPressed) changeQty(it); });
      li.addEventListener("mouseleave", cancel);

      ul.appendChild(li);
    });

    const t = totals();
    $("#total-qty").textContent = t.qty;
    $("#total-price").textContent = yen(t.price);
  }

  $("#btn-clear-order").addEventListener("click", () => {
    if (state.items.length === 0 && !state.currentOrderId) return;
    if (confirm("入力内容をすべてクリアして新しい予約を始めますか？")) {
      resetOrder();
    }
  });

  /* ===== 顧客・受渡情報フォーム ===== */
  function bindText(id, key) {
    $(id).addEventListener("input", (e) => { state.info[key] = e.target.value; });
  }

  function makeToggle(containerSel, onChange) {
    const wrap = $(containerSel);
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      wrap.querySelectorAll(".toggle-btn").forEach((b) => b.classList.toggle("active", b === btn));
      onChange(btn.dataset.val);
    });
  }

  function initCustomerForm() {
    bindText("#f-staff", "staff");
    bindText("#f-name", "name");
    bindText("#f-address", "address");
    bindText("#f-phone", "phone");
    bindText("#f-noshi-size", "noshiSize");
    bindText("#f-omotegaki", "omotegaki");
    bindText("#f-memo", "memo");
    $("#f-date").addEventListener("input", (e) => { state.info.date = e.target.value; });
    $("#f-visit-date").addEventListener("input", (e) => { state.info.visitDate = e.target.value; });
    $("#f-visit-time").addEventListener("input", (e) => { state.info.visitTime = e.target.value; });
    $("#f-ship").addEventListener("input", (e) => { state.info.shipDate = e.target.value; });
    $("#f-arrive").addEventListener("input", (e) => { state.info.arriveDate = e.target.value; });

    makeToggle("#delivery-toggle", (val) => {
      state.info.method = val;
      $("#row-visit").classList.toggle("hidden", val !== "来店");
      $("#row-ship").classList.toggle("hidden", val !== "配送");
    });
    makeToggle("#noshi-toggle", (val) => { state.info.noshiType = val; });

    renderStaffButtons();

    // 表書きプリセットボタン
    const ob = $("#omotegaki-btns");
    OMOTEGAKI_PRESETS.forEach((word) => {
      const b = document.createElement("button");
      b.className = "toggle-btn";
      b.textContent = word;
      b.addEventListener("click", () => {
        state.info.omotegaki = word;
        $("#f-omotegaki").value = word;
        ob.querySelectorAll(".toggle-btn").forEach((x) => x.classList.toggle("active", x === b));
      });
      ob.appendChild(b);
    });

    // 菓子・包材（包材のみ。店主指示 2026-08-30）
    const refreshPackaging = () => {
      renderPicks($("#packaging-picks"), state.info.packagingPicks, refreshPackaging);
      state.info.packaging = fmtPicks(state.info.packagingPicks);
    };
    $("#btn-pick-packaging").addEventListener("click", () => {
      picker.open({
        title: "菓子・包材",
        kind: "packaging",
        onPick: (p) => { state.info.packagingPicks.push(p); refreshPackaging(); },
      });
    });
    refreshPackaging();
    state._refreshPackaging = refreshPackaging;   // 予約を読み込んだときの再描画用
  }

  // 担当者ボタン（マスタから。設定画面で変更されたら描き直す）
  function renderStaffButtons() {
    const sb = $("#staff-btns");
    sb.innerHTML = "";
    state.master.staff.forEach((name) => {
      const b = document.createElement("button");
      b.className = "toggle-btn" + (state.info.staff === name ? " active" : "");
      b.textContent = name;
      b.addEventListener("click", () => {
        state.info.staff = name;
        $("#f-staff").value = name;
        sb.querySelectorAll(".toggle-btn").forEach((x) => x.classList.toggle("active", x === b));
      });
      sb.appendChild(b);
    });
  }

  function onEnterCustomer() {
    if (!state.info.date) {
      state.info.date = todayStr();
      $("#f-date").value = state.info.date;
    }
    // 明細行ごとの商品内容メモ
    const wrap = $("#item-notes");
    wrap.innerHTML = "";
    if (state.items.length === 0) {
      wrap.innerHTML = '<span class="none">（商品が選ばれていません）</span>';
      return;
    }
    state.items.forEach((it) => {
      if (!it.picks) it.picks = [];
      const row = document.createElement("div");
      row.className = "item-note-row";
      const nameSpan = document.createElement("span");
      nameSpan.className = "in-name";
      nameSpan.textContent = it.name;

      const picksEl = document.createElement("div");
      picksEl.className = "picks";
      const add = document.createElement("button");
      add.className = "pick-add";
      add.textContent = "＋ 中身を選ぶ";

      const refresh = () => {
        renderPicks(picksEl, it.picks, refresh);
        it.note = fmtPicks(it.picks);   // 紙・保存用の文字列を同期
      };
      add.addEventListener("click", () => {
        picker.open({
          title: `${it.name} の中身`,
          kind: "sweet",
          onPick: (p) => { it.picks.push(p); refresh(); },
        });
      });
      refresh();

      row.appendChild(nameSpan);
      row.appendChild(picksEl);
      row.appendChild(add);
      wrap.appendChild(row);
    });
  }

  /* ===== 印刷プレビュー（承り表） =====
     A4横1枚に2面。左=お客様用・右=店用で中身が違う（店主指示 2026-08-30）。
       お客様用: 明細＋合計＋店名住所。菓子・包材の枠と備考は載せない
       店用    : 従来どおり菓子・包材の大枠・備考・トータル数あり
     配置は店の指示なので勝手に変えないこと。 */
  const SHOP = {
    name: "菓子舗丸円堂",
    zip: "〒871-0021",
    address: "大分県中津市沖代町1丁目446番11",
    tel: "TEL 0979-64-6328",
  };
  const ITEM_ROWS = 7;   // 明細の行数（記入分＋手書き用の空行）

  function itemRows() {
    let rows = "";
    for (let r = 0; r < ITEM_ROWS; r++) {
      const it = state.items[r];
      const note = it ? (fmtPicks(it.picks) || it.note || "") : "";
      rows += it
        ? `<tr><td>${esc(it.name)}</td><td class="c-price">${yen(it.price)}</td><td class="c-qty">${it.qty}</td><td>${esc(note)}</td></tr>`
        : `<tr class="blank"><td></td><td class="c-price"></td><td class="c-qty"></td><td></td></tr>`;
    }
    return rows;
  }

  // 支払い欄。Wordの様式どおり「済・未」を並べ、当てはまる方に丸を付ける
  // （熨斗の内・外と同じ見せ方。赤字のお礼文にする案は取り下げ 2026-08-30）
  function paidHTML() {
    return ["済", "未"]
      .map((v) => `<span class="noshi-opt${(state.info.paid ? "済" : "未") === v ? " sel" : ""}">${v}</span>`)
      .join("・");
  }

  function sheetHTML(kind) {
    const i = state.info;
    const t = totals();
    const forShop = kind === "shop";

    const noshiOpts = ["内", "外"].map((v) =>
      `<span class="noshi-opt${i.noshiType === v ? " sel" : ""}">${v}</span>`).join("・");
    const visitStr = i.method === "来店"
      ? `${fmtDateJa(i.visitDate)} ${esc(i.visitTime)}` : "";
    const shipStr = i.method === "配送" ? fmtDateJa(i.shipDate) : "";
    const arriveStr = i.method === "配送" ? fmtDateJa(i.arriveDate) : "";

    // 上部は左右2列（左=お客様、右=受渡）
    const head = `
      <div class="sheet-header">
        <span class="sheet-title">承り表</span>
        <span class="sheet-date"><span class="lbl">日付</span> ${fmtDateJa(i.date || todayStr())}</span>
        <span><span class="lbl">受付</span> ${esc(i.staff)}</span>
      </div>
      <div class="sheet-top">
        <div class="st-col">
          <div class="sheet-row sheet-name"><span class="lbl">御名前</span><span class="val">${esc(i.name)}</span><span>様</span></div>
          <div class="sheet-row"><span class="lbl">御住所</span><span class="val">${esc(i.address)}</span></div>
          <div class="sheet-row"><span class="lbl">電話番号</span><span class="val">${esc(i.phone)}</span></div>
          <div class="sheet-row"><span class="lbl">表書き</span><span class="val">${esc(i.omotegaki)}</span></div>
        </div>
        <div class="st-col">
          <div class="sheet-row"><span class="lbl">御来店日時</span><span class="val">${visitStr}</span></div>
          <div class="sheet-row"><span class="lbl">配送</span><span class="lbl">発送日</span><span class="val">${shipStr}</span><span class="lbl">着日</span><span class="val">${arriveStr}</span></div>
          <div class="sheet-row"><span class="lbl">熨斗</span><span>${noshiOpts}</span><span class="lbl">サイズ</span><span class="val">${esc(i.noshiSize)}</span></div>
          <div class="sheet-row"><span class="lbl">支払</span><span class="val">${paidHTML()}</span></div>
        </div>
      </div>`;

    const table = `
      <table>
        <tr><th style="width:36%">商品名（箱種類）</th><th style="width:18%">価格（税込）</th><th style="width:10%">個数</th><th>商品内容</th></tr>
        ${itemRows()}
      </table>
      ${state.items.length > ITEM_ROWS
        ? `<div class="overflow-warn">※明細が${state.items.length}件あり、${ITEM_ROWS}行に入り切りません</div>` : ""}`;

    if (!forShop) {
      // お客様用: レシート風。包材や備考は見せない
      return `<div class="sheet sheet-customer">
        <div class="copy-label">お客様控</div>
        ${head}${table}
        <div class="sheet-totals">
          <span class="thanks">ご予約ありがとうございました</span>
          <span class="total-price">合計（税込） ${yen(t.price)}</span>
        </div>
        <div class="shop-info">
          <div class="shop-name">${SHOP.name}</div>
          <div>${SHOP.zip}</div>
          <div>${esc(SHOP.address)}</div>
          <div>${SHOP.tel}</div>
        </div>
      </div>`;
    }

    // 店用: 菓子・包材の大枠と備考つき
    return `<div class="sheet sheet-shop">
      <div class="copy-label">店控</div>
      ${head}${table}
      <div class="sheet-bottom">
        <div class="sb-left">
          <div class="sheet-row"><span class="lbl">合計（税込）</span><span class="val total-price">${yen(t.price)}</span></div>
          <div class="sheet-row"><span class="lbl">備考</span><span class="val">${esc(i.memo)}</span></div>
        </div>
        <div class="sb-right">
          <span class="lbl">トータル数 <b>${t.qty}</b>　菓子・包材</span>
          <div class="memo-box">${esc(fmtPicks(i.packagingPicks) || i.packaging)}</div>
        </div>
      </div>
    </div>`;
  }

  function renderSheet() {
    $("#print-sheet").innerHTML =
      `<div class="sheet-pair">
         <div class="sheet-copy">${sheetHTML("customer")}</div>
         <div class="cut-line"></div>
         <div class="sheet-copy">${sheetHTML("shop")}</div>
       </div>`;
  }

  // 支払いトグル（印刷プレビュー画面）。押すたびに紙面の表示を作り直す
  makeToggle("#paid-toggle", (val) => {
    state.info.paid = val === "済";
    renderSheet();
  });

  $("#btn-to-preview").addEventListener("click", () => {
    const missing = [];
    if (!state.info.name.trim()) missing.push("御名前");
    if (!state.info.phone.trim()) missing.push("電話番号");
    if (missing.length) { alert(missing.join("・") + " を入力してください"); return; }
    renderSheet();
    goto("screen-preview");
  });

  /* ===== 予約の保存・一覧 ===== */
  function pad2(n) { return String(n).padStart(2, "0"); }

  async function nextOrderId() {
    const prefix = "o_" + (state.info.date || todayStr()).replace(/-/g, "") + "_";
    const all = await db.getAll("orders");
    const seq = all.filter((o) => o.id.startsWith(prefix)).length + 1;
    return prefix + String(seq).padStart(3, "0");
  }

  function buildOrder() {
    const i = state.info;
    const t = totals();
    return {
      id: state.currentOrderId,
      createdAt: state.orderMeta?.createdAt || new Date().toISOString(),
      date: i.date || todayStr(),
      staff: i.staff,
      customer: { name: i.name, address: i.address, phone: i.phone },
      items: state.items.map((it) => ({ productId: it.productId, name: it.name, price: it.price, qty: it.qty, note: it.note, picks: it.picks || [] })),
      total: t.price,
      totalQty: t.qty,
      delivery: {
        method: i.method,
        visitAt: i.method === "来店" && i.visitDate ? i.visitDate + (i.visitTime ? "T" + i.visitTime : "") : null,
        shipDate: i.method === "配送" ? (i.shipDate || null) : null,
        arriveDate: i.method === "配送" ? (i.arriveDate || null) : null,
      },
      noshi: { type: i.noshiType, size: i.noshiSize, omotegaki: i.omotegaki },
      packaging: i.packaging,
      packagingPicks: i.packagingPicks,
      memo: i.memo,
      paid: i.paid,
      status: state.orderMeta?.status || "受付済",
    };
  }

  async function saveOrder() {
    if (!state.currentOrderId) state.currentOrderId = await nextOrderId();
    const order = buildOrder();
    await db.put("orders", order);
    state.orderMeta = { createdAt: order.createdAt, status: order.status };
    return order;
  }

  function resetOrder() {
    state.items = [];
    state.currentOrderId = null;
    state.orderMeta = null;
    state.info = {
      date: "", staff: "", name: "", address: "", phone: "",
      method: "来店", visitDate: "", visitTime: "",
      shipDate: "", arriveDate: "",
      noshiType: "なし", noshiSize: "", omotegaki: "",
      packaging: "", packagingPicks: [], memo: "", paid: false,
    };
    syncFormFromInfo();
    if (state._refreshPackaging) state._refreshPackaging();
    renderDetails();
  }

  // state.info の値をフォームの見た目（入力欄・トグルのON状態）へ反映
  function syncFormFromInfo() {
    const i = state.info;
    const setVal = (id, v) => { $(id).value = v || ""; };
    setVal("#f-date", i.date); setVal("#f-staff", i.staff);
    setVal("#f-name", i.name); setVal("#f-address", i.address); setVal("#f-phone", i.phone);
    setVal("#f-visit-date", i.visitDate); setVal("#f-visit-time", i.visitTime);
    setVal("#f-ship", i.shipDate); setVal("#f-arrive", i.arriveDate);
    setVal("#f-noshi-size", i.noshiSize); setVal("#f-omotegaki", i.omotegaki);
    setVal("#f-memo", i.memo);   // 菓子・包材は選択タグなので renderPicks 側で描く
    const setToggle = (sel, val) => {
      document.querySelectorAll(sel + " .toggle-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.val === val));
    };
    setToggle("#delivery-toggle", i.method);
    setToggle("#noshi-toggle", i.noshiType);
    setToggle("#paid-toggle", i.paid ? "済" : "未");
    $("#row-visit").classList.toggle("hidden", i.method !== "来店");
    $("#row-ship").classList.toggle("hidden", i.method !== "配送");
    document.querySelectorAll("#staff-btns .toggle-btn").forEach((b) =>
      b.classList.toggle("active", b.textContent === i.staff));
    document.querySelectorAll("#omotegaki-btns .toggle-btn").forEach((b) =>
      b.classList.toggle("active", b.textContent === i.omotegaki));
  }

  // 保存済み予約を編集用に読み込む
  function loadOrder(o) {
    state.currentOrderId = o.id;
    state.orderMeta = { createdAt: o.createdAt, status: o.status };
    state.items = o.items.map((it) => ({ ...it }));
    const [vd, vt] = (o.delivery.visitAt || "").split("T");
    state.info = {
      date: o.date, staff: o.staff,
      name: o.customer.name, address: o.customer.address, phone: o.customer.phone,
      method: o.delivery.method, visitDate: vd || "", visitTime: vt || "",
      shipDate: o.delivery.shipDate || "", arriveDate: o.delivery.arriveDate || "",
      noshiType: o.noshi.type, noshiSize: o.noshi.size, omotegaki: o.noshi.omotegaki,
      packaging: o.packaging, packagingPicks: o.packagingPicks || [], memo: o.memo,
      paid: !!o.paid,   // 旧データ(paidなし)は未払い扱い
    };
    syncFormFromInfo();
    if (state._refreshPackaging) state._refreshPackaging();
    renderDetails();
  }

  // 受渡日（来店なら来店日・配送なら着日）で並べる
  const deliveryDateOf = (o) => o.delivery.method === "来店"
    ? (o.delivery.visitAt || "")
    : (o.delivery.arriveDate || o.delivery.shipDate || "");

  async function renderOrderList() {
    const ul = $("#order-list");
    const orders = (await db.getAll("orders"))
      .filter((o) => state.listFilter === "all"
        || (state.listFilter === "undelivered" ? o.status === "受付済" : o.status === "受渡済"))
      .sort((a, b) => (deliveryDateOf(a) || "9999").localeCompare(deliveryDateOf(b) || "9999"));
    ul.innerHTML = "";
    if (orders.length === 0) {
      ul.innerHTML = '<li class="none">予約はありません</li>';
      return;
    }
    orders.forEach((o) => {
      const li = document.createElement("li");
      const dd = deliveryDateOf(o);
      const [d, tm] = dd.split("T");
      const dateLabel = d ? `${fmtDateJa(d)}${tm ? " " + tm : ""}` : "受渡日未定";
      li.innerHTML =
        `<div class="o-main">
           <span class="o-date">${dateLabel}<span class="o-method">${o.delivery.method}</span></span>
           <span class="o-sub">${esc(o.customer.name)} 様　${esc(o.customer.phone)}</span>
         </div>
         <span class="o-total">${yen(o.total)}</span>
         <span class="o-status ${o.status === "受付済" ? "st-open" : "st-done"}">${o.status}</span>
         <div class="o-actions">
           <button class="o-open">開く・再印刷</button>
           <button class="o-toggle">${o.status === "受付済" ? "受渡済にする" : "受付済に戻す"}</button>
           <button class="o-del">削除</button>
         </div>`;
      li.querySelector(".o-open").addEventListener("click", () => {
        loadOrder(o);
        renderSheet();
        goto("screen-preview");
      });
      li.querySelector(".o-toggle").addEventListener("click", async () => {
        o.status = o.status === "受付済" ? "受渡済" : "受付済";
        await db.put("orders", o);
        renderOrderList();
      });
      li.querySelector(".o-del").addEventListener("click", async () => {
        if (!confirm(`${o.customer.name} 様の予約（${yen(o.total)}）を削除しますか？`)) return;
        await db.delete("orders", o.id);
        if (state.currentOrderId === o.id) resetOrder();
        renderOrderList();
      });
      ul.appendChild(li);
    });
  }

  makeToggle("#list-filter", (val) => {
    state.listFilter = val;
    renderOrderList();
  });

  $("#btn-print").addEventListener("click", async () => {
    await saveOrder();
    window.print();
  });
  $("#btn-save-only").addEventListener("click", async () => {
    await saveOrder();
    alert("保存しました");
    resetOrder();
    goto("screen-order");
  });

  /* ===== 設定画面（バックアップ・アプリの状態） ===== */
  const LAST_BACKUP_KEY = "lastBackupAt";

  async function renderSettings() {
    const el = $("#backup-status");
    try {
      const orders = await db.getAll("orders");
      const rec = await db.getAll("settings");
      const last = rec.find((r) => r.key === LAST_BACKUP_KEY);
      const lastLabel = last
        ? `${fmtDateJa(last.value.slice(0, 10))} ${last.value.slice(11, 16)}`
        : "まだ一度も書き出していません";
      el.innerHTML =
        `<div>保存されている予約：<b>${orders.length}</b> 件</div>` +
        `<div>最後に書き出した日：<b>${esc(lastLabel)}</b></div>`;
    } catch {
      el.textContent = "データを読み取れませんでした";
    }
    await renderOfflineStatus();
    $("#staff-edit").value = state.master.staff.join("\n");
    await renderMasterEditor();
  }

  // アプリ本体が何ファイルiPadに入っているかを数える。
  // 登録済みでも中身が空なら「Wi-Fiなしで起動できる」と言えないため、実数で見る。
  async function cachedFileCount() {
    if (!("caches" in window)) return 0;
    let n = 0;
    for (const key of await caches.keys()) {
      if (!key.startsWith("uketamawari")) continue;
      const c = await caches.open(key);
      n += (await c.keys()).length;
    }
    return n;
  }

  async function renderOfflineStatus() {
    const el = $("#offline-status");
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    const lines = [];
    if (!("serviceWorker" in navigator) || location.protocol === "file:") {
      lines.push("この開き方ではオフライン保存は使えません（動作確認用の表示です）");
    } else {
      const n = await cachedFileCount().catch(() => 0);
      if (n > 0 && navigator.serviceWorker.controller) {
        lines.push(`✓ アプリはiPadに保存済みです（${n}ファイル）。Wi-Fiがなくても起動できます`);
      } else if (n > 0) {
        lines.push(`アプリを保存しました（${n}ファイル）。一度閉じて開き直すと有効になります`);
      } else {
        lines.push("⚠ まだiPadに保存できていません。Wi-Fiに繋いで開き直してください");
      }
    }
    lines.push(standalone
      ? "✓ ホーム画面のアイコンから起動しています"
      : "※ ブラウザで開いています。「ホーム画面に追加」して使ってください");
    lines.push(navigator.onLine ? "ネット接続：あり" : "ネット接続：なし（予約入力は使えます）");
    el.innerHTML = lines.map((s) => `<div>${esc(s)}</div>`).join("");
  }

  $("#btn-export").addEventListener("click", async () => {
    let file;
    try {
      file = await backup.prepare();
      // 保存ダイアログを出すと後続処理が中断されることがあるので、
      // 記録と画面更新を先に済ませてからダウンロードを始める。
      // このため保存をキャンセルしても記録は更新される（＝「書き出した日」は
      // 厳密には「書き出し操作をした日」）。順序を入れ替えると記録自体が
      // 残らなくなるので、この割り切りを承知の上で変えないこと。
      await db.put("settings", { key: LAST_BACKUP_KEY, value: new Date().toISOString() });
      await renderSettings();
      await updateBackupBanner();
    } catch (err) {
      console.error("export failed", err);
      alert("書き出しに失敗しました：" + err.message);
      return;
    }
    backup.download(file);
    alert(`予約 ${file.counts.orders} 件を書き出します。\n保存先にお店のパソコンの共有フォルダを選んでください。`);
  });

  /* ===== バックアップ促しバナー ===== */
  const BACKUP_REMIND_DAYS = 7;

  // バナーに出す文言を返す。出す必要がなければ null。
  // confirm等を含まない純関数にしてNodeでテストできるようにしてある
  function backupReminderText(lastIso, orderCount, nowMs) {
    if (orderCount === 0) return null;   // 守るデータがなければ急かさない
    const lastMs = lastIso ? new Date(lastIso).getTime() : NaN;
    if (isNaN(lastMs)) return "まだ一度もバックアップを書き出していません";
    const days = Math.floor((nowMs - lastMs) / 86400000);
    if (days < BACKUP_REMIND_DAYS) return null;
    return `バックアップを${days}日間書き出していません`;
  }

  async function updateBackupBanner() {
    const el = $("#backup-banner");
    if (el.dataset.dismissed) return;   // 「閉じる」を押したら次の起動まで出さない
    try {
      const orders = await db.getAll("orders");
      const rec = await db.getAll("settings");
      const last = rec.find((r) => r.key === LAST_BACKUP_KEY);
      const msg = backupReminderText(last ? last.value : null, orders.length, Date.now());
      // DB読み取りの間に「閉じる」が押されていたら再表示しない
      if (el.dataset.dismissed) return;
      if (!msg) { el.classList.add("hidden"); return; }
      $("#backup-banner-msg").textContent = "⚠ " + msg;
      el.classList.remove("hidden");
    } catch { /* バナーが出せなくても営業は止めない */ }
  }

  $("#backup-banner-go").addEventListener("click", () => goto("screen-master"));
  $("#backup-banner-close").addEventListener("click", () => {
    const el = $("#backup-banner");
    el.dataset.dismissed = "1";
    el.classList.add("hidden");
  });

  // 復元はデータが消えたときの非常用。誤操作で普段使いされないよう入口で一段止める
  $("#btn-import").addEventListener("click", () => {
    if (!confirm(
      "「バックアップから戻す」は、iPadのデータが消えてしまったときの復元用です。\n" +
      "ふだんの営業では使いません。\n\n続けますか？"
    )) return;
    $("#import-file").click();
  });

  // 読み込み方を3択で尋ねる。confirmは2択しか出せないので順に聞く。
  // 戻り値: "replace" | "merge" | null（null=やめる）
  // ask は confirm 相当（テストから差し替えられるよう引数で受ける）
  function askImportMode(payload, ask) {
    const n = payload.counts?.orders ?? (payload.data.orders || []).length;
    const when = payload.exportedAt
      ? payload.exportedAt.slice(0, 16).replace("T", " ") : "不明";

    // 1段目: そもそも読み込むか（間違ったファイルを選んだときの逃げ道）
    if (!ask(
      `このファイルには予約が ${n} 件入っています。\n` +
      `書き出した日時: ${when}\n\n` +
      `このファイルを読み込みますか？\n` +
      `【OK】読み込む　【キャンセル】やめる`
    )) return null;

    // 2段目: 入れ替えか追加か
    const replace = ask(
      `読み込み方を選んでください。\n\n` +
      `【OK】今あるデータを全部消して、このファイルの内容に入れ替える\n` +
      `【キャンセル】今あるデータは残したまま、このファイルの分を追加する`
    );
    if (!replace) return "merge";

    // 3段目: 全消しは取り返しがつかないので最終確認
    if (!ask("本当に今のデータを全部消して入れ替えますか？この操作は取り消せません。")) return null;
    return "replace";
  }

  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";   // 同じファイルを続けて選べるようにする
    if (!file) return;
    try {
      const payload = backup.parse(await file.text());
      const mode = askImportMode(payload, confirm);
      if (!mode) return;
      const res = await backup.importPayload(payload, mode);
      resetOrder();
      // 商品マスタも入れ替わるので必ず読み直す。
      // これを忘れると、復元直後は画面が復元前の商品・値段のまま残る
      await reloadMaster();
      await updateBackupBanner();
      alert(`読み込みました（予約 ${res.orders} 件）`);
    } catch (err) {
      alert("読み込めませんでした：" + err.message);
    }
  });

  window.addEventListener("online", renderOfflineStatus);
  window.addEventListener("offline", renderOfflineStatus);

  /* ===== 商品マスタ編集（設定画面） ===== */
  let masterTab = null;      // 一覧で開いているタブ
  let editing = null;        // 編集中の商品（新規はid未発行）

  async function renderMasterEditor() {
    const all = await master.loadAll();
    const cats = state.master.categories;
    if (!masterTab || !cats.includes(masterTab)) masterTab = cats[0];

    const tabs = $("#master-tabs");
    tabs.innerHTML = "";
    cats.forEach((c) => {
      const n = all.filter((p) => p.category === c).length;
      const b = document.createElement("button");
      b.className = "picker-tab" + (c === masterTab ? " active" : "");
      b.textContent = `${c}（${n}）`;
      b.addEventListener("click", () => { masterTab = c; renderMasterEditor(); });
      tabs.appendChild(b);
    });

    const list = $("#master-list");
    list.innerHTML = "";
    const rows = all.filter((p) => p.category === masterTab);
    if (!rows.length) {
      list.innerHTML = '<div class="picker-none">この置き場所に商品がありません</div>';
      return;
    }
    rows.forEach((p) => {
      const row = document.createElement("button");
      row.className = "master-row" + (p.active ? "" : " off");
      row.innerHTML =
        `<span class="m-name">${esc(p.name)}</span>` +
        `<span class="m-price">${p.price == null ? "その都度入力" : yen(p.price)}</span>` +
        (p.active ? "" : '<span class="m-off">かくす</span>');
      row.addEventListener("click", () => openEditor(p));
      list.appendChild(row);
    });
  }

  function openEditor(p) {
    editing = p ? { ...p } : {
      id: null, name: "", price: null, category: masterTab || state.master.categories[0],
      active: true, sweet: false, packaging: false, sortOrder: 99999,
    };
    $("#edit-title").textContent = p ? "商品の編集" : "商品の追加";
    $("#edit-delete").style.display = p ? "" : "none";
    $("#e-name").value = editing.name;
    $("#e-price").value = editing.price == null ? "" : editing.price;
    // 新規追加は値段を入れるのが普通なので「その都度入力」は既存商品のときだけ引き継ぐ
    const manual = !!p && p.price == null;
    $("#e-price-manual").checked = manual;
    $("#e-price").disabled = manual;

    const sel = $("#e-category");
    sel.innerHTML = "";
    state.master.categories.forEach((c) => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      if (c === editing.category) o.selected = true;
      sel.appendChild(o);
    });
    $("#e-sweet").checked = !!editing.sweet;
    $("#e-packaging").checked = !!editing.packaging;
    document.querySelectorAll("#e-active-toggle .toggle-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.val === (editing.active ? "表示" : "非表示")));
    $("#edit-overlay").classList.remove("hidden");
  }

  function closeEditor() {
    $("#edit-overlay").classList.add("hidden");
    editing = null;
  }

  $("#e-price-manual").addEventListener("change", (e) => {
    $("#e-price").disabled = e.target.checked;
    if (e.target.checked) $("#e-price").value = "";
  });
  makeToggle("#e-active-toggle", (val) => { if (editing) editing.active = val === "表示"; });
  $("#edit-cancel").addEventListener("click", closeEditor);
  $("#edit-overlay").addEventListener("click", (e) => {
    if (e.target.id === "edit-overlay") closeEditor();
  });

  $("#edit-save").addEventListener("click", async () => {
    const name = $("#e-name").value.trim();
    if (!name) { alert("商品名を入れてください"); return; }
    const manual = $("#e-price-manual").checked;
    const priceRaw = $("#e-price").value.trim();
    if (!manual && priceRaw === "") { alert("値段を入れてください（決まっていなければ「その都度入力する」）"); return; }
    const price = manual ? null : Number(priceRaw);
    if (price != null && (isNaN(price) || price < 0)) { alert("値段は0以上の数字で入れてください"); return; }

    const p = {
      ...editing,
      id: editing.id || master.newId(),
      name, price,
      category: $("#e-category").value,
      sweet: $("#e-sweet").checked,
      packaging: $("#e-packaging").checked,
    };
    await master.save(p);
    closeEditor();
    await reloadMaster();
  });

  $("#edit-delete").addEventListener("click", async () => {
    if (!editing || !editing.id) return;
    if (!confirm(`「${editing.name}」を削除しますか？\n\n※過去の予約に載った分はそのまま残ります。\n　使わないだけなら「かくす」をおすすめします。`)) return;
    await master.remove(editing.id);
    closeEditor();
    await reloadMaster();
  });

  $("#btn-add-product").addEventListener("click", () => openEditor(null));

  $("#btn-reseed").addEventListener("click", async () => {
    if (!confirm(
      "商品の一覧を、アプリに入っている価格表の内容に戻します。\n\n" +
      "お店で足した商品や、直した値段は消えます。\n続けますか？"
    )) return;
    if (!confirm("本当に戻しますか？この操作は取り消せません。")) return;
    await master.reseed();
    await reloadMaster();
    alert("価格表の内容に戻しました");
  });

  $("#btn-save-staff").addEventListener("click", async () => {
    const list = $("#staff-edit").value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!list.length) { alert("担当者を1人以上入れてください"); return; }
    await master.setStaff(list);
    await reloadMaster();
    alert("担当者を保存しました");
  });

  // マスタを読み直して、受注画面と設定画面の両方を描き直す
  async function reloadMaster() {
    state.master = await master.load();
    if (!state.master.categories.includes(state.currentCategory)) {
      state.currentCategory = state.master.categories[0];
    }
    renderStaffButtons();
    renderTabs();
    renderGrid();
    await renderMasterEditor();
    $("#staff-edit").value = state.master.staff.join("\n");
  }

  /* ===== 起動 ===== */
  // アプリ一式をiPadに保存してWi-Fiなしで起動できるようにする。
  // file:// で開いた動作確認時は登録できないので黙って飛ばす。
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  master.load().then((m) => {
    state.master = m;
    state.currentCategory = m.categories[0];
    initCustomerForm();
    updateBackupBanner();   // 起動時にバックアップの間隔をチェック
    // ?demo=1 でダミーデータを投入（スクリーンショット・動作確認用）
    if (location.search.includes("demo")) {
      state.items = [
        { productId: "p_002", name: "最中 5個", price: 1600, qty: 2, note: "", picks: [] },
        { productId: "p_039", name: "丸円堂詰合せ2", price: 2460, qty: 1, note: "",
          picks: [{ id: "p_001", name: "最中", qty: 3 }, { id: "p_005", name: "中津の笑くぼ", qty: 6 }] },
        { productId: "p_054", name: "大福", price: 140, qty: 10, note: "", picks: [] },
      ];
      state.items.forEach((it) => { it.note = fmtPicks(it.picks); });
      state.info.packagingPicks = [{ id: "p_072", name: "階段10", qty: 2 }];
      state.info.packaging = fmtPicks(state.info.packagingPicks);
      state.currentCategory = "箱 店内";
      Object.assign(state.info, {
        name: "山田 花子", phone: "0312345678", staff: "担当A",
        visitDate: todayStr(), visitTime: "10:00",
        noshiType: "内", omotegaki: "御祝", memo: "紙袋2枚",
      });
      ["#f-name", "#f-phone", "#f-staff"].forEach((id, k) => {
        $(id).value = [state.info.name, state.info.phone, state.info.staff][k];
      });
      $("#f-visit-date").value = state.info.visitDate;
      $("#f-visit-time").value = state.info.visitTime;
      $("#f-memo").value = state.info.memo;
    }
    renderTabs();
    renderGrid();
    renderDetails();
    // ?demo=1&selftest=1 でデモ予約を保存→一覧表示（保存機能の動作確認用）
    if (location.search.includes("selftest")) {
      saveOrder().then(() => goto("screen-list"));
      return;
    }
    // ?screen=screen-xxx で指定画面を直接開く（スクリーンショット用）
    const params = new URLSearchParams(location.search);
    const scr = params.get("screen");
    if (scr && $("#" + scr)) {
      if (scr === "screen-preview") renderSheet();
      goto(scr);
    }
    // ?tap=ボタンID でそのボタンを自動タップ（ボタン経由の動作確認用）
    const tap = params.get("tap");
    if (tap && $("#" + tap)) setTimeout(() => $("#" + tap).click(), 100);
  });
})();
