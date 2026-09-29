import { AXES, type AxisId, type Classification, type Sentiment } from "@/lib/analysis";

// AIにつなぐ前のダミー分類（USE_MOCK_AI=true のとき使う）。
// キーワードで大まかに判定するだけなので、皮肉や言い回しの違いは見抜けない。
// 画面の確認用で、分析の結論には使わない。

const AXIS_WORDS: Record<AxisId, RegExp> = {
  room: /部屋|客室|ベッド|浴室|シャワー|排水|エアコン|暖房|冷蔵庫|ドライヤー|掃除|清潔|収納|窓|結露|話し声|におい|乾燥|アメニティ|加湿|デスク|眺め|設備|寝心地|静か|眠れ|毛布/,
  net: /Wi-?Fi|wifi|回線|LAN|テザリング|オンライン会議|動画|ネット/i,
  service: /フロント|スタッフ|接客|案内|チェックイン|チェックアウト|予約|電話|説明|添乗員|対応|荷物|清掃の方|声をかけ|延泊|部屋割り|連絡/,
  food: /朝食|朝ごはん|ビュッフェ|だし巻き|ラウンジ|コーヒー|ビール|品切れ|食事|料理/,
};

const NEGATIVE =
  /悪|遅|弱|うるさ|聞こえ|気にな|困|不満|残念|待た|待ち時間|切れ|届きにくい|分かりにくい|わかりにくい|古い|汚|臭|寒|暑|品切れ|冷め|混雑|満席|入れな|つながらない|速度が出ない|不調|故障|行き違い|そっけな|苦労|早口|効かな|効きが|止まって|なかった|ない。|溜ま|たまっ|狭|閉まって|重なり/;
const POSITIVE =
  /良|よかった|よく|美味|おいし|快適|親切|丁寧|ていねい|助か|清潔|速く|速い|安定|嬉し|うれし|感激|好評|ぐっすり|満足|素晴らし|最高|気に入|スムーズ|癒|楽しみ|ほっと|はかど|安心|充実/;

// 文ごとに見て、その軸の言葉を含む文の良し悪しで判定する（不満の表現を優先）
function judge(sentences: string[], words: RegExp): Sentiment {
  const hits = sentences.filter((s) => words.test(s));
  if (hits.length === 0) return "none";
  if (hits.some((s) => NEGATIVE.test(s))) return "negative";
  if (hits.some((s) => POSITIVE.test(s))) return "positive";
  return "neutral";
}

export function mockClassify(items: { id: string; text: string }[]): Classification[] {
  return items.map(({ id, text }) => {
    const sentences = text.split(/[。！!？?\n]/).filter(Boolean);
    const result = { id } as Classification;
    for (const { id: axis } of AXES) result[axis] = judge(sentences, AXIS_WORDS[axis]);
    return result;
  });
}
