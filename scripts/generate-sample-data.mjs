// 架空の口コミサンプルデータを作るスクリプト（実在の口コミは使わない）
// 実行：node scripts/generate-sample-data.mjs
// 乱数の種を固定しているので、何度実行しても同じデータができる
//
// 出力：
//   public/sample/reviews_sample.csv  … アプリで読み込むサンプル（2025-09-01〜2026-09-26）
//   data/eval/reviews_eval50.csv      … 分類精度の測定用50件（正解ラベルは手作業で記入する）
//                                        手作業のラベルを消さないよう、すでにある場合は上書きしない
//                                        （作り直すときは --force を付ける）

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// ---- 乱数（種を固定） ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260926);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

// ---- 期間：2025年9月〜2026年9月（13か月）。最終日＝「当日」 ----
const MONTHS = [];
for (let i = 0; i < 13; i++) {
  const d = new Date(Date.UTC(2025, 8 + i, 1));
  MONTHS.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
}
const LAST_DAY = "2026-09-26";
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fmt = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const season = (m) =>
  [6, 7, 8, 9].includes(m) ? "summer" : [12, 1, 2].includes(m) ? "winter" : "mild";

// ---- 部品となる文 ----
// season を付けた文は、その季節の月にだけ使う
// stay を付けた文は、その宿泊タイプの口コミにだけ使う
const FRAGMENTS = {
  room: {
    pos: [
      { text: "部屋が広く、長期滞在でも窮屈さを感じませんでした。", stay: ["連泊"] },
      { text: "ミニキッチンと電子レンジがあるので、連泊中の食事に助かりました。", stay: ["連泊"] },
      "ベッドの寝心地が良く、毎晩ぐっすり眠れました。",
      "室内の洗濯乾燥機が便利で、荷物を減らせました。",
      "掃除が行き届いていて清潔でした。",
      "デスクと椅子がしっかりしていて、仕事がはかどりました。",
      "窓からの眺めが良く、朝の光が気持ちよかったです。",
      "収納が多く、スーツケースを広げたままでも部屋が片付きました。",
    ],
    neg: [
      "浴室の排水が悪く、シャワー中に水が溜まってしまいました。",
      "隣の部屋の話し声が聞こえ、夜は少し気になりました。",
      "冷蔵庫の音が大きく、なかなか寝付けませんでした。",
      "部屋の設備が全体的に古く、壁紙の汚れが目立ちました。",
      "コンセントがベッドから遠く、スマホの充電に不便でした。",
      { text: "洗濯機が故障していて、連泊中に使えなかったのが残念です。", stay: ["連泊"] },
      { text: "エアコンの効きが悪く、夜も暑くて何度も目が覚めました。", season: "summer" },
      { text: "エアコンからカビのような臭いがしました。", season: "summer" },
      { text: "暖房の効きが悪く、夜は少し寒かったです。", season: "winter" },
      { text: "窓の結露がひどく、カーテンが湿っていました。", season: "winter" },
    ],
  },
  net: {
    pos: [
      "Wi-Fiが速く、オンライン会議も途切れずにできました。",
      "部屋でもラウンジでもWi-Fiが安定していて、仕事に集中できました。",
      "有線LANも使えたので、大きなファイルの送信も安心でした。",
      "動画も止まらずに見られるくらいWi-Fiが快適でした。",
    ],
    neg: [
      "夜になるとWi-Fiが極端に遅くなり、オンライン会議が何度も切れました。",
      "部屋の奥だとWi-Fiが届きにくく、テザリングで対応しました。",
      "Wi-Fiのパスワードが分かりにくく、つなぐまでに時間がかかりました。",
      { text: "長期滞在向けとうたっているのに、回線が不安定なのは困ります。", stay: ["連泊", "ビジネス"] },
      "動画を見ようとしたら読み込みが止まってばかりでした。",
      "Wi-Fiが1日に何度も切れて、そのたびに再接続が必要でした。",
    ],
  },
  service: {
    pos: [
      "フロントの方が近くの飲食店を丁寧に教えてくださいました。",
      { text: "チェックイン時に子どもにも優しく声をかけてもらい、家族みんな安心できました。", stay: ["家族"] },
      { text: "連泊中、スタッフの皆さんが名前を覚えて声をかけてくれて嬉しかったです。", stay: ["連泊"] },
      "急な延泊のお願いにも快く対応していただきました。",
      "体調を崩した際、すぐに近くの薬局を調べてくださり助かりました。",
      "荷物の受け取りや発送もスムーズに手配してもらえました。",
      "誕生日だと伝えたら、メッセージカードを用意してくださり感激しました。",
    ],
    neg: [
      "チェックインで30分以上待たされ、説明もありませんでした。",
      "フロントの対応がそっけなく、質問しづらい雰囲気でした。",
      "清掃不要の札を出していたのに部屋に入られていて、驚きました。",
      "電話がなかなかつながらず、問い合わせに苦労しました。",
      "予約内容が伝わっておらず、チェックイン時にもう一度説明する必要がありました。",
      "夜間はスタッフが一人だけのようで、対応を頼んでも1時間近く待ちました。",
    ],
  },
  food: {
    pos: [
      "朝食の地元野菜のビュッフェが美味しく、毎朝楽しみでした。",
      { text: "名物のだし巻き卵が絶品で、連泊中毎日食べました。", stay: ["連泊"] },
      "ラウンジの無料コーヒーが美味しく、仕事の合間の息抜きになりました。",
      "夕方のラウンジで地元のクラフトビールが飲めるのが良かったです。",
      { text: "朝食のメニューが日替わりなので、連泊でも飽きませんでした。", stay: ["連泊"] },
      "ラウンジが静かで、読書や作業にちょうど良い空間でした。",
    ],
    neg: [
      "朝食会場が混雑していて、席が空くまで15分ほど待ちました。",
      "朝食の品切れが多く、補充もなかなかされませんでした。",
      "朝食の温かい料理が冷めていて残念でした。",
      "ラウンジの利用時間が短く、仕事終わりに間に合いませんでした。",
      "ラウンジのテーブルが片付いておらず、使いにくかったです。",
    ],
  },
};

