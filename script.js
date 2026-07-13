/* =========================================================
   HITOMARU CLUB script.js
   Googleスプレッドシートの公開CSVから記事を読み込みます

   ▼ 複数画像について
   image_url のセルに、カンマ または セル内改行(Alt+Enter)で
   複数のURLを並べると、1枚目がサムネイル・
   記事ページでは全画像がギャラリー表示されます。

   ▼ 添付・リンクについて
   links 列(または「リンク」「添付」)に1行1件で入力すると、
   記事ページに「添付・リンク」ボタンとして表示されます。
   書き方(どちらでも可):
     ・URLだけ           https://drive.google.com/file/d/xxx/view
     ・表示名 | URL      7月シフト表 | https://docs.google.com/...
   ========================================================= */

/* ---------------------------------------------------------
   ここだけ変更
   blog_postsシートを「ウェブに公開」して取得したCSV URLを貼る
--------------------------------------------------------- */
const BLOG_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLz-N6wU0JHdIw_lO0ffpiXJS8gQkSfmVE79K1Coh2sOKC0IDoXFzf4rtIAfPW-opo0SoY_0DiLwik/pub?output=csv";

/* URL未設定・取得失敗時の表示確認用サンプル */
const FALLBACK_POSTS = [
  {
    post_id: "sample-news",
    date: "2026-07-13",
    category: "お知らせ",
    title: "7月全体MTGについて",
    summary: "次回の全体MTGの日程と確認事項を共有します。",
    body:
      "7月の全体MTGについてお知らせします。\n\n" +
      "当日は今月の目標、現場状況、研修内容を確認します。\n\n" +
      "参加できない場合は、事前に運営へ連絡してください。",
    image_url: "",
    author: "HITOMARU運営",
    pinned: "TRUE",
    active: "TRUE"
  },
  {
    post_id: "sample-diary",
    date: "2026-07-12",
    category: "現場日記",
    title: "今週の現場で学んだこと",
    summary: "声かけとヒアリングで意識したポイントを共有します。",
    body:
      "今週の現場では、最初から商材を案内するのではなく、" +
      "お客様の利用状況を細かく確認することを意識しました。\n\n" +
      "料金だけでなく、家族構成や自宅インターネットまで聞くことで、" +
      "提案の幅が広がりました。",
    image_url: "",
    author: "橋本理志",
    pinned: "FALSE",
    active: "TRUE"
  },
  {
    post_id: "sample-training",
    date: "2026-06-20",
    category: "研修",
    title: "6月ロールプレイ研修の振り返り",
    summary: "月別アーカイブの表示確認用のサンプル記事です。",
    body:
      "6月に実施したロールプレイ研修の振り返りです。\n\n" +
      "月別アーカイブ(≡メニュー)から過去の記事を見返せます。",
    image_url: "",
    author: "HITOMARU運営",
    pinned: "FALSE",
    active: "TRUE"
  }
];

