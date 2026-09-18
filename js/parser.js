/**
 * 安全なCSVパーサーおよび構造化ロジック (parser.js)
 * 
 * 外部ライブラリ不使用、純粋なJavaScriptによるRFC 4180準拠パーサー。
 * 危険API（eval, new Function, innerHTML等）を一切排除し、厳格なバリデーションを実施。
 */

(function (root) {
  'use strict';

  const MAX_FILE_SIZE_CHARS = 3 * 1024 * 1024; // 最大3MB相当
  const MAX_ROWS = 3000;
  const MAX_COLS = 50;

  /**
   * 安全な文字列サニタイズ
   * @param {string} text 
   * @returns {string}
   */
  function sanitizeCell(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  /**
   * パーセント値・数値文字列のパース（例: "99.2%" -> 99.20, "1,246" -> 1246）
   * @param {string} valStr 
   * @returns {number}
   */
  function parsePercentageOrNumber(valStr) {
    if (!valStr || typeof valStr !== 'string') return 0;
    const clean = valStr.replace(/%/g, '').replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
  }

  /**
   * RFC 4180準拠のCSVテキスト解析
   * @param {string} rawCsvText 
   * @returns {Array<Array<string>>}
   */
  function parseCsvToMatrix(rawCsvText) {
    if (!rawCsvText || typeof rawCsvText !== 'string') {
      throw new Error('CSVテキストが空または不正です。');
    }

    if (rawCsvText.length > MAX_FILE_SIZE_CHARS) {
      throw new Error('CSVファイルサイズが上限を超過しています。');
    }

    // UTF-8 BOMの除去
    let cleanText = rawCsvText;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.slice(1);
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;
    const len = cleanText.length;

    for (let i = 0; i < len; i++) {
      const char = cleanText[i];
      const nextChar = i + 1 < len ? cleanText[i + 1] : '';

      if (insideQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentCell += '"';
            i++;
          } else {
            insideQuotes = false;
          }
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === ',') {
          currentRow.push(sanitizeCell(currentCell));
          currentCell = '';
          if (currentRow.length > MAX_COLS) {
            throw new Error(`列数が上限(${MAX_COLS})を超過しました。`);
          }
        } else if (char === '\r') {
          if (nextChar === '\n') i++;
          currentRow.push(sanitizeCell(currentCell));
          currentCell = '';
          if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
          currentRow = [];
          if (rows.length > MAX_ROWS) throw new Error(`行数が上限(${MAX_ROWS})を超過しました。`);
        } else if (char === '\n') {
          currentRow.push(sanitizeCell(currentCell));
          currentCell = '';
          if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
          currentRow = [];
          if (rows.length > MAX_ROWS) throw new Error(`行数が上限(${MAX_ROWS})を超過しました。`);
        } else {
          currentCell += char;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(sanitizeCell(currentCell));
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
    }

    return rows;
  }

  /**
   * 店舗別売上CSVを行単位で解析し、全店舗のMapを生成
   * @param {Array<Array<string>>} matrix 
   * @param {Object} config 
   * @returns {Map<string, Object>}
   */
  function extractStoreRecords(matrix, config) {
    const storeMap = new Map();
    const metrics = config.metrics || [];

    // 行を走査して店舗データを抽出
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length < 5) continue;

      // 店コード・店名列の抽出
      // 例: '00013, 芦屋店
      let storeCode = sanitizeCell(row[0] || '').replace(/^'/, '');
      let rawStoreName = sanitizeCell(row[1] || '');

      // 合計行や空行はスキップ
      if (!rawStoreName || (rawStoreName.includes('計') && !rawStoreName.includes('全店') && !rawStoreName.includes('合計')) || rawStoreName.includes('店コード/店名')) {
        continue;
      }

      const storeRecord = {
        code: storeCode,
        rawName: rawStoreName,
        metrics: {},
        rawRow: row
      };

      // 指標データの抽出（時計回りの5項目）
      metrics.forEach((m) => {
        const colIdx = m.colIndex;
        const rawCell = (colIdx !== undefined && colIdx < row.length) ? row[colIdx] : '';
        const parsedVal = parsePercentageOrNumber(rawCell);
        storeRecord.metrics[m.key] = parsedVal;
        storeRecord.metrics[m.id] = parsedVal;
      });

      storeMap.set(rawStoreName, storeRecord);
    }

    return storeMap;
  }

  /**
   * カンバン形式（4列）および指定の店舗順序に完全整合させてデータを整理
   * @param {Map<string, Object>} storeMap 
   * @param {Object} config 
   * @returns {Array<Object>} カテゴリ別の構造化データ配列
   */
  function buildKanbanData(storeMap, config) {
    const categories = config.categories || [];
    const metrics = config.metrics || [];

    return categories.map((category) => {
      const storeList = [];

      category.stores.forEach((targetStore) => {
        const displayName = targetStore.name;
        const aliases = targetStore.alias || [displayName];

        // エイリアスまたは表示名でCSVレコードを検索
        let matchedRecord = null;
        for (const alias of aliases) {
          if (storeMap.has(alias)) {
            matchedRecord = storeMap.get(alias);
            break;
          }
        }

        // 部分一致フォールバック
        if (!matchedRecord) {
          for (const [csvName, record] of storeMap.entries()) {
            if (aliases.some(a => csvName.includes(a) || a.includes(csvName))) {
              matchedRecord = record;
              break;
            }
          }
        }

        if (matchedRecord) {
          storeList.push({
            storeName: displayName,
            csvName: matchedRecord.rawName,
            code: matchedRecord.code,
            metrics: matchedRecord.metrics,
            categoryId: category.id,
            categoryName: category.name
          });
        } else {
          // CSVにデータが存在しない場合の安全なダミーレコード（全指標0）
          const fallbackMetrics = {};
          metrics.forEach(m => {
            fallbackMetrics[m.key] = 0;
            fallbackMetrics[m.id] = 0;
          });
          storeList.push({
            storeName: displayName,
            csvName: displayName,
            code: '',
            metrics: fallbackMetrics,
            categoryId: category.id,
            categoryName: category.name,
            isMissing: true
          });
        }
      });

      return {
        id: category.id,
        name: category.name,
        badgeColor: category.badgeColor,
        badgeBg: category.badgeBg,
        badgeBorder: category.badgeBorder,
        chartColor: category.chartColor,
        stores: storeList
      };
    });
  }

  /**
   * 全店計専用のデータ構造を構築する
   * CSV内に「全店計」「合計」「全店」があれば抽出し、なければ全店舗平均から算出する
   */
  function buildTotalStoreData(storeMap, config) {
    const metrics = config.metrics || [];
    const aliases = ["全店計", "合計", "全店"];
    let matchedRecord = null;
    
    // エイリアスで検索
    for (const alias of aliases) {
      if (storeMap.has(alias)) {
        matchedRecord = storeMap.get(alias);
        break;
      }
    }
    if (!matchedRecord) {
      for (const [csvName, record] of storeMap.entries()) {
        if (aliases.some(a => csvName.includes(a) || a.includes(csvName))) {
          matchedRecord = record;
          break;
        }
      }
    }

    let resultMetrics = {};
    if (matchedRecord) {
      resultMetrics = matchedRecord.metrics;
    } else {
      // 平均値の自動算出
      if (storeMap.size > 0) {
        const allStores = Array.from(storeMap.values());
        metrics.forEach(m => {
          let sum = 0;
          let count = 0;
          allStores.forEach(s => {
            const val = s.metrics[m.id];
            if (typeof val === 'number' && !isNaN(val)) {
              sum += val;
              count++;
            }
          });
          const avg = count > 0 ? (sum / count) : 0;
          const roundedAvg = Math.round(avg * 10) / 10;
          resultMetrics[m.key] = roundedAvg;
          resultMetrics[m.id] = roundedAvg;
        });
      } else {
        metrics.forEach(m => {
          resultMetrics[m.key] = 0;
          resultMetrics[m.id] = 0;
        });
      }
    }

    return {
      storeName: "全店計",
      csvName: matchedRecord ? matchedRecord.rawName : "自動算出",
      code: matchedRecord ? matchedRecord.code : "",
      metrics: resultMetrics,
      categoryId: "total",
      categoryName: "全店計"
    };
  }

  // グローバル公開
  root.SafeCsvParser = Object.freeze({
    parse: parseCsvToMatrix,
    extractStores: extractStoreRecords,
    buildKanban: buildKanbanData,
    buildTotalStore: buildTotalStoreData
  });

})(typeof window !== 'undefined' ? window : this);
