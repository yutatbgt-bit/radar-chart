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
   * @param {*} val 
   * @returns {string}
   */
  function sanitizeCell(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val).trim();
    }
    if (typeof val !== 'string') return '';
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  /**
   * パーセント値・数値文字列のパース（例: "99.2%" -> 99.20, "1,246" -> 1246, 1246000 -> 1246000）
   * @param {*} val 
   * @returns {number}
   */
  function parsePercentageOrNumber(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
    }
    const clean = String(val).replace(/[%％,¥\s]/g, '').trim();
    const num = parseFloat(clean);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
  }

  /**
   * 指標（比較日比・ロス率）のパースと正規化
   * Excelでパーセント書式セルが値のみ(raw: true)で読み込まれた場合（例: 0.992）、
   * 0 < val <= 2.5 の小数を比率として 99.20% に正規化する。
   * 文字列 "99.2%" や数値 99.2 の場合はそのまま 99.20 とする。
   * @param {*} val 
   * @returns {number}
   */
  function parseMetricRatio(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return 0;
      if (val > 0 && val <= 2.5) {
        return Math.round(val * 10000) / 100;
      }
      return Math.round(val * 100) / 100;
    }
    const str = String(val).trim();
    if (!str || str === '-') return 0;
    const hasPercent = str.includes('%') || str.includes('％');
    const clean = str.replace(/[%％,¥\s]/g, '').trim();
    const num = parseFloat(clean);
    if (!Number.isFinite(num)) return 0;
    if (hasPercent) {
      return Math.round(num * 100) / 100;
    }
    if (num > 0 && num <= 2.5) {
      return Math.round(num * 10000) / 100;
    }
    return Math.round(num * 100) / 100;
  }

  /**
   * CSVバッファ（ArrayBuffer）をUTF-8またはShift-JISで安全に文字列デコード
   * @param {ArrayBuffer} buffer 
   * @returns {string}
   */
  function decodeCsvBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM (EF BB BF) チェック
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      const utf8Decoder = new TextDecoder('utf-8');
      return utf8Decoder.decode(bytes.subarray(3));
    }

    try {
      // 厳格なUTF-8デコード試行（不正バイトがあればエラー）
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
      return utf8Decoder.decode(bytes);
    } catch (e) {
      // Shift-JIS (cp932) デコード
      try {
        const sjisDecoder = new TextDecoder('shift-jis');
        return sjisDecoder.decode(bytes);
      } catch (e2) {
        const fallback = new TextDecoder('utf-8');
        return fallback.decode(bytes);
      }
    }
  }

  /**
   * Excelファイル (ArrayBuffer) を2次元配列マトリックスに変換
   * 【読み込みは値のみ】
   * 数式(cellFormula: false)、装飾HTML(cellHTML: false)、書式テキスト(cellText: false)を無効化し、
   * セルの生値(.v / raw: true)のみを取得する。
   * @param {ArrayBuffer} arrayBuffer 
   * @returns {Array<Array<any>>}
   */
  function parseExcelToMatrix(arrayBuffer) {
    if (!root.XLSX) {
      throw new Error('Excel読み込みライブラリ(SheetJS)が読み込まれていません。');
    }
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer || arrayBuffer.byteLength !== undefined)) {
      throw new Error('Excelデータが空または不正です。');
    }

    // 値のみ（キャッシュされた計算結果値）を抽出
    const workbook = root.XLSX.read(arrayBuffer, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellText: false,
      raw: true
    });

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excelファイル内に有効なシートが存在しません。');
    }

    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    if (!firstSheet) {
      throw new Error('ワークシートの読み込みに失敗しました。');
    }

    // header: 1 で2次元配列形式で取得、raw: true で値のみ抽出
    const rawMatrix = root.XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      raw: true,
      defval: ''
    });

    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('Excelシート内にデータが存在しません。');
    }

    const sanitizedMatrix = [];
    const maxRows = Math.min(rawMatrix.length, MAX_ROWS);

    for (let r = 0; r < maxRows; r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row)) continue;
      const sanitizedRow = [];
      const maxCols = Math.min(row.length, MAX_COLS);
      for (let c = 0; c < maxCols; c++) {
        const cell = row[c];
        if (cell === null || cell === undefined) {
          sanitizedRow.push('');
        } else if (typeof cell === 'string') {
          sanitizedRow.push(sanitizeCell(cell));
        } else if (typeof cell === 'number' || typeof cell === 'boolean') {
          sanitizedRow.push(cell);
        } else {
          sanitizedRow.push(sanitizeCell(String(cell)));
        }
      }
      if (sanitizedRow.some(val => val !== '' && val !== null && val !== undefined)) {
        sanitizedMatrix.push(sanitizedRow);
      }
    }

    return sanitizedMatrix;
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

      // 空行またはヘッダー行のみスキップ。「計」の行はすべて取り込む
      if (!rawStoreName || rawStoreName.includes('店コード/店名')) {
        continue;
      }

      const dailySalesCol = (config.dataMapping && config.dataMapping.dailySalesColIndex !== undefined)
        ? config.dataMapping.dailySalesColIndex
        : 2;
      const rawDailySales = (dailySalesCol < row.length) ? row[dailySalesCol] : '';
      const parsedDailySales = parsePercentageOrNumber(rawDailySales);

      const storeRecord = {
        code: storeCode,
        rawName: rawStoreName,
        dailySales: parsedDailySales,
        rawDailySales: rawDailySales,
        metrics: {},
        rawRow: row
      };

      // 指標データの抽出（時計回りの5項目＋ロス率）
      metrics.forEach((m) => {
        const colIdx = m.colIndex;
        const rawCell = (colIdx !== undefined && colIdx < row.length) ? row[colIdx] : '';
        const parsedVal = parseMetricRatio(rawCell);
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
            dailySales: matchedRecord.dailySales !== undefined ? matchedRecord.dailySales : null,
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
            dailySales: null,
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
  function buildTotalStoreData(storeMap, config, matrix) {
    const metrics = config.metrics || [];
    // CSV上での「全店計」に該当しそうな名前の候補
    const aliases = ["全店計", "全店", "合計", "総合計", "総計", "全体", "計"];
    let matchedRecord = null;

    // エイリアスでの完全一致検索
    for (const alias of aliases) {
      if (storeMap.has(alias)) {
        matchedRecord = storeMap.get(alias);
        break;
      }
    }
    // 見つからなければ部分一致検索
    if (!matchedRecord) {
      for (const [csvName, record] of storeMap.entries()) {
        if (aliases.some(a => csvName.includes(a))) {
          matchedRecord = record;
          break;
        }
      }
    }

    // それでも見つからなければ、強制的に8行目（インデックス7）を全店計として抽出する
    if (!matchedRecord && matrix && matrix.length > 7) {
      const row = matrix[7];
      if (row && row.length >= 5) {
        const dailySalesCol = (config && config.dataMapping && config.dataMapping.dailySalesColIndex !== undefined) ? config.dataMapping.dailySalesColIndex : 2;
        const rawDailySales = (dailySalesCol < row.length) ? row[dailySalesCol] : '';
        matchedRecord = {
          code: sanitizeCell(row[0] || '').replace(/^'/, ''),
          rawName: sanitizeCell(row[1] || '全店計(強制抽出)'),
          dailySales: parsePercentageOrNumber(rawDailySales),
          metrics: {},
          rawRow: row
        };
        metrics.forEach((m) => {
          const colIdx = m.colIndex;
          const rawCell = (colIdx !== undefined && colIdx < row.length) ? row[colIdx] : '';
          matchedRecord.metrics[m.key] = parseMetricRatio(rawCell);
          matchedRecord.metrics[m.id] = parseMetricRatio(rawCell);
        });
      }
    }

    let resultMetrics = {};
    if (matchedRecord) {
      resultMetrics = matchedRecord.metrics;
    } else {
      metrics.forEach(m => {
        resultMetrics[m.key] = 0;
        resultMetrics[m.id] = 0;
      });
    }

    return {
      storeName: "全店計",
      csvName: matchedRecord ? matchedRecord.rawName : "未検出",
      code: matchedRecord ? matchedRecord.code : "",
      dailySales: matchedRecord && matchedRecord.dailySales !== undefined ? matchedRecord.dailySales : null,
      metrics: resultMetrics,
      categoryId: "total",
      categoryName: "全店計"
    };
  }

  /**
   * 有限数値のみを対象に算術平均を返す（対象0件なら null）
   * @param {Array<*>} values
   * @returns {number|null}
   */
  function averageOfFiniteNumbers(values) {
    // 数値が有限であり、かつ 0 ではないもの（nullや0を除外）を有効値とする
    const finiteValues = values.filter(v => typeof v === 'number' && Number.isFinite(v) && v !== 0);
    if (finiteValues.length === 0) return null;
    return finiteValues.reduce((acc, v) => acc + v, 0) / finiteValues.length;
  }

  /**
   * カテゴリ（大型店・中型店A 等）単位の「店舗計」レコードを構築する。
   *
   * 比較日比・ロス率は比率指標であり、CSVには分母（比較日の売上・客数等）が含まれないため
   * 加重平均での再計算はできない。列下部の一覧表「店舗計」行と数値を一致させる目的で、
   * CSVに実在する店舗（クリア・欠損を除く）の単純平均を採用する。
   *
   * @param {Object} category buildKanbanData() が返すカテゴリ（stores配列を含む）
   * @param {Object} config アプリ設定
   * @returns {Object} StoreRadarChart / StoreMetricsTable にそのまま渡せる店舗互換レコード
   */
  function buildCategoryTotalData(category, config) {
    const metrics = (config && config.metrics) || [];
    const stores = (category && Array.isArray(category.stores)) ? category.stores : [];
    const validStores = stores.filter(s => s && s.metrics && !s.isCleared && !s.isMissing);

    const resultMetrics = {};
    metrics.forEach((m) => {
      // 淀屋橋店のような特定の店舗名ではなく、全項目において値が0またはnullのものを平均算出から除外する
      const avg = averageOfFiniteNumbers(validStores.map(s =>
        (s.metrics[m.key] !== undefined ? s.metrics[m.key] : s.metrics[m.id])
      ));
      resultMetrics[m.key] = avg;
      resultMetrics[m.id] = avg;
    });

    const dailySalesValues = validStores
      .map(s => s.dailySales)
      .filter(v => typeof v === 'number' && Number.isFinite(v) && v !== 0);
    const categoryName = (category && typeof category.name === 'string') ? category.name : '';
    const displayName = `${categoryName} 計`;

    return {
      storeName: displayName,
      csvName: displayName,
      code: '',
      dailySales: dailySalesValues.length > 0 ? dailySalesValues.reduce((acc, v) => acc + v, 0) : null,
      metrics: resultMetrics,
      categoryId: category ? category.id : '',
      categoryName: categoryName,
      storeCount: validStores.length,
      // 描画側でロス率予算・目盛りを全店計基準に切り替えるための識別フラグ
      isCategoryTotal: true,
      isCleared: validStores.length === 0
    };
  }

  /**
   * FileオブジェクトまたはArrayBufferからマトリックスを生成する非同期パース関数
   * CSVおよびExcel(.xlsx, .xls)の両方に対応し、値のみを抽出する
   * @param {File|Blob|ArrayBuffer|string} fileOrBuffer 
   * @param {string} fileName 
   * @returns {Promise<Array<Array<any>>>}
   */
  function parseDataFile(fileOrBuffer, fileName = '') {
    return new Promise((resolve, reject) => {
      try {
        const name = (fileOrBuffer && fileOrBuffer.name) ? fileOrBuffer.name : fileName;
        const lowerName = (name || '').toLowerCase();
        const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm');

        if (fileOrBuffer instanceof ArrayBuffer) {
          if (isExcel) {
            resolve(parseExcelToMatrix(fileOrBuffer));
          } else {
            const text = decodeCsvBuffer(fileOrBuffer);
            resolve(parseCsvToMatrix(text));
          }
          return;
        }

        if (fileOrBuffer instanceof Blob || (typeof File !== 'undefined' && fileOrBuffer instanceof File)) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const buffer = e.target.result;
              if (isExcel) {
                resolve(parseExcelToMatrix(buffer));
              } else {
                const text = decodeCsvBuffer(buffer);
                resolve(parseCsvToMatrix(text));
              }
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => {
            reject(new Error('ファイルの読み込みに失敗しました。'));
          };
          reader.readAsArrayBuffer(fileOrBuffer);
          return;
        }

        if (typeof fileOrBuffer === 'string') {
          resolve(parseCsvToMatrix(fileOrBuffer));
          return;
        }

        reject(new Error('サポートされていないファイル形式または入力です。'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * マトリックスおよびファイル名から対象期間ラベルと店舗名ラベルを安全に抽出
   * @param {Array<Array<any>>} matrix
   * @param {string} fileName
   * @returns {{ periodLabel: string, storeName: string, fileName: string }}
   */
  function extractFileMetadata(matrix, fileName = '') {
    const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

    function toHalfWidth(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .slice(0, 300)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .trim();
    }

    function formatDateWithDow(y, m, d) {
      const year = Number(y);
      const month = Number(m);
      const day = Number(d);
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day);
        const dow = !isNaN(dt.getTime()) ? `(${DAYS_JP[dt.getDay()]})` : '';
        return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}${dow}`;
      }
      return '';
    }

    function normalizeDateToken(raw) {
      if (raw === null || raw === undefined || raw === '') return '';
      if (typeof raw === 'number' && raw > 25000 && raw < 70000) {
        const utcDays = Math.floor(raw - 25569);
        const dt = new Date(utcDays * 86400 * 1000);
        return formatDateWithDow(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      }
      const s = toHalfWidth(raw);
      const mYmd = s.match(/(20\d{2})[年\/\-.]\s*(\d{1,2})[月\/\-.]\s*(\d{1,2})日?(?:\(([日月火水木金土])\))?/);
      if (mYmd) {
        if (mYmd[4]) {
          return `${mYmd[1]}/${String(mYmd[2]).padStart(2, '0')}/${String(mYmd[3]).padStart(2, '0')}(${mYmd[4]})`;
        }
        return formatDateWithDow(mYmd[1], mYmd[2], mYmd[3]);
      }
      return s;
    }

    let periodLabel = '';
    let storeName = '';
    let startDate = '';
    let endDate = '';
    let hasMultipleStoresOrTotal = false;

    if (Array.isArray(matrix)) {
      const maxScan = Math.min(matrix.length, 12);
      for (let r = 0; r < maxScan; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;

        let storeHeaderHits = 0;
        const maxCols = Math.min(row.length, 60);
        for (let c = 0; c < maxCols; c++) {
          const rawCell = row[c];
          if (rawCell === null || rawCell === undefined || rawCell === '') continue;
          const cellStr = toHalfWidth(rawCell);
          if (!cellStr) continue;

          if (cellStr === '全店計' || cellStr === '全店合計' || cellStr === '全店舗') {
            hasMultipleStoresOrTotal = true;
          }
          if (/^\d{2,4}\s*[^\d\s]+/.test(cellStr)) {
            storeHeaderHits++;
          }

          if (cellStr.includes('対象期間開始日')) {
            const parts = cellStr.split(/[：:]/);
            const candidate = (parts[1] && parts[1].trim()) ? parts[1].trim() : (row[c + 1] !== undefined ? row[c + 1] : '');
            const norm = normalizeDateToken(candidate);
            if (norm) startDate = norm;
            continue;
          }
          if (cellStr.includes('対象期間終了日')) {
            const parts = cellStr.split(/[：:]/);
            const candidate = (parts[1] && parts[1].trim()) ? parts[1].trim() : (row[c + 1] !== undefined ? row[c + 1] : '');
            const norm = normalizeDateToken(candidate);
            if (norm) endDate = norm;
            continue;
          }

          if (!periodLabel) {
            const mRange = cellStr.match(/(20\d{2}[年\/\-.]\s*\d{1,2}[月\/\-.]\s*\d{1,2}日?(?:\([日月火水木金土]\))?)\s*[~〜～\-－]\s*((?:20\d{2}[年\/\-.]\s*)?\d{1,2}[月\/\-.]\s*\d{1,2}日?(?:\([日月火水木金土]\))?)/);
            if (mRange) {
              const sNorm = normalizeDateToken(mRange[1]);
              const eNorm = normalizeDateToken(mRange[2]);
              periodLabel = (sNorm === eNorm) ? sNorm : `${sNorm}〜${eNorm}`;
            } else if (/^(?:対象期間|表示期間|集計期間|期間|年月日|営業日|日付)[：:]/.test(cellStr)) {
              const valPart = cellStr.split(/[：:]/).slice(1).join(':').trim() || (row[c + 1] !== undefined ? toHalfWidth(row[c + 1]) : '');
              if (valPart) {
                const mSubRange = valPart.match(/(20\d{2}[年\/\-.]\s*\d{1,2}[月\/\-.]\s*\d{1,2}日?(?:\([日月火水木金土]\))?)\s*[~〜～\-－]\s*((?:20\d{2}[年\/\-.]\s*)?\d{1,2}[月\/\-.]\s*\d{1,2}日?(?:\([日月火水木金土]\))?)/);
                if (mSubRange) {
                  const sNorm = normalizeDateToken(mSubRange[1]);
                  const eNorm = normalizeDateToken(mSubRange[2]);
                  periodLabel = (sNorm === eNorm) ? sNorm : `${sNorm}〜${eNorm}`;
                } else {
                  periodLabel = normalizeDateToken(valPart);
                }
              }
            } else if (r < 5) {
              const mSingle = cellStr.match(/^(20\d{2})[年\/\-.]\s*(\d{1,2})[月\/\-.]\s*(\d{1,2})日?(?:\(([日月火水木金土])\))?$/);
              if (mSingle) {
                periodLabel = normalizeDateToken(cellStr);
              } else {
                const mYm = cellStr.match(/^(20\d{2})[年\/\-.]\s*(\d{1,2})月(?:度)?$/);
                if (mYm) {
                  periodLabel = `${mYm[1]}年${Number(mYm[2])}月`;
                }
              }
            }
          }

          if (!storeName && /^(?:店舗名|店名|対象店舗|検索店舗|店舗)[：:]?$/.test(cellStr.split(/[：:]/)[0].trim())) {
            const parts = cellStr.split(/[：:]/);
            const rawStoreVal = (parts[1] && parts[1].trim()) ? parts[1].trim() : (row[c + 1] !== undefined ? toHalfWidth(row[c + 1]) : '');
            if (rawStoreVal && !/^(?:店舗|店名|対象期間|年月日)/.test(rawStoreVal)) {
              storeName = rawStoreVal;
            }
          }
        }
        if (storeHeaderHits >= 2) {
          hasMultipleStoresOrTotal = true;
        }
      }
    }

    if (!periodLabel && (startDate || endDate)) {
      if (startDate && endDate) {
        periodLabel = (startDate === endDate) ? startDate : `${startDate}〜${endDate}`;
      } else {
        periodLabel = startDate || endDate;
      }
    }

    const cleanFn = toHalfWidth(String(fileName || '').replace(/\.[^.]+$/, ''));
    if (!periodLabel && cleanFn) {
      const mFnRange = cleanFn.match(/(20\d{2})[年\/\-._]?([01]\d)[月\/\-._]?([0-3]\d)日?\s*[~〜～\-_]\s*(?:(20\d{2})[年\/\-._]?)?([01]\d)[月\/\-._]?([0-3]\d)日?/);
      if (mFnRange) {
        const s1 = formatDateWithDow(mFnRange[1], mFnRange[2], mFnRange[3]);
        const s2 = formatDateWithDow(mFnRange[4] || mFnRange[1], mFnRange[5], mFnRange[6]);
        if (s1 && s2) periodLabel = (s1 === s2) ? s1 : `${s1}〜${s2}`;
      }
      if (!periodLabel) {
        const mFnYmd = cleanFn.match(/(20\d{2})[年\/\-._\s]([01]?\d)[月\/\-._\s]([0-3]?\d)日?/) ||
          cleanFn.match(/(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
        if (mFnYmd) {
          periodLabel = formatDateWithDow(mFnYmd[1], mFnYmd[2], mFnYmd[3]);
        }
      }
      if (!periodLabel) {
        const mFnYm = cleanFn.match(/(20\d{2})[年\/\-._\s]?([01]?\d)月?/);
        if (mFnYm && Number(mFnYm[2]) >= 1 && Number(mFnYm[2]) <= 12) {
          periodLabel = `${mFnYm[1]}年${Number(mFnYm[2])}月`;
        }
      }
    }

    if (!storeName && cleanFn) {
      if (/(?:全店舗|全店|全社|全体)/.test(cleanFn)) {
        storeName = '全店舗';
      } else if (!hasMultipleStoresOrTotal) {
        const mStore = cleanFn.match(/(?:\d{2,4}[_\-\s]*)?([^\d_\-\s()（）.]{1,12}店)/);
        if (mStore) storeName = mStore[1];
      }
    }

    if (!storeName || /(?:全店舗|全店|全社|全体|全店計|全店合計)/.test(storeName) || hasMultipleStoresOrTotal) {
      storeName = '全店舗';
    } else {
      storeName = storeName.replace(/^\d{1,4}[\s:：_\-]*/, '').trim().slice(0, 30) || '全店舗';
    }

    if (!periodLabel) {
      periodLabel = '期間未特定';
    } else {
      periodLabel = periodLabel.slice(0, 50);
    }

    return {
      periodLabel: periodLabel,
      storeName: storeName,
      fileName: String(fileName || '').slice(0, 255)
    };
  }

  // グローバル公開（CSV・Excel両対応パーサー）
  const exportedParser = Object.freeze({
    parse: parseCsvToMatrix,
    parseExcel: parseExcelToMatrix,
    parseFile: parseDataFile,
    decodeCsv: decodeCsvBuffer,
    extractStores: extractStoreRecords,
    buildKanban: buildKanbanData,
    buildTotalStore: buildTotalStoreData,
    buildCategoryTotal: buildCategoryTotalData,
    extractFileMetadata: extractFileMetadata
  });

  root.SafeCsvParser = exportedParser;
  root.SafeDataParser = exportedParser;

})(typeof window !== 'undefined' ? window : this);
