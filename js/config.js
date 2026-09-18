/**
 * レーダーチャート＆データ分析アプリケーション 設定ファイル (config.js)
 * 
 * ラグジュアリー・ダークテーマ対応。
 * レーダーチャートの各項目、店舗名、カテゴリ分類、並び順、基準値などを定義。
 */

function deepFreeze(obj) {
  Object.keys(obj).forEach((prop) => {
    if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });
  return Object.freeze(obj);
}

window.RadarAppConfig = deepFreeze({
  // アプリケーション情報
  app: {
    title: "radar chart",
    subtitle: "",
    viewMode: "kanban",
    columnsCount: 4,
    theme: "luxury-dark"
  },

  // CSVデータ構造・列インデックス設定
  dataMapping: {
    headerRowIndex: 6,
    storeCodeColIndex: 0,
    storeNameColIndex: 1,
    metricColIndexes: {
      salesRatio: 5,       // 売上高 比較日比
      customerRatio: 11,   // 客数 比較日比
      itemHitRatio: 8,     // 打数 比較日比
      spendingRatio: 13,   // 客単価 比較日比
      unitPriceRatio: 15   // 一品単価 比較日比
    }
  },

  // レーダーチャートの項目定義（時計回り・右回りの順番）
  metrics: [
    {
      id: "salesRatio",
      key: "売上高比較日比",
      label: "売上高比較日比",
      shortLabel: "売上高",
      colIndex: 5,
      min: 0,
      max: 100,            // 端の最大値を100%に設定
      benchmark: 100.0,
      unit: "%",
      description: "前年同曜日比の売上高達成率"
    },
    {
      id: "customerRatio",
      key: "客数比較日比",
      label: "客数比較日比",
      shortLabel: "客数",
      colIndex: 11,
      min: 0,
      max: 100,
      benchmark: 100.0,
      unit: "%",
      description: "前年同曜日比の来店客数比"
    },
    {
      id: "itemHitRatio",
      key: "打数比較日比",
      label: "打数比較日比",
      shortLabel: "打数",
      colIndex: 8,
      min: 0,
      max: 100,
      benchmark: 100.0,
      unit: "%",
      description: "前年同曜日比のレジ打数比"
    },
    {
      id: "spendingRatio",
      key: "客単価比較日比",
      label: "客単価比較日比",
      shortLabel: "客単価",
      colIndex: 13,
      min: 0,
      max: 100,
      benchmark: 100.0,
      unit: "%",
      description: "前年同曜日比の客単価比"
    },
    {
      id: "unitPriceRatio",
      key: "一品単価比較日比",
      label: "一品単価比較日比",
      shortLabel: "一品単価",
      colIndex: 15,
      min: 0,
      max: 100,
      benchmark: 100.0,
      unit: "%",
      description: "前年同曜日比の一品単価比"
    }
  ],

  // 4列カンバンビューのカテゴリ＆店舗並び順 (全24店舗)
  // 明るく上品なマイルドカラーパレット（非ビビッド・柔らかなミルキートーン）
  categories: [
    {
      id: "total",
      name: "全店計",
      badgeColor: "#f1f5f9",    // プレミアムプラチナ
      badgeBg: "rgba(241, 245, 249, 0.16)",
      badgeBorder: "rgba(241, 245, 249, 0.4)",
      chartColor: {
        stroke: "#e2e8f0",
        fillStart: "rgba(241, 245, 249, 0.52)",
        fillEnd: "rgba(241, 245, 249, 0.12)",
        nodeColor: "#f8fafc",
        nodeGlow: "rgba(241, 245, 249, 0.55)"
      },
      stores: [
        { name: "全店計", alias: ["全店計", "合計", "全店"] }
      ]
    },
    {
      id: "large",
      name: "大型店",
      badgeColor: "#a5f3fc",    // 明るく澄んだアクアシアン（背景同化を完全防止）
      badgeBg: "rgba(103, 232, 249, 0.16)",
      badgeBorder: "rgba(103, 232, 249, 0.4)",
      chartColor: {
        stroke: "#67e8f9",     // パッと明るく背景に沈まないブライトアクア
        fillStart: "rgba(103, 232, 249, 0.52)",
        fillEnd: "rgba(165, 243, 252, 0.12)",
        nodeColor: "#cffafe",
        nodeGlow: "rgba(103, 232, 249, 0.55)"
      },
      stores: [
        { name: "王子店", alias: ["王子店"] },
        { name: "塚口店", alias: ["塚口店"] },
        { name: "夙川店", alias: ["夙川店"] },
        { name: "芦屋店", alias: ["芦屋店"] },
        { name: "箕面店", alias: ["箕面店"] }
      ]
    },
    {
      id: "medium_a",
      name: "中型店A",
      badgeColor: "#bbf7d0",    // 明るいマイルドミントグリーン
      badgeBg: "rgba(187, 247, 208, 0.14)",
      badgeBorder: "rgba(187, 247, 208, 0.35)",
      chartColor: {
        stroke: "#86efac",     // 爽やかで明るいソフトミント
        fillStart: "rgba(134, 239, 172, 0.48)",
        fillEnd: "rgba(187, 247, 208, 0.10)",
        nodeColor: "#bbf7d0",
        nodeGlow: "rgba(134, 239, 172, 0.45)"
      },
      stores: [
        { name: "門戸店", alias: ["門戸店"] },
        { name: "岡本店", alias: ["岡本店"] },
        { name: "甲子園店", alias: ["甲子園店"] },
        { name: "豊中店", alias: ["豊中店"] },
        { name: "常盤店", alias: ["常盤店"] },
        { name: "三宮店", alias: ["三宮店"] },
        { name: "伊丹店", alias: ["伊丹店"] }
      ]
    },
    {
      id: "medium_b",
      name: "中型店B",
      badgeColor: "#fef08a",    // 明るいマイルドシフォンイエロー
      badgeBg: "rgba(254, 240, 138, 0.14)",
      badgeBorder: "rgba(254, 240, 138, 0.35)",
      chartColor: {
        stroke: "#fde047",     // 明るく温かみのあるソフトゴールド
        fillStart: "rgba(253, 224, 71, 0.48)",
        fillEnd: "rgba(254, 240, 138, 0.10)",
        nodeColor: "#fef08a",
        nodeGlow: "rgba(253, 224, 71, 0.45)"
      },
      stores: [
        { name: "豊中緑丘店", alias: ["豊中緑丘店"] },
        { name: "御影店", alias: ["御影店"] },
        { name: "宝塚店", alias: ["宝塚店"] },
        { name: "高槻店", alias: ["高槻店"] },
        { name: "逆瀬川店", alias: ["逆瀬川店"] },
        { name: "有野店", alias: ["有野店"] }
      ]
    },
    {
      id: "station_cvs",
      name: "駅中・コンビニ",
      badgeColor: "#fed7aa",    // 明るいマイルドアプリコットオレンジ
      badgeBg: "rgba(254, 215, 170, 0.14)",
      badgeBorder: "rgba(254, 215, 170, 0.35)",
      chartColor: {
        stroke: "#fdba74",     // 優しいマイルドソフトオレンジ
        fillStart: "rgba(251, 146, 60, 0.48)",
        fillEnd: "rgba(254, 215, 170, 0.10)",
        nodeColor: "#fed7aa",
        nodeGlow: "rgba(251, 146, 60, 0.45)"
      },
      stores: [
        { name: "JR大阪店", alias: ["JR大阪店", "大阪店"] },
        { name: "なんば店", alias: ["なんば店", "南海なんば店"] },
        { name: "淀屋橋店", alias: ["淀屋橋店"] },
        { name: "六甲店", alias: ["六甲店"] },
        { name: "甲陽園店", alias: ["甲陽園店"] },
        { name: "摂津本山店", alias: ["摂津本山店"] }
      ]
    }
  ],

  // レーダーチャート描画デザイン設定（明るいマイルド＆適度な透過率）
  chartOptions: {
    size: 280,                // チャートサイズ (px)
    margin: 48,               // 外周余白 (px: 実績値・軸名とのクリアランス確保)
    scaleMin: 0,              // 最小値 (0%)
    scaleMax: 100,            // 端の値 (100%)
    scaleKneeValue: 90.0,     // 40%位置に設定する基準値 (90%)
    scaleKneeRatio: 0.40,     // 半径の40%位置
    showBenchmark: true,      // 100%基準線表示
    benchmarkVal: 100.0,      // 端の値と一致
    showBenchmarkLabel: false, // 100%基準線ラベル表示（不要）
    benchmarkColor: "rgba(253, 164, 175, 0.8)", // 明るく優しいソフトローズ
    benchmarkGlow: "rgba(253, 164, 175, 0.25)",
    fillOpacity: 0.32,        // ほどよく明るい透過率
    strokeWidth: 0.8,         // できる限り細く繊細な極細線（ヘアライン）
    showValuesOnNodes: true,  // ノード上のパーセント表示
    showOuterRing: true       // 最外周のラグジュアリーリング (100%ライン)
  }
});