/* ---------------------------------------------------------
   共通処理
--------------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isTrueValue(value) {
  const text = String(value ?? "").trim().toLowerCase();

  return (
    value === true ||
    text === "true" ||
    text === "1" ||
    text === "yes" ||
    text === "active" ||
    text === "有効"
  );
}

/**
 * ダブルクオート内のカンマ・改行にも対応したCSVパーサー
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  text = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index++;

      row.push(cell);
      cell = "";

      if (row.some(value => String(value).trim() !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell);

  if (row.some(value => String(value).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];

  const headers = rows[0].map(header => String(header).trim());

  return rows.slice(1).map(row => {
    const result = {};

    headers.forEach((header, index) => {
      result[header] = String(row[index] ?? "").trim();
    });

    return result;
  });
}

function pick(object, keys) {
  for (const key of keys) {
    if (
      object[key] !== undefined &&
      String(object[key]).trim() !== ""
    ) {
      return object[key];
    }
  }

  return "";
}

function normalizePost(row) {
  return {
    post_id: pick(row, ["post_id", "id", "記事ID"]),
    date: pick(row, ["date", "日付", "投稿日"]),
    category: pick(row, ["category", "カテゴリ", "種別"]),
    title: pick(row, ["title", "タイトル"]),
    summary: pick(row, ["summary", "概要", "説明"]),
    body: pick(row, ["body", "本文", "content"]),
    image_url: pick(row, [
      "image_url",
      "images",
      "image",
      "画像URL",
      "画像アドレス"
    ]),
    author: pick(row, ["author", "投稿者", "名前"]),
    links: pick(row, ["links", "link", "リンク", "添付", "資料URL"]),
    pinned: pick(row, ["pinned", "固定", "おすすめ"]),
    active: pick(row, ["active", "表示", "有効"])
  };
}

function normalizeImageUrl(value) {
  const rawUrl = String(value || "").trim();

  if (!rawUrl) return "";

  if (rawUrl.startsWith("/") || rawUrl.startsWith("./")) {
    return rawUrl;
  }

  if (!/^https:\/\//i.test(rawUrl)) {
    return "";
  }

  // Google Drive共有URLを画像表示用URLへ変換
  const driveFileMatch = rawUrl.match(
    /drive\.google\.com\/file\/d\/([^/?#]+)/i
  );

  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(
      driveFileMatch[1]
    )}`;
  }

  if (/drive\.google\.com/i.test(rawUrl)) {
    const idMatch = rawUrl.match(/[?&]id=([^&#]+)/i);

    if (idMatch) {
      return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(
        idMatch[1]
      )}`;
    }
  }

  return rawUrl;
}

/**
 * image_urlセルの中身を画像URLの配列に変換
 * 区切り:カンマ / セル内改行 / 空白行
 */
function splitImageUrls(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map(part => normalizeImageUrl(part))
    .filter(url => url !== "");
}

