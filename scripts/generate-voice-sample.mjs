// 架空の「現場の声」サンプルデータを作るスクリプト（実在のお客様の声は使わない）
// 実行：node scripts/generate-voice-sample.mjs
// 乱数の種を固定しているので、何度実行しても同じデータができる
//
// 出力：public/sample/voices_sample.csv（2025-09〜2026-09-26、約120件）
// 氏名・電話番号・部屋番号は含めない

import { mkdirSync, writeFileSync } from "node:fs";

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260927);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
function weighted(list) {
  let r = rand();
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1][0];
}

const LAST_DAY = "2026-09-26";
const MONTHS = [];
for (let i = 0; i < 13; i++) {
  const d = new Date(Date.UTC(2025, 8 + i, 1));
  MONTHS.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, index: i });
}
const fmt = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y, m) => (y === 2026 && m === 9 ? 26 : new Date(Date.UTC(y, m, 0)).getUTCDate());
const summer = (m) => [6, 7, 8, 9].includes(m);
const winter = (m) => [12, 1, 2].includes(m);

// ---- 経路ごとの声（スタッフが要約して記録した書き方） ----
// axis：分析で見つけてほしい軸（none は4軸のどれにも当たらない話題）
// when：その条件の月だけ使う
const VOICES = {
  アンケート: [
    { axis: "food", neg: false, text: "朝食の地元野菜のビュッフェがおいしかった。だし巻き卵が特に好評。" },
    { axis: "food", neg: false, text: "ラウンジのコーヒーが無料でうれしい。夕方にゆっくりできた。" },
    { axis: "food", neg: true, text: "朝食の時間が9時半までだと早い。10時までにしてほしい。" },
    { axis: "service", neg: false, text: "フロントの方の笑顔と周辺のおすすめ案内がよかった。" },
    { axis: "service", neg: false, text: "チェックアウト後の荷物預かりが助かった。" },
    { axis: "service", neg: true, text: "チェックインの説明が早口で分かりにくかった。" },
    { axis: "room", neg: false, text: "ベッドが快適でよく眠れた。部屋も清潔だった。" },
    { axis: "room", neg: true, text: "浴室の排水が遅く、シャワー中に水がたまった。" },
    { axis: "room", neg: true, text: "隣の部屋の話し声が聞こえて気になった。" },
    { axis: "room", neg: true, text: "エアコンの効きが弱く、夜暑かった。", when: summer },
    { axis: "room", neg: true, text: "部屋が乾燥していて、のどが痛くなった。", when: winter },
    { axis: "net", neg: false, text: "Wi-Fiが速く、動画も問題なく見られた。" },
    { axis: "net", neg: true, text: "Wi-Fiが夜になると遅くなった。" },
    { axis: "none", neg: true, text: "駐車場の入口が分かりにくかった。" },
  ],
  フロント: [
    { axis: "net", neg: true, text: "Wi-Fiにつながらないとのご相談。接続手順を案内したが、夜は速度が出ないとのこと。" },
    { axis: "net", neg: true, text: "オンライン会議の途中でWi-Fiが切れたとのご指摘。" },
    { axis: "net", neg: true, text: "部屋の奥ではWi-Fiが弱いとのお申し出。" },
    { axis: "room", neg: true, text: "エアコンが効かないとのお申し出。設備担当が確認。", when: summer },
    { axis: "room", neg: true, text: "暖房が弱く寒いとのお申し出。毛布を追加でお渡し。", when: winter },
    { axis: "room", neg: true, text: "冷蔵庫の音がうるさいとのご指摘。" },
    { axis: "room", neg: true, text: "ドライヤーの風が弱いとのご指摘。" },
    { axis: "service", neg: false, text: "昨日の案内がとても分かりやすかったと、わざわざお礼を言いに来られた。" },
    { axis: "service", neg: true, text: "チェックインの待ち時間が長いとのご不満。" },
    { axis: "food", neg: true, text: "朝食会場が満席で入れなかったとのご不満。" },
    { axis: "food", neg: false, text: "朝食のだし巻き卵の作り方を聞かれた。とても気に入ったとのこと。" },
    { axis: "none", neg: false, text: "近くのおすすめの飲食店を聞かれ、案内した。" },
  ],
  "電話・メール": [
    { axis: "service", neg: true, text: "予約時に伝えた到着時刻が共有されておらず、確認に時間がかかったとのご意見（メール）。" },
    { axis: "service", neg: true, text: "電話がなかなかつながらなかったとのご指摘。" },
    { axis: "service", neg: false, text: "滞在中のスタッフの対応がよかったというお礼のメール。" },
    { axis: "room", neg: true, text: "部屋のにおいが気になったとのご意見（メール）。" },
    { axis: "food", neg: true, text: "朝食の品切れが多かったとのご意見（メール）。" },
    { axis: "net", neg: true, text: "宿泊中にWi-Fiが何度も切れて仕事にならなかったとのご意見（メール）。" },
    { axis: "none", neg: false, text: "忘れ物の問い合わせ。保管していたため着払いで発送。" },
    { axis: "none", neg: false, text: "領収書の宛名変更の依頼。" },
  ],
  "旅行会社・団体": [
    { axis: "food", neg: true, text: "団体の朝食時間が一般のお客様と重なり、会場が混雑したと添乗員さんからご指摘。" },
    { axis: "food", neg: false, text: "団体向けの朝食の準備がスムーズだったと旅行会社から好評。" },
    { axis: "service", neg: true, text: "団体のチェックインに時間がかかったと旅行会社からご指摘。" },
    { axis: "service", neg: true, text: "部屋割りの連絡に行き違いがあったと旅行会社からご指摘。" },
    { axis: "service", neg: false, text: "添乗員さんへの事前連絡がていねいだったと好評。" },
    { axis: "room", neg: true, text: "団体の一部の部屋でエアコンの不調があったとのご報告。", when: summer },
    { axis: "net", neg: true, text: "ロビーでのWi-Fiが混み合って遅いと添乗員さんからご指摘。" },
    { axis: "none", neg: true, text: "大型バスの乗降場所が分かりにくかったとのご意見。" },
  ],
};

