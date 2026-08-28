// 画面制御・受注入力
(() => {
  const state = {
    master: null,          // { categories, staff, products }
    currentCategory: null,
    items: [],             // { productId, name, price, qty, note }
  };

  const $ = (sel) => document.querySelector(sel);
  const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");

  /* ===== 画面遷移 ===== */
  function goto(screenId) {
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
        b.innerHTML = `<span class="p-name">${p.name}</span>${priceLabel}`;
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

  function renderDetails() {
    const ul = $("#detail-list");
    ul.innerHTML = "";
    state.items.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="d-name">${it.name}</span>` +
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

    const totalQty = state.items.reduce((s, it) => s + it.qty, 0);
    const totalPrice = state.items.reduce((s, it) => s + it.price * it.qty, 0);
    $("#total-qty").textContent = totalQty;
    $("#total-price").textContent = yen(totalPrice);
  }

  $("#btn-clear-order").addEventListener("click", () => {
    if (state.items.length === 0) return;
    if (confirm("明細をすべてクリアしますか？")) {
      state.items = [];
      renderDetails();
    }
  });

  /* ===== 起動 ===== */
  master.load().then((m) => {
    state.master = m;
    state.currentCategory = m.categories[0];
    // ?demo=1 でダミー明細を投入（スクリーンショット・動作確認用）
    if (location.search.includes("demo")) {
      state.items = [
        { productId: "p_101", name: "最中 5個入箱", price: 1040, qty: 2, note: "" },
        { productId: "p_002", name: "詰合せ（中）", price: 2500, qty: 1, note: "" },
        { productId: "p_201", name: "どら焼き", price: 180, qty: 10, note: "" },
      ];
      state.currentCategory = "箱";
    }
    renderTabs();
    renderGrid();
    renderDetails();
  });
})();