/* URLからリンクの種類を推定してラベルにする */
function guessLinkType(url) {
  const text = String(url || "").toLowerCase();

  if (/docs\.google\.com\/spreadsheets/.test(text)) return "スプレッドシート";
  if (/docs\.google\.com\/document/.test(text)) return "ドキュメント";
  if (/docs\.google\.com\/presentation/.test(text)) return "スライド";
  if (/docs\.google\.com\/forms|forms\.gle/.test(text)) return "フォーム";
  if (/drive\.google\.com/.test(text)) return "Driveファイル";
  if (/\.pdf(\?|#|$)/.test(text)) return "PDF";
  if (/\.(png|jpe?g|gif|webp)(\?|#|$)/.test(text)) return "画像";
  if (/youtube\.com|youtu\.be|\.mp4(\?|#|$)/.test(text)) return "動画";
  if (/\.(xlsx?|csv)(\?|#|$)/.test(text)) return "Excel/CSV";
  if (/\.(docx?)(\?|#|$)/.test(text)) return "Word";
  if (/\.(pptx?)(\?|#|$)/.test(text)) return "PowerPoint";

  return "リンク";
}

/**
 * links セルを {label, url, type} の配列に変換
 * 1行1件。「表示名 | URL」または URLのみ。
 */
function parseLinks(value) {
  let lines = String(value || "").split(/\n/);

  // 改行なしでカンマ区切りされている場合にも対応
  if (lines.length === 1 && (lines[0].match(/https:\/\//gi) || []).length > 1) {
    lines = lines[0].split(",");
  }

  return lines
    .map(line => {
      const text = line.trim();

      if (!text) return null;

      let label = "";
      let url = text;

      const pipeIndex = text.indexOf("|");

      if (pipeIndex !== -1) {
        label = text.slice(0, pipeIndex).trim();
        url = text.slice(pipeIndex + 1).trim();
      }

      if (!/^https:\/\//i.test(url)) return null;

      const type = guessLinkType(url);

      return {
        url,
        type,
        label: label || type
      };
    })
    .filter(Boolean);
}

function parsePostDate(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const normalized = text
    .replace(/\./g, "-")
    .replace(/\//g, "-");

  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parsePostDate(value);

  if (!date) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

/* "2026-07" のような月キーを取得 */
function getMonthKey(value) {
  const date = parsePostDate(value);

  if (!date) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${date.getFullYear()}-${month}`;
}

function formatMonthLabel(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);

  if (!match) return String(monthKey || "");

  return `${match[1]}年${Number(match[2])}月`;
}

function categoryClass(category) {
  if (category === "お知らせ") return "is-news";
  if (category === "現場日記") return "is-diary";
  if (category === "研修") return "is-training";
  if (category === "社内文化") return "is-culture";

  return "";
}

function isBlogUrlConfigured() {
  return (
    BLOG_CSV_URL &&
    !BLOG_CSV_URL.includes("ここに") &&
    /^https:\/\//i.test(BLOG_CSV_URL)
  );
}

async function fetchPostsFromSpreadsheet() {
  if (!isBlogUrlConfigured()) {
    console.warn(
      "BLOG_CSV_URLが未設定のため、サンプル記事を表示します。"
    );

    return FALLBACK_POSTS;
  }

  const separator = BLOG_CSV_URL.includes("?") ? "&" : "?";
  const requestUrl =
    `${BLOG_CSV_URL}${separator}cache=${Date.now()}`;

  const response = await fetch(requestUrl, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const rows = parseCSV(csvText);
  const posts = rowsToObjects(rows).map(normalizePost);

  if (!posts.length) {
    throw new Error("blog_postsシートに記事がありません。");
  }

  return posts;
}

async function getPosts() {
  let posts;

  try {
    posts = await fetchPostsFromSpreadsheet();
  } catch (error) {
    console.error(
      "スプレッドシートから記事を取得できませんでした。",
      error
    );

    posts = FALLBACK_POSTS;
  }

  return posts
    .filter(post => {
      const activeText = String(post.active ?? "").trim();

      return activeText === "" || isTrueValue(activeText);
    })
    .filter(post => post.post_id && post.title)
    .map(post => ({
      ...post,
      images: splitImageUrls(post.image_url),
      linkList: parseLinks(post.links),
      monthKey: getMonthKey(post.date)
    }))
    .sort((postA, postB) => {
      const pinnedDifference =
        Number(isTrueValue(postB.pinned)) -
        Number(isTrueValue(postA.pinned));

      if (pinnedDifference !== 0) {
        return pinnedDifference;
      }

      const dateA = parsePostDate(postA.date)?.getTime() || 0;
      const dateB = parsePostDate(postB.date)?.getTime() || 0;

      return dateB - dateA;
    });
}

/* ---------------------------------------------------------
   月別アーカイブメニュー(≡)
   ・一覧ページ:その場で絞り込み
   ・記事ページ:index.html?month=YYYY-MM へ移動
--------------------------------------------------------- */

function openDrawer() {
  const drawer = document.getElementById("drawer");
  const button = document.getElementById("menuButton");

  if (!drawer) return;

  drawer.hidden = false;

  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
  });

  button?.setAttribute("aria-expanded", "true");
  document.body.classList.add("drawer-locked");
}

function closeDrawer() {
  const drawer = document.getElementById("drawer");
  const button = document.getElementById("menuButton");

  if (!drawer) return;

  drawer.classList.remove("is-open");
  button?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("drawer-locked");

  window.setTimeout(() => {
    drawer.hidden = true;
  }, 220);
}

/**
 * @param {Array}  posts        全記事
 * @param {Object} options
 * @param {Function|null} options.onSelectMonth
 *   一覧ページでは月クリック時のコールバック。
 *   nullの場合はリンクとして index.html?month=... へ遷移。
 */
function setupArchiveMenu(posts, { onSelectMonth = null } = {}) {
  const button = document.getElementById("menuButton");
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeButton = document.getElementById("drawerClose");
  const list = document.getElementById("monthList");

  if (!button || !drawer || !list) return;

  // 月ごとの件数を集計(新しい月が上)
  const counts = new Map();

  posts.forEach(post => {
    if (!post.monthKey) return;

    counts.set(
      post.monthKey,
      (counts.get(post.monthKey) || 0) + 1
    );
  });

  const monthKeys = [...counts.keys()].sort().reverse();

  if (!monthKeys.length) {
    list.innerHTML = `
      <li class="month-loading">記事がまだありません。</li>
    `;
  } else if (onSelectMonth) {
    list.innerHTML = `
      <li>
        <button type="button" class="month-item" data-month="all">
          <span>すべての記事</span>
          <small>${posts.length}件</small>
        </button>
      </li>
      ${monthKeys.map(key => `
        <li>
          <button
            type="button"
            class="month-item"
            data-month="${escapeHtml(key)}"
          >
            <span>${escapeHtml(formatMonthLabel(key))}</span>
            <small>${counts.get(key)}件</small>
          </button>
        </li>
      `).join("")}
    `;

    list.querySelectorAll(".month-item").forEach(item => {
      item.addEventListener("click", () => {
        onSelectMonth(item.dataset.month || "all");
        closeDrawer();
      });
    });
  } else {
    list.innerHTML = `
      <li>
        <a class="month-item" href="./index.html">
          <span>すべての記事</span>
          <small>${posts.length}件</small>
        </a>
      </li>
      ${monthKeys.map(key => `
        <li>
          <a
            class="month-item"
            href="./index.html?month=${encodeURIComponent(key)}"
          >
            <span>${escapeHtml(formatMonthLabel(key))}</span>
            <small>${counts.get(key)}件</small>
          </a>
        </li>
      `).join("")}
    `;
  }

  button.addEventListener("click", () => {
    drawer.hidden ? openDrawer() : closeDrawer();
  });

  overlay?.addEventListener("click", closeDrawer);
  closeButton?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !drawer.hidden) {
      closeDrawer();
    }
  });
}

/* ---------------------------------------------------------
   一覧ページ
--------------------------------------------------------- */

function postImage(post) {
  const imageUrl = post.images?.[0] || "";
  const extraCount = Math.max((post.images?.length || 0) - 1, 0);

  const fallback = `
    <div class="post-image-fallback">
      <span>HITOMARU CLUB</span>
    </div>
  `;

  return `
    <div class="post-image">
      ${fallback}

      ${
        imageUrl
          ? `
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(post.title)}"
              loading="lazy"
              referrerpolicy="no-referrer"
              onerror="this.remove()"
            >
          `
          : ""
      }

      ${
        extraCount > 0
          ? `<span class="photo-count">+${extraCount}枚</span>`
          : ""
      }

      ${
        isTrueValue(post.pinned)
          ? `<span class="pin-badge">おすすめ</span>`
          : ""
      }
    </div>
  `;
}

function renderPostList(posts) {
  const wrap = document.getElementById("postList");

  if (!wrap) return;

  if (!posts.length) {
    wrap.innerHTML = `
      <div class="empty">
        表示できる記事はありません。
      </div>
    `;

    return;
  }

  wrap.innerHTML = posts.map(post => `
    <a
      class="post-card"
      href="./article.html?id=${encodeURIComponent(post.post_id)}"
    >
      ${postImage(post)}

      <div class="post-card-body">
        <div class="post-meta">
          <span class="category ${categoryClass(post.category)}">
            ${escapeHtml(post.category || "ブログ")}
          </span>

          <time datetime="${escapeHtml(post.date)}">
            ${escapeHtml(formatDate(post.date))}
          </time>

          ${
            post.linkList?.length
              ? `<span class="link-count">📎 ${post.linkList.length}</span>`
              : ""
          }
        </div>

        <h2>${escapeHtml(post.title)}</h2>

        <p>
          ${escapeHtml(post.summary || "")}
        </p>

        <div class="post-footer">
          <span>
            ${escapeHtml(post.author || "HITOMARU")}
          </span>

          <strong>読む →</strong>
        </div>
      </div>
    </a>
  `).join("");
}

async function setupPostList() {
  const wrap = document.getElementById("postList");
  const filter = document.getElementById("categoryFilter");
  const activeMonthBar = document.getElementById("activeMonth");
  const activeMonthLabel =
    document.getElementById("activeMonthLabel");
  const clearMonthButton = document.getElementById("clearMonth");

  if (!wrap) return;

  try {
    const posts = await getPosts();

    // URLの ?month=YYYY-MM を初期値として反映
    const params = new URLSearchParams(window.location.search);
    const initialMonth = params.get("month") || "all";

    const state = {
      category: "all",
      month: /^\d{4}-\d{2}$/.test(initialMonth)
        ? initialMonth
        : "all"
    };

    function applyFilters() {
      const filtered = posts.filter(post => {
        const categoryOk =
          state.category === "all" ||
          post.category === state.category;

        const monthOk =
          state.month === "all" ||
          post.monthKey === state.month;

        return categoryOk && monthOk;
      });

      renderPostList(filtered);

      // 月フィルター表示の更新
      if (activeMonthBar && activeMonthLabel) {
        if (state.month === "all") {
          activeMonthBar.hidden = true;
        } else {
          activeMonthBar.hidden = false;
          activeMonthLabel.textContent =
            `${formatMonthLabel(state.month)} の記事`;
        }
      }

      // URLも同期(共有・リロード対応)
      const url = new URL(window.location.href);

      if (state.month === "all") {
        url.searchParams.delete("month");
      } else {
        url.searchParams.set("month", state.month);
      }

      window.history.replaceState(null, "", url);
    }

    setupArchiveMenu(posts, {
      onSelectMonth(monthKey) {
        state.month = monthKey;
        applyFilters();
      }
    });

    filter?.addEventListener("change", () => {
      state.category = filter.value;
      applyFilters();
    });

    clearMonthButton?.addEventListener("click", () => {
      state.month = "all";
      applyFilters();
    });

    applyFilters();
  } catch (error) {
    console.error("記事一覧の表示に失敗しました。", error);

    wrap.innerHTML = `
      <div class="empty">
        記事を取得できませんでした。
      </div>
    `;
  }
}

/* ---------------------------------------------------------
   記事詳細ページ
--------------------------------------------------------- */

function formatArticleBody(value) {
  return escapeHtml(value || "")
    .split(/\n{2,}/)
    .map(paragraph => `
      <p>${paragraph.replace(/\n/g, "<br>")}</p>
    `)
    .join("");
}

/* 1枚目:メイン画像 / 2枚目以降:ギャラリー */
function articleImages(post) {
  const images = post.images || [];

  if (!images.length) return "";

  const [mainImage, ...rest] = images;

  const galleryClass =
    rest.length === 1 ? "article-gallery is-single" : "article-gallery";

  return `
    <div class="article-image">
      <img
        src="${escapeHtml(mainImage)}"
        alt="${escapeHtml(post.title)}"
        referrerpolicy="no-referrer"
        onerror="this.parentElement.remove()"
      >
    </div>

    ${
      rest.length
        ? `
          <div class="${galleryClass}">
            ${rest.map((url, index) => `
              <figure class="gallery-item">
                <img
                  src="${escapeHtml(url)}"
                  alt="${escapeHtml(post.title)} 写真${index + 2}"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  onerror="this.parentElement.remove()"
                >
              </figure>
            `).join("")}
          </div>
        `
        : ""
    }
  `;
}

async function setupArticle() {
  const wrap = document.getElementById("articleContent");

  if (!wrap) return;

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("id");

  try {
    const posts = await getPosts();

    // 記事ページでは月クリックで一覧ページへ遷移
    setupArchiveMenu(posts);

    const post = posts.find(
      item => item.post_id === postId
    );

    if (!post) {
      wrap.innerHTML = `
        <div class="empty">
          記事が見つかりません。
        </div>
      `;

      return;
    }

    document.title =
      `${post.title}｜HITOMARU CLUB`;

    wrap.innerHTML = `
      ${articleImages(post)}

      <div class="article-meta">
        <span class="category ${categoryClass(post.category)}">
          ${escapeHtml(post.category || "ブログ")}
        </span>

        <time datetime="${escapeHtml(post.date)}">
          ${escapeHtml(formatDate(post.date))}
        </time>

        <span>
          ${escapeHtml(post.author || "HITOMARU")}
        </span>
      </div>

      <h1>${escapeHtml(post.title)}</h1>

      <p class="article-summary">
        ${escapeHtml(post.summary || "")}
      </p>

      <div class="article-body">
        ${formatArticleBody(post.body)}
      </div>
    `;
  } catch (error) {
    console.error("記事の表示に失敗しました。", error);

    wrap.innerHTML = `
      <div class="empty">
        記事を取得できませんでした。
      </div>
    `;
  }
}

setupPostList();
setupArticle();