// 経路ごとの件数の比率と、お客様の区分・評価の付き方
const CHANNEL_WEIGHTS = [
  ["アンケート", 0.35],
  ["フロント", 0.3],
  ["電話・メール", 0.18],
  ["旅行会社・団体", 0.17],
];
const CUSTOMER_BY_CHANNEL = {
  アンケート: [["個人・カップル", 0.35], ["家族", 0.3], ["ビジネス", 0.2], ["訪日外国人", 0.1], ["その他", 0.05]],
  フロント: [["ビジネス", 0.35], ["個人・カップル", 0.25], ["家族", 0.2], ["訪日外国人", 0.15], ["その他", 0.05]],
  "電話・メール": [["個人・カップル", 0.35], ["ビジネス", 0.3], ["家族", 0.25], ["その他", 0.1]],
  "旅行会社・団体": [["団体", 0.9], ["訪日外国人", 0.1]],
};
const RATING_CHANCE = { アンケート: 0.85, フロント: 0.1, "電話・メール": 0.2, "旅行会社・団体": 0.1 };

// 対応内容（完了・対応中のもの）
const ACTIONS = {
  room: ["設備担当が点検し、部品を交換した。", "客室の点検項目に追加した。", "該当設備の修理を手配中。"],
  net: ["ルーターの再起動と設定の見直しを行った。", "回線業者に速度の調査を依頼した。", "Wi-Fiの中継機の増設を検討中。"],
  service: ["朝礼で共有し、案内の手順を見直した。", "予約情報の引き継ぎ方法を見直した。", "担当者から直接お詫びの連絡をした。"],
  food: ["朝食の補充のタイミングを見直した。", "団体の朝食時間を分ける運用にした。", "朝食の時間延長を検討中。"],
  none: ["対応済み。", "案内表示を追加した。"],
  thanks: ["スタッフ全員に共有した。"],
};

function voiceFor(channel, y, m, index) {
  let pool = VOICES[channel].filter((v) => !v.when || v.when(m));
  // フロントのWi-Fiの不満は2026年夏から増える（ネットの口コミと同じ傾向）
  if (channel === "フロント") {
    if (index >= 9 && chance(0.7)) pool = pool.filter((v) => v.axis === "net");
    else if (index < 9 && chance(0.7)) pool = pool.filter((v) => v.axis !== "net");
  }
  return pick(pool);
}

const rows = [];
for (const { y, m, index } of MONTHS) {
  const count = y === 2026 && m === 9 ? 9 : 8 + Math.floor(rand() * 4);
  for (let k = 0; k < count; k++) {
    const channel = weighted(CHANNEL_WEIGHTS);
    const day = 1 + Math.floor(rand() * daysInMonth(y, m));
    rows.push({ date: fmt(y, m, day), channel, y, m, index });
  }
}
// 「当日」にも現場の声を置く（日次メールの確認用）
rows.push({ date: LAST_DAY, channel: "フロント", y: 2026, m: 9, index: 12 });
rows.push({ date: LAST_DAY, channel: "アンケート", y: 2026, m: 9, index: 12 });

const voices = rows
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((r) => {
    const v = voiceFor(r.channel, r.y, r.m, r.index);
    const rating = chance(RATING_CHANCE[r.channel])
      ? v.neg
        ? 1 + Math.floor(rand() * 3)
        : 4 + Math.floor(rand() * 2)
      : "";
    // 2週間より前の声はほぼ完了。最近の声は未対応・対応中が残り、当日の声はまだ完了していない
    const status =
      r.date === LAST_DAY
        ? weighted([["未対応", 0.7], ["対応中", 0.3]])
        : r.date >= "2026-09-12"
          ? weighted([["未対応", 0.45], ["対応中", 0.3], ["完了", 0.25]])
          : chance(0.92)
            ? "完了"
            : "対応中";
    const action =
      status === "未対応" ? "" : !v.neg ? pick(ACTIONS.thanks) : pick(ACTIONS[v.axis]);
    return {
      received_date: r.date,
      channel: r.channel,
      customer_type: weighted(CUSTOMER_BY_CHANNEL[r.channel]),
      content: v.text,
      rating,
      status,
      action,
    };
  });

const COLUMNS = ["received_date", "channel", "customer_type", "content", "rating", "status", "action"];
const q = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csv = "﻿" + [COLUMNS.join(","), ...voices.map((v) => COLUMNS.map((c) => q(v[c])).join(","))].join("\r\n") + "\r\n";

mkdirSync("public/sample", { recursive: true });
writeFileSync("public/sample/voices_sample.csv", csv);
console.log(`現場の声：${voices.length}件`);