// 4軸のどれにも当てはまらない話題（立地など）
const OUT_OF_SCOPE = [
  "駅から歩いて5分ほどで便利な立地でした。",
  "駐車場が狭く、大きな車だと停めにくかったです。",
  "周辺にコンビニや飲食店が多く、不便はありませんでした。",
  "港まで歩いて行けるので、散歩が楽しかったです。",
];

const OPENERS = {
  連泊: () => `${5 + Math.floor(rand() * 10)}泊の連泊で利用しました。`,
  家族: () => pick(["家族旅行で利用しました。", "子ども2人と家族で泊まりました。"]),
  カップル: () => pick(["夫婦で利用しました。", "記念日旅行で利用しました。"]),
  ビジネス: () => pick(["出張で利用しました。", "仕事で3泊しました。"]),
  一人旅: () => "一人旅で利用しました。",
};
const CLOSERS = {
  pos: ["また利用したいです。", "次回も連泊で使わせていただきます。", "友人にもすすめたいと思います。", ""],
  neg: ["改善を期待しています。", "価格に見合う対応をお願いしたいです。", ""],
  mixed: ["総合的には満足です。", "改善されればまた利用したいです。", ""],
};

// ---- 月ごとの傾向（分析で見つけてほしい変化） ----
// 通信環境：2026年6月ごろから苦情が増える → 優先改善アラートの対象
// 接客：少しずつ改善している
// 朝食・ラウンジ：一貫して強み
function negRate(axis, monthIndex) {
  switch (axis) {
    case "room":
      return 0.3;
    case "net":
      return monthIndex >= 9 ? 0.6 + 0.07 * (monthIndex - 9) : 0.18;
    case "service":
      return monthIndex < 6 ? 0.25 : 0.12;
    case "food":
      return 0.12;
  }
}
const MENTION = { room: 0.45, net: 0.3, service: 0.5, food: 0.45 };

