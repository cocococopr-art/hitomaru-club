/* =========================================================
   HITOMARU CLUB script.js
   Googleスプレッドシートの公開CSVから記事を読み込みます
   ========================================================= */

/* ---------------------------------------------------------
   ここだけ変更
   blog_postsシートを「ウェブに公開」して取得したCSV URLを貼る
--------------------------------------------------------- */
const BLOG_CSV_URL =
  "ここにblog_postsシートのCSV公開URLを入れる";

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
      "image",
      "画像URL",
      "画像アドレス"
    ]),
    author: pick(row, ["author", "投稿者", "名前"]),
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
   一覧ページ
--------------------------------------------------------- */

function postImage(post) {
  const imageUrl = normalizeImageUrl(post.image_url);

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

  if (!wrap) return;

  try {
    const posts = await getPosts();

    renderPostList(posts);

    filter?.addEventListener("change", () => {
      const selectedCategory = filter.value;

      const filteredPosts =
        selectedCategory === "all"
          ? posts
          : posts.filter(
              post => post.category === selectedCategory
            );

      renderPostList(filteredPosts);
    });
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

async function setupArticle() {
  const wrap = document.getElementById("articleContent");

  if (!wrap) return;

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("id");

  try {
    const posts = await getPosts();
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

    const imageUrl = normalizeImageUrl(post.image_url);

    document.title =
      `${post.title}｜HITOMARU CLUB`;

    wrap.innerHTML = `
      ${
        imageUrl
          ? `
            <div class="article-image">
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(post.title)}"
                referrerpolicy="no-referrer"
                onerror="this.parentElement.remove()"
              >
            </div>
          `
          : ""
      }

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
