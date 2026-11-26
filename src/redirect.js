/* Trang báo chuyển địa chỉ: đếm ngược 10 giây rồi sang đúng trang tương ứng ở địa chỉ mới (giữ đường dẫn, ?…, #…). */
(function () {
  "use strict";

  var SECONDS = 10;
  var root = document.documentElement;
  var SITE = root.getAttribute("data-site") === "home" ? "home" : "app";
  var TARGET = root.getAttribute("data-target"); // ví dụ https://app.tsucho-scan.com — cố định, không lấy từ URL

  var T = {
    ja: {
      docTitle: "移転のお知らせ｜通帳スキャン",
      brand: "通帳スキャン",
      notice: "移転のお知らせ",
      title: { app: "通帳スキャンは新しいアドレスに移りました", home: "紹介サイトは新しいアドレスに移りました" },
      lead: {
        app: "2026年11月25日より、通帳スキャンのアプリは下記の新しいアドレスでご提供しています。新しいアドレスでは、あらためてログインしてください。",
        home: "2026年11月25日より、通帳スキャンの紹介サイトは下記の新しいアドレスでご案内しています。内容はそのままご覧いただけます。",
      },
      colKind: "区分",
      colAddr: "アドレス",
      old: "旧",
      new: "新",
      counting: "秒後に新しいアドレスへ自動で移動します",
      srStart: SECONDS + "秒後に新しいアドレスへ自動で移動します。",
      paused: "自動移動を止めました。下のボタンからいつでも移動できます。",
      leaving: "移動しています…",
      go: "新しいアドレスへ移動",
      pause: "自動移動を止める",
      resume: "自動移動を再開する",
      note: "お手数ですが、ブックマーク（お気に入り）を新しいアドレスに変更してください。",
      foot: "移転日：2026年11月25日",
    },
    en: {
      docTitle: "We've moved | Tsucho Scan",
      brand: "Tsucho Scan",
      notice: "Change of address",
      title: { app: "Tsucho Scan has moved to a new address", home: "Our website has moved to a new address" },
      lead: {
        app: "Since November 25, 2026, the Tsucho Scan app has been available at the new address below. Please sign in again at the new address.",
        home: "Since November 25, 2026, the Tsucho Scan website has been available at the new address below. The content is unchanged.",
      },
      colKind: "",
      colAddr: "Address",
      old: "Old",
      new: "New",
      counting: "seconds until you're taken to the new address",
      srStart: "You'll be taken to the new address in " + SECONDS + " seconds.",
      paused: "Automatic redirect stopped. Use the button below whenever you're ready.",
      leaving: "Taking you there…",
      go: "Go to the new address",
      pause: "Stop automatic redirect",
      resume: "Resume automatic redirect",
      note: "Please update your bookmarks to the new address.",
      foot: "Moved on November 25, 2026",
    },
    vi: {
      docTitle: "Đã chuyển địa chỉ | Tsucho Scan",
      brand: "Tsucho Scan",
      notice: "Thông báo chuyển địa chỉ",
      title: { app: "Tsucho Scan đã chuyển sang địa chỉ mới", home: "Trang giới thiệu đã chuyển sang địa chỉ mới" },
      lead: {
        app: "Từ ngày 25/11/2026, ứng dụng Tsucho Scan hoạt động tại địa chỉ mới bên dưới. Ở địa chỉ mới, bạn vui lòng đăng nhập lại.",
        home: "Từ ngày 25/11/2026, trang giới thiệu Tsucho Scan nằm ở địa chỉ mới bên dưới. Nội dung giữ nguyên.",
      },
      colKind: "",
      colAddr: "Địa chỉ",
      old: "Cũ",
      new: "Mới",
      counting: "giây nữa sẽ tự chuyển sang địa chỉ mới",
      srStart: "Sau " + SECONDS + " giây sẽ tự chuyển sang địa chỉ mới.",
      paused: "Đã dừng tự chuyển. Bạn có thể sang địa chỉ mới bất cứ lúc nào bằng nút bên dưới.",
      leaving: "Đang chuyển…",
      go: "Đến địa chỉ mới",
      pause: "Dừng tự chuyển",
      resume: "Tiếp tục tự chuyển",
      note: "Vui lòng cập nhật dấu trang (bookmark) sang địa chỉ mới.",
      foot: "Ngày chuyển: 25/11/2026",
    },
  };

  function $(id) {
    return document.getElementById(id);
  }

  // ── Đích: cùng đường dẫn ở địa chỉ mới. Ghép CHUỖI (không dùng new URL(path, base)): «//evil.com» vẫn nằm dưới TARGET.
  var path = (location.pathname || "/").replace(/^\/+/, "/");
  var dest = TARGET + path + location.search + location.hash;
  var shown = TARGET.replace(/^https?:\/\//, "") + (path === "/" ? "" : decodeSafe(path));

  function decodeSafe(s) {
    try {
      return decodeURI(s);
    } catch (e) {
      return s;
    }
  }

  var links = document.querySelectorAll("[data-go]");
  for (var i = 0; i < links.length; i++) links[i].setAttribute("href", dest);
  $("new-url").textContent = shown;
  $("new-url").setAttribute("title", TARGET + path);
  if (location.host) $("old-url").textContent = location.host + (path === "/" ? "" : decodeSafe(path));

  // ── Ngôn ngữ: ?lang= → ngôn ngữ trình duyệt → tiếng Nhật
  function pickLang() {
    var q = /[?&]lang=(ja|en|vi)\b/.exec(location.search);
    if (q) return q[1];
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var j = 0; j < list.length; j++) {
      var l = String(list[j]).toLowerCase();
      if (l.indexOf("ja") === 0) return "ja";
      if (l.indexOf("vi") === 0) return "vi";
      if (l.indexOf("en") === 0) return "en";
    }
    return "ja";
  }

  var lang = pickLang();
  var paused = false;

  function txt(key) {
    var v = T[lang][key];
    return v && typeof v === "object" ? v[SITE] : v;
  }

  function applyLang() {
    root.setAttribute("lang", lang);
    document.title = T[lang].docTitle;
    var nodes = document.querySelectorAll("[data-t]");
    for (var k = 0; k < nodes.length; k++) {
      var key = nodes[k].getAttribute("data-t");
      if (key === "pause") continue;
      if (key === "counting" && paused) continue;
      nodes[k].textContent = txt(key);
    }
    $("pause").textContent = paused ? txt("resume") : txt("pause");
    if (paused) $("status-text").textContent = txt("paused");
    var btns = document.querySelectorAll("[data-lang]");
    for (var b = 0; b < btns.length; b++) {
      btns[b].setAttribute("aria-pressed", btns[b].getAttribute("data-lang") === lang ? "true" : "false");
    }
  }

  // ── Đếm ngược theo đồng hồ thật (tab ẩn bị chậm nhịp vẫn đúng giờ)
  var count = $("count");
  var bar = $("bar");
  var num = $("num");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var remainingMs = SECONDS * 1000;
  var startedAt = 0;
  var raf = 0;
  var done = false;

  function left() {
    return paused ? remainingMs : Math.max(0, remainingMs - (performance.now() - startedAt));
  }

  function draw() {
    var ms = left();
    var p = 1 - ms / (SECONDS * 1000);
    if (reduce) p = Math.floor(p * SECONDS) / SECONDS;
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    num.textContent = String(Math.ceil(ms / 1000));
  }

  function tick() {
    if (paused || done) return;
    draw();
    if (left() <= 0) return leave();
    raf = requestAnimationFrame(tick);
  }

  function leave() {
    done = true;
    $("status-text").textContent = txt("leaving");
    location.replace(dest);
  }

  function start() {
    paused = false;
    count.classList.remove("paused");
    startedAt = performance.now();
    $("status-text").textContent = txt("counting");
    $("pause").textContent = txt("pause");
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    remainingMs = left();
    paused = true;
    cancelAnimationFrame(raf);
    count.classList.add("paused");
    $("status-text").textContent = txt("paused");
    $("pause").textContent = txt("resume");
    $("sr").textContent = txt("paused");
  }

  $("pause").addEventListener("click", function () {
    if (paused) {
      if (remainingMs <= 0) remainingMs = SECONDS * 1000;
      start();
    } else {
      stop();
    }
  });

  var langBtns = document.querySelectorAll("[data-lang]");
  for (var m = 0; m < langBtns.length; m++) {
    langBtns[m].addEventListener("click", function (e) {
      lang = e.currentTarget.getAttribute("data-lang");
      applyLang();
    });
  }

  // Esc = dừng (bàn phím); quay lại trang bằng nút Back thì đếm lại từ đầu thay vì nhảy đi ngay
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !paused && !done) stop();
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      done = false;
      remainingMs = SECONDS * 1000;
      start();
    }
  });

  applyLang();
  count.hidden = false;
  $("pause").hidden = false;
  $("sr").textContent = txt("srStart");
  draw();
  start();
})();