const SITES = [
  ["楽天トラベル", 0.4],
  ["じゃらん", 0.35],
  ["Google", 0.25],
];
const STAY_TYPES = [
  ["連泊", 0.35],
  ["ビジネス", 0.2],
  ["家族", 0.2],
  ["カップル", 0.15],
  ["一人旅", 0.1],
];
function weighted(list) {
  let r = rand();
  for (const [v, w] of list) {
    if ((r -= w) < 0) return v;
  }
  return list[list.length - 1][0];
}

function fragmentFor(axis, polarity, m, stayType) {
  const pool = FRAGMENTS[axis][polarity]
    .map((f) => (typeof f === "string" ? { text: f } : f))
    .filter((f) => !f.season || f.season === season(m))
    .filter((f) => !f.stay || f.stay.includes(stayType));
  return pick(pool).text;
}

// 部品を組み合わせて口コミ1件を作る
function generateReview(monthIndex, y, m, d) {
  const stayType = weighted(STAY_TYPES);
  const parts = [OPENERS[stayType]()];
  let pos = 0;
  let neg = 0;

  const axes = Object.keys(MENTION).filter((axis) => {
    let p = MENTION[axis];
    if (axis === "net" && (stayType === "連泊" || stayType === "ビジネス")) p += 0.25;
    return chance(p);
  });
  if (axes.length === 0) axes.push(pick(Object.keys(MENTION)));

  for (const axis of axes) {
    const polarity = chance(negRate(axis, monthIndex)) ? "neg" : "pos";
    if (polarity === "neg") neg++;
    else pos++;
    parts.push(fragmentFor(axis, polarity, m, stayType));
  }
  if (chance(0.12)) parts.push(pick(OUT_OF_SCOPE));

  const tone = neg === 0 ? "pos" : pos === 0 ? "neg" : "mixed";
  const closers = CLOSERS[tone].filter((c) => stayType === "連泊" || !c.includes("連泊"));
  parts.push(pick(closers));

  const noise = (rand() + rand() - 1) * 0.8;
  const score = 4.2 + 0.3 * pos - 1.4 * neg + noise;
  const rating = Math.min(5, Math.max(1, Math.round(score)));

  return {
    date: fmt(y, m, d),
    site: weighted(SITES),
    rating,
    text: parts.filter(Boolean).join(""),
    stay_type: stayType,
    kind: "generated",
  };
}

// ---- 手書きの口コミ（判断が難しい例） ----
// date を指定したものはその日に置く。それ以外は月だけ指定し、日はランダム
const ONE_LINERS = [
  "大変親切な接客でした。",
  "とても良かったです！",
  "快適に過ごせました。",
  "また来ます！",
  "スタッフの皆さんの笑顔に癒されました。",
  "朝ごはんが美味しかった！",
  "清潔で居心地が良かったです。",
  "ありがとうございました。",
  "最高の連泊でした。",
  "ラウンジが快適でした。",
  "Wi-Fiが速くて助かりました。",
  "接客が素晴らしかったです。",
  "子どもも大喜びでした。",
  "リピート決定です。",
  "静かでよく眠れました。",
  "だし巻き卵が美味しかったです。",
  "フロントの対応が丁寧でした。",
  "満足です。",
  "居心地が良すぎて延泊しました。",
  "また出張で使います。",
];

// 本文に宿泊タイプが表れている一言口コミは、宿泊タイプを固定する
const ONE_LINER_STAY = {
  "子どもも大喜びでした。": "家族",
  "最高の連泊でした。": "連泊",
  "居心地が良すぎて延泊しました。": "連泊",
  "また出張で使います。": "ビジネス",
};

