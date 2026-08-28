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
      packaging: "", memo: "",
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
          state.items.push({ productId: p.id, name: p.name, price, qty: 1, note: "" });
          renderDetails();
        },
      });
      return;
    }
    state.items.push({ productId: p.id, name: p.name, price: p.price, qty: 1, note: "" });
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
    bindText("#f-packaging", "packaging");
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

    // 担当者ボタン（マスタから）
    const sb = $("#staff-btns");
    state.master.staff.forEach((name) => {
      const b = document.createElement("button");
      b.className = "toggle-btn";
      b.textContent = name;
      b.addEventListener("click", () => {
        state.info.staff = name;
        $("#f-staff").value = name;
        sb.querySelectorAll(".toggle-btn").forEach((x) => x.classList.toggle("active", x === b));
      });
      sb.appendChild(b);
    });

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
      const row = document.createElement("div");
      row.className = "item-note-row";
      const nameSpan = document.createElement("span");
      nameSpan.className = "in-name";
      nameSpan.textContent = it.name;
      const input = document.createElement("input");
      input.type = "text";
      input.value = it.note;
      input.placeholder = "詰合せの中身など";
      input.addEventListener("input", () => { it.note = input.value; });
      row.appendChild(nameSpan);
      row.appendChild(input);
      wrap.appendChild(row);
    });
  }

  /* ===== 印刷プレビュー（承り表） ===== */
  function renderSheet() {
    const i = state.info;
    const t = totals();
    const ITEM_ROWS = 10; // 常に10行（空行は手書き追記用）

    let rows = "";
    for (let r = 0; r < ITEM_ROWS; r++) {
      const it = state.items[r];
      rows += it
        ? `<tr><td>${esc(it.name)}</td><td class="c-price">${yen(it.price)}</td><td class="c-qty">${it.qty}</td><td>${esc(it.note)}</td></tr>`
        : `<tr><td></td><td class="c-price"></td><td class="c-qty"></td><td></td></tr>`;
    }
    const overflow = state.items.length > ITEM_ROWS
      ? `<div style="color:#c00;font-size:10pt;">※明細が${state.items.length}件あり、${ITEM_ROWS}行に入り切りません</div>` : "";

    const noshiOpts = ["内", "外"].map((v) =>
      `<span class="noshi-opt${i.noshiType === v ? " sel" : ""}">${v}</span>`).join("・");

    const visitStr = i.method === "来店"
      ? `${fmtDateJa(i.visitDate)} ${esc(i.visitTime)}` : "";
    const shipStr = i.method === "配送" ? fmtDateJa(i.shipDate) : "";
    const arriveStr = i.method === "配送" ? fmtDateJa(i.arriveDate) : "";

    $("#print-sheet").innerHTML = `
    <div class="sheet">
      <div class="sheet-header">
        <span class="sheet-title">承り表</span>
        <span class="sheet-date"><span class="lbl">日付</span> ${fmtDateJa(i.date || todayStr())}</span>
        <span><span class="lbl">受付</span> ${esc(i.staff)}</span>
      </div>
      <div class="sheet-row sheet-name"><span class="lbl">御名前</span><span class="val">${esc(i.name)}</span><span>様</span></div>
      <div class="sheet-row"><span class="lbl">御住所</span><span class="val">${esc(i.address)}</span></div>
      <div class="sheet-row"><span class="lbl">電話番号</span><span class="val">${esc(i.phone)}</span></div>
      <table>
        <tr><th style="width:40%">商品名（箱種類）</th><th style="width:18%">価格（税込）</th><th style="width:10%">個数</th><th>商品内容</th></tr>
        ${rows}
      </table>
      ${overflow}
      <div class="sheet-totals">
        <span>トータル数 <b>${t.qty}</b></span>
        <span class="total-price">合計（税込） ${yen(t.price)}</span>
      </div>
      <div class="sheet-row"><span class="lbl">御来店日時</span><span class="val">${visitStr}</span></div>
      <div class="sheet-row"><span class="lbl">配送</span><span class="lbl">発送日</span><span class="val">${shipStr}</span><span class="lbl">着日</span><span class="val">${arriveStr}</span></div>
      <div class="sheet-bottom">
        <div class="sb-left">
          <div class="sheet-row"><span class="lbl">熨斗</span><span>${noshiOpts}</span><span class="lbl">サイズ</span><span class="val">${esc(i.noshiSize)}</span></div>
          <div class="sheet-row"><span class="lbl">表書き</span><span class="val">${esc(i.omotegaki)}</span></div>
          <div class="sheet-row"><span class="lbl">菓子・包材</span><span class="val">${esc(i.packaging)}</span></div>
        </div>
        <div class="sb-right"><span class="lbl">備考</span><div class="memo-box">${esc(i.memo)}</div></div>
      </div>
    </div>`;
  }

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
      items: state.items.map((it) => ({ productId: it.productId, name: it.name, price: it.price, qty: it.qty, note: it.note })),
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
      memo: i.memo,
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
      packaging: "", memo: "",
    };
    syncFormFromInfo();
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
    setVal("#f-packaging", i.packaging); setVal("#f-memo", i.memo);
    const setToggle = (sel, val) => {
      document.querySelectorAll(sel + " .toggle-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.val === val));
    };
    setToggle("#delivery-toggle", i.method);
    setToggle("#noshi-toggle", i.noshiType);
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
      packaging: o.packaging, memo: o.memo,
    };
    syncFormFromInfo();
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

  /* ===== 起動 ===== */
  master.load().then((m) => {
    state.master = m;
    state.currentCategory = m.categories[0];
    initCustomerForm();
    // ?demo=1 でダミーデータを投入（スクリーンショット・動作確認用）
    if (location.search.includes("demo")) {
      state.items = [
        { productId: "p_101", name: "最中 5個入箱", price: 1040, qty: 2, note: "" },
        { productId: "p_002", name: "詰合せ（中）", price: 2500, qty: 1, note: "最中3・どら焼き3・羊羹1" },
        { productId: "p_201", name: "どら焼き", price: 180, qty: 10, note: "" },
      ];
      state.currentCategory = "箱";
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
    const scr = new URLSearchParams(location.search).get("screen");
    if (scr && $("#" + scr)) {
      if (scr === "screen-preview") renderSheet();
      goto(scr);
    }
  });
})();
