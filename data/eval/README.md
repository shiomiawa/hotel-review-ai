# 分類精度の測定用データ（20件）

`reviews_eval20.csv` は、AIの4軸分類がどれくらい正しいかを測るための架空口コミ20件です。
判断が難しい例（皮肉・複数の軸が混ざったもの・4軸以外の話題など）12件を中心に、長文の苦情2件・一言の好評3件・通常の口コミ3件を入れています。
`scripts/generate-sample-data.mjs` で作り、サンプルCSV（`public/sample/reviews_sample.csv`）の中から選んでいます。

**正解ラベル（`label_` の4列）は、人が手作業で記入します。**
AIに正解を付けさせると「AIとAIの比較」になり、精度の測定にならないためです。

> 注意：`node scripts/generate-sample-data.mjs` を再実行しても、このファイルは上書きされません。
> `--force` を付けたときだけ作り直されます（記入済みのラベルは消えるので注意）。

## 記入する列

| 列 | 軸 |
|---|---|
| label_room | 客室設備（部屋の広さ・清潔さ・ベッド・空調・水回り・騒音・家電など） |
| label_net | 通信環境（Wi-Fi・有線LAN・回線速度など） |
| label_service | 接客・ホスピタリティ（フロント・清掃スタッフ・電話対応・予約の引き継ぎなど） |
| label_food | 朝食・ラウンジ（朝食の味・混雑・品切れ、ラウンジの飲み物・利用時間など） |

## 記入する値（4種類）

| 値 | 意味 | 例 |
|---|---|---|
| positive | その軸をほめている | 「Wi-Fiが速かった」→ label_net = positive |
| negative | その軸に不満がある | 「朝食会場が混んでいた」→ label_food = negative |
| neutral | 触れているが、良くも悪くもない | 「朝食は普通」→ label_food = neutral |
| none | その軸に触れていない | 空欄にせず none と書く |

## 迷いやすいケースの決め方

- **1件に複数の軸があるときは、それぞれの軸に付ける。** 「部屋は古いが接客は最高」→ room = negative、service = positive
- **原因と対応を分ける。** 「Wi-Fiの不調を伝えたらすぐルーターを交換してくれた」→ net = negative（不調があった）、service = positive（対応が良かった）
- **皮肉は本当の意味で判断する。** 「素晴らしいWi-Fiでした。つながっている間は。」→ net = negative
- **立地・駐車場・価格など、4軸以外の話題はどの軸にも付けない**（すべて none でよい）
- **「快適でした」「満足です」のように対象が分からない一言は、すべて none。** 「接客が素晴らしかった」のように対象が分かる場合だけ付ける
- **評価点（rating）は見ずに、本文だけで判断する**

迷ったケースは、判断の理由をメモしておくと、レポートで「AIと人の判断が分かれた例」として使えます。

## 精度を測る（ラベルを記入したあと）

```bash
npx tsx --env-file=.env.local scripts/eval-classification.ts
```

- `.env.local` の APIキーと `CLAUDE_MODEL_CLASSIFY` のモデルで、20件をAIに分類させ、記入した正解と比べます（Haiku 4.5 で約1円）
- 結果は `data/eval/results/eval-<モデル>-<日付>.md` に保存されます（一致率、軸ごとの「不満」の見つけやすさ・正しさ、人とAIの判定が分かれた例）
- ラベルが空欄の欄があると、どこが空欄かを表示して止まります
- `--mock` を付けると、AIを呼ばずにダミー分類で動作だけ確かめられます（費用0）

## APIコストを測る

```bash
npx tsx --env-file=.env.local scripts/measure-cost.ts
```

- サンプルデータの1か月分（今月＋前月）を実際に分類し、要約も1回作って、1件あたり・1施設1か月あたりの費用を試算します（約4円）
- 結果は `data/eval/results/cost-<モデル>-<日付>.md` に保存されます

## 返信下書きを Haiku 4.5 と Sonnet 5 で比べる

```bash
npx tsx --env-file=.env.local scripts/compare-replies.ts
```

- サンプルから10件（一言の好評・苦情・良い点と悪い点が混ざったもの）を選び、両方のモデルで下書きを作って並べます（約10円）
- 結果は `data/eval/results/replies-compare-<日付>.md`。どちらがよいかは人が読んで「評価」欄に記入します

## 返信作成時間を測る

`data/eval/reply-time.md` の手順で、10件の時間を計って記入します。