const LONG_COMPLAINTS = [
  {
    date: "2026-09-26",
    rating: 2,
    stay_type: "連泊",
    site: "楽天トラベル",
    text: "ワーケーション目的で5泊しましたが、Wi-Fiの不安定さに最後まで悩まされました。初日の夜にオンライン会議が3回切断され、フロントに相談したところ「ルーターを再起動します」とのことでしたが改善せず、翌日以降も夕方から夜にかけてはほとんど使い物になりませんでした。結局スマホのテザリングで乗り切りましたが、通信量の追加料金がかかりました。ホームページで『仕事に集中できる滞在』とうたっている以上、通信環境は最優先で見直していただきたいです。",
  },
  {
    month: "2026-03",
    rating: 2,
    stay_type: "連泊",
    site: "じゃらん",
    text: "3泊目の夜、部屋に戻るとタオルが補充されておらず、ゴミもそのままでした。フロントに伝えると「確認します」と言われたまま連絡がなく、結局自分で取りに行きました。翌朝もう一度お願いしたところ、別のスタッフの方が丁寧に謝ってくださり、その後はきちんと対応していただけましたが、最初の対応で不信感が残りました。部屋自体は広くて使いやすかっただけに、残念です。",
  },
  {
    month: "2026-07",
    rating: 1,
    stay_type: "家族",
    site: "Google",
    text: "7月に4泊しましたが、部屋のエアコンがほとんど効かず、夜も室温が28度から下がりませんでした。2日目に部屋の交換をお願いしましたが満室とのことで、扇風機を貸していただくのみでした。子どもが寝苦しくて何度も起きてしまい、家族旅行が台無しになりました。設備の点検をもう少しこまめにしていただきたいです。",
  },
  {
    month: "2025-11",
    rating: 2,
    stay_type: "カップル",
    site: "じゃらん",
    text: "土曜の朝、朝食会場が満席で20分以上待ちました。待っている間の案内もなく、ようやく座れたときには温かい料理がほとんど品切れでした。スタッフの方に補充の予定を聞いても「分かりません」との返事で、せっかくの朝食を楽しみにしていたのでがっかりしました。週末だけでも時間帯を分けるなど、工夫をお願いしたいです。",
  },
  {
    month: "2026-08",
    rating: 3,
    stay_type: "連泊",
    site: "楽天トラベル",
    text: "テレワークのため2週間滞在しました。平日の昼間は問題ないのですが、夜8時以降になるとWi-Fiが極端に遅くなり、資料のアップロードに1時間近くかかることもありました。ラウンジのWi-Fiも同じ状況でした。部屋の設備やスタッフの対応には満足しているので、回線の増強さえしていただければ、また長期で利用したいと思っています。",
  },
  {
    month: "2026-01",
    rating: 2,
    stay_type: "ビジネス",
    site: "Google",
    text: "予約時に伝えていた到着の遅れが共有されておらず、夜11時に到着したところ「本日はご予約がありません」と言われました。確認していただいた結果、予約は見つかりましたが、その間30分ほどロビーで待たされ、疲れていたこともありとても不安でした。翌朝支配人の方から直接お詫びがあり、その誠実な対応には感謝していますが、同じことが起きないようにしていただきたいです。",
  },
];

const TRICKY = [
  { month: "2025-12", rating: 4, stay_type: "一人旅", text: "部屋は正直古いです。でもフロントの方がとても親切で、それだけでまた来たいと思えました。" },
  { date: "2026-09-25", rating: 2, stay_type: "ビジネス", text: "素晴らしいWi-Fiでした。つながっている間は。" },
  { month: "2026-08", rating: 3, stay_type: "連泊", text: "Wi-Fiが遅くて仕事にならず困りましたが、ラウンジのコーヒーに救われました。" },
  { month: "2026-02", rating: 3, stay_type: "ビジネス", text: "朝食は普通。部屋も普通。可もなく不可もなく。" },
  { month: "2026-07", rating: 5, stay_type: "連泊", text: "Wi-Fiの調子が悪いと伝えたら、スタッフさんがすぐにルーターを交換してくれました。対応が早くて助かりました。" },
  { month: "2025-10", rating: 3, stay_type: "カップル", text: "星3つにしましたが、満足しています。星5は滅多につけない主義なので。" },
  { month: "2026-04", rating: 3, stay_type: "一人旅", text: "静かで良かったです（隣の部屋の人以外は）。" },
  { month: "2026-05", rating: 5, stay_type: "家族", text: "子どもが朝食のだし巻き卵を気に入って、家でも作ってとせがまれています笑" },
  { month: "2025-09", rating: 5, stay_type: "家族", text: "清掃の方が、子どもが置いていたおもちゃを並べ直してくれていて、ほっこりしました。" },
  { month: "2026-09", rating: 3, stay_type: "連泊", text: "ラウンジではWi-Fiがサクサクで快適…と思ったら、部屋に戻ると全然つながらない。" },
  { month: "2026-06", rating: 4, stay_type: "カップル", text: "駅から近くて便利でした。駐車場は少し狭いです。" },
  { month: "2026-01", rating: 4, stay_type: "一人旅", text: "コスパは最高。ただ、次は冬以外に来ます。" },
];

// ---- 組み立て ----
const reviews = [];

function randomDay(y, m) {
  const max = y === 2026 && m === 9 ? 26 : daysInMonth(y, m);
  return 1 + Math.floor(rand() * max);
}
function placeHandwritten(item, kind) {
  let date = item.date;
  if (!date) {
    const [y, m] = item.month.split("-").map(Number);
    date = fmt(y, m, randomDay(y, m));
  }
  reviews.push({
    date,
    site: item.site ?? weighted(SITES),
    rating: item.rating,
    text: item.text,
    stay_type: item.stay_type,
    kind,
  });
}

// 通常の口コミ：1か月あたり約19件
MONTHS.forEach(({ y, m }, i) => {
  const count = y === 2026 && m === 9 ? 16 : 17 + Math.floor(rand() * 5);
  for (let k = 0; k < count; k++) reviews.push(generateReview(i, y, m, randomDay(y, m)));
});

// 一言だけの好評口コミ：30件（「当日」にも1件置く）
placeHandwritten({ date: LAST_DAY, rating: 5, stay_type: "連泊", text: "大変親切な接客でした。" }, "one-liner");
for (let k = 0; k < 29; k++) {
  const { y, m } = pick(MONTHS);
  const text = pick(ONE_LINERS);
  placeHandwritten(
    { month: `${y}-${m}`, rating: chance(0.8) ? 5 : 4, stay_type: ONE_LINER_STAY[text] ?? weighted(STAY_TYPES), text },
    "one-liner",
  );
}
LONG_COMPLAINTS.forEach((c) => placeHandwritten(c, "long-complaint"));
TRICKY.forEach((t) => placeHandwritten(t, "tricky"));

reviews.sort((a, b) => a.date.localeCompare(b.date));

// ---- CSV書き出し（Excelで文字化けしないようBOM付きUTF-8） ----
const q = (v) => `"${String(v).replaceAll('"', '""')}"`;
function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => (typeof r[c] === "number" ? r[c] : q(r[c] ?? ""))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

mkdirSync("public/sample", { recursive: true });
writeFileSync(
  "public/sample/reviews_sample.csv",
  toCsv(reviews, ["date", "site", "rating", "text", "stay_type"]),
);

// ---- 精度測定用の50件 ----
// 手書きの難しい例を全部入れ、残りを通常の口コミから選ぶ
const special = reviews.filter((r) => r.kind === "long-complaint" || r.kind === "tricky");
const oneLiners = reviews.filter((r) => r.kind === "one-liner");
const generated = reviews.filter((r) => r.kind === "generated");
const seen = new Set();
const uniqueOneLiners = oneLiners.filter((r) => !seen.has(r.text) && seen.add(r.text)).slice(0, 8);
const shuffled = [...generated].sort(() => rand() - 0.5);
const eval50 = [...special, ...uniqueOneLiners, ...shuffled.slice(0, 50 - special.length - uniqueOneLiners.length)]
  .sort(() => rand() - 0.5)
  .map((r, i) => ({ id: `E${String(i + 1).padStart(2, "0")}`, ...r }));

const EVAL_PATH = "data/eval/reviews_eval50.csv";
if (existsSync(EVAL_PATH) && !process.argv.includes("--force")) {
  console.log(`${EVAL_PATH} はすでにあるため上書きしませんでした（作り直すときは --force）`);
  console.log(`サンプル：${reviews.length}件`);
  process.exit(0);
}
mkdirSync("data/eval", { recursive: true });
writeFileSync(
  EVAL_PATH,
  toCsv(eval50, [
    "id", "date", "site", "rating", "text", "stay_type",
    "label_room", "label_net", "label_service", "label_food",
  ]),
);

console.log(`サンプル：${reviews.length}件 / 精度測定用：${eval50.length}件`);
