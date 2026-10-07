/**
 * 安全な店舗別項目データ表コンポーネント (table.js) - Luxury Dark Style
 * 
 * レーダーチャートと1セットで表示される5項目の実績比較テーブル。
 * innerHTMLは使用せず、DOM APIとtextContentのみで安全にレンダリング。
 */

(function (root) {
  'use strict';

  const TOTAL_STORE_BUDGET_KEY = '全店計';
  const FALLBACK_LOSS_RATIO_BUDGET = 4.0;

  /**
   * 店舗レコードに対応するロス率予算（%）を解決する。
   * 全店計・カテゴリ店舗計は全店計予算を基準とし、チャートのロス率目盛りと判定基準を一致させる。
   * @param {Object} store 店舗レコード
   * @param {Object} config アプリ設定
   * @returns {number}
   */
  function resolveLossRatioBudget(store, config) {
    const budgets = (config && config.lossRatioBudgets) || (root.RadarAppConfig && root.RadarAppConfig.lossRatioBudgets) || {};
    const fallback = budgets['default'] !== undefined ? budgets['default'] : FALLBACK_LOSS_RATIO_BUDGET;
    const safeStore = store || {};

    if (safeStore.isCategoryTotal || safeStore.categoryId === 'total') {
      return budgets[TOTAL_STORE_BUDGET_KEY] !== undefined ? budgets[TOTAL_STORE_BUDGET_KEY] : fallback;
    }
    if (safeStore.storeName && budgets[safeStore.storeName] !== undefined) return budgets[safeStore.storeName];
    if (safeStore.csvName && budgets[safeStore.csvName] !== undefined) return budgets[safeStore.csvName];
    return fallback;
  }

  class StoreMetricsTable {
    /**
     * @param {HTMLElement} containerElement 描画先DOMコンテナ
     * @param {Object} storeRecord 店舗データ
     * @param {Object} config アプリ設定
     */
    constructor(containerElement, storeRecord, config) {
      this.container = containerElement;
      this.store = storeRecord;
      this.config = config || {};
      this.metrics = this.config.metrics || [];

      this.render();
    }

    /**
     * テーブル描画
     */
    render() {
      // 既存要素の安全な全削除
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }

      const table = document.createElement('table');
      table.className = 'card-metrics-table';
      table.setAttribute('role', 'table');
      table.setAttribute('aria-label', `${this.store.storeName} 指標一覧`);

      // THEAD
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const thMetric = document.createElement('th');
      thMetric.className = 'th-metric';
      thMetric.textContent = '比較項目';
      headerRow.appendChild(thMetric);

      const thValue = document.createElement('th');
      thValue.className = 'th-value';
      thValue.textContent = '比較日比';
      headerRow.appendChild(thValue);

      const thDiff = document.createElement('th');
      thDiff.className = 'th-diff';
      thDiff.textContent = '前年差 / 予算差';
      headerRow.appendChild(thDiff);

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // TBODY
      const tbody = document.createElement('tbody');

      this.metrics.forEach((metric) => {
        const tr = document.createElement('tr');
        tr.className = 'tr-metric-row';

        // 項目名
        const tdName = document.createElement('td');
        tdName.className = 'td-name';

        const isLoss = (metric.id === 'lossRatio' || metric.key === 'lossRatio');
        if (isLoss) {
          const storeBudget = resolveLossRatioBudget(this.store, this.config);
          tdName.textContent = `${metric.label}(${storeBudget.toFixed(2)}%)`;
        } else {
          tdName.textContent = metric.label;
        }

        tr.appendChild(tdName);

        // 値
        const rawVal = this.store.metrics[metric.key] !== undefined
          ? this.store.metrics[metric.key]
          : (this.store.metrics[metric.id] !== undefined ? this.store.metrics[metric.id] : null);

        const isClearedOrMissing = this.store.isCleared || this.store.isMissing || rawVal === null;

        const tdValue = document.createElement('td');
        tdValue.className = 'td-val';
        tdValue.textContent = isClearedOrMissing ? '-' : `${rawVal.toFixed(2)}%`;
        tr.appendChild(tdValue);

        // 基準値100%との差分（小数点第2位表示）
        const tdDiff = document.createElement('td');
        tdDiff.className = 'td-diff-badge';

        if (isClearedOrMissing) {
          const emptySpan = document.createElement('span');
          emptySpan.textContent = '-';
          emptySpan.style.color = 'var(--text-dim)';
          tdDiff.appendChild(emptySpan);
        } else {
          const isLoss = (metric.id === 'lossRatio' || metric.key === 'lossRatio');
          const benchmark = isLoss
            ? resolveLossRatioBudget(this.store, this.config)
            : (metric.benchmark || 100.0);

          const diff = Math.round((rawVal - benchmark) * 100) / 100;

          const badge = document.createElement('span');
          if (isLoss) {
            // ロス率は予算以下が良好（positive/green）、予算超過が悪化（negative/rose）
            if (diff <= 0) {
              badge.className = 'badge-diff badge-positive';
              badge.textContent = diff === 0 ? '±0.00%' : `${diff.toFixed(2)}%`;
            } else {
              badge.className = 'badge-diff badge-negative';
              badge.textContent = `+${diff.toFixed(2)}%`;
            }
            badge.title = `ロス率予算: ${benchmark.toFixed(2)}% (実績: ${rawVal.toFixed(2)}%)`;
          } else {
            if (diff >= 0) {
              badge.className = 'badge-diff badge-positive';
              badge.textContent = `+${diff.toFixed(2)}%`;
            } else {
              badge.className = 'badge-diff badge-negative';
              badge.textContent = `${diff.toFixed(2)}%`;
            }
          }
          tdDiff.appendChild(badge);
        }

        tr.appendChild(tdDiff);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      this.container.appendChild(table);
    }
  }

  /**
   * 各列（カテゴリ）の一番下に配置される全店舗数値まとめ表
   */
  class CategorySummaryTable {
    /**
     * @param {HTMLElement} containerElement 描画先DOMコンテナ
     * @param {Object} category カテゴリデータ（stores配列を含む）
     * @param {Object} config アプリ設定
     * @param {Function} [onStoreClick] 店舗名クリック時のコールバック
     */
    constructor(containerElement, category, config, onStoreClick) {
      this.container = containerElement;
      this.category = category || {};
      this.stores = this.category.stores || [];
      this.config = config || {};
      this.metrics = this.config.metrics || [];
      this.onStoreClick = onStoreClick || null;

      this.render();
    }

    /**
     * テーブル描画
     */
    render() {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }

      const table = document.createElement('table');
      table.className = 'column-summary-table';
      table.setAttribute('role', 'table');
      table.setAttribute('aria-label', `${this.category.name} 数値一覧表`);

      // 1. 事前に日商の店舗計（平均値）を計算
      let dailySalesSum = 0;
      let dailySalesCount = 0;

      this.stores.forEach((store) => {
        if (!store.isCleared && !store.isMissing && store.dailySales !== undefined && store.dailySales !== null) {
          dailySalesSum += store.dailySales;
          dailySalesCount++;
        }
      });

      // 各指標の店舗計（平均値）は、列上部のカテゴリ店舗計チャートと同一関数で算出し数値を一致させる
      const categoryTotal = root.SafeCsvParser.buildCategoryTotal(this.category, this.config);
      const metricAverages = {};
      this.metrics.forEach(m => {
        const avg = categoryTotal.metrics[m.id];
        metricAverages[m.id] = (typeof avg === 'number' && Number.isFinite(avg)) ? avg : null;
      });

      // THEAD
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const thStore = document.createElement('th');
      thStore.className = 'th-col-store';
      thStore.textContent = '店舗名';
      headerRow.appendChild(thStore);

      const thDailySales = document.createElement('th');
      thDailySales.className = 'th-col-metric th-col-daily-sales';
      thDailySales.textContent = '日商';
      headerRow.appendChild(thDailySales);

      const thSalesRatio = document.createElement('th');
      thSalesRatio.className = 'th-col-metric th-col-sales-comp-ratio';
      thSalesRatio.textContent = '構成比';
      headerRow.appendChild(thSalesRatio);

      this.metrics.forEach((metric) => {
        const th = document.createElement('th');
        th.className = 'th-col-metric';
        th.textContent = metric.shortLabel || metric.label.replace('比率', '');
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // TBODY
      const tbody = document.createElement('tbody');

      this.stores.forEach((store) => {
        const tr = document.createElement('tr');
        tr.className = 'tr-summary-store-row';

        // 売上と客数の比較 & 売上100%超え判定
        const salesVal = store.metrics && (store.metrics['salesRatio'] !== undefined ? store.metrics['salesRatio'] : store.metrics['売上高比率']);
        const custVal = store.metrics && (store.metrics['customerRatio'] !== undefined ? store.metrics['customerRatio'] : store.metrics['客数比率']);
        const isDataValid = !store.isCleared && !store.isMissing && typeof salesVal === 'number' && typeof custVal === 'number';

        const isSalesLeading = isDataValid && (salesVal > 100);
        const isSalesLagging = isDataValid && !isSalesLeading && (salesVal < custVal);

        // 店舗名セル
        const tdStore = document.createElement('td');
        tdStore.className = 'td-col-store-name';
        
        const storeBtn = document.createElement('button');
        storeBtn.type = 'button';
        storeBtn.className = 'btn-summary-store-link';
        storeBtn.textContent = store.storeName;

        if (isSalesLeading) {
          // 売上高が100%超えの店舗: 緑色マーキング
          storeBtn.classList.add('store-leading-mark');
          storeBtn.title = `${store.storeName} [好調: 売上高 ${salesVal.toFixed(1)}% (100%超え)]`;
        } else if (isSalesLagging) {
          // 客数に対して売上が低い店舗: 赤色マーキング
          storeBtn.classList.add('store-lagging-mark');
          storeBtn.title = `${store.storeName} [注意: 客数 ${custVal.toFixed(1)}% に対し 売上 ${salesVal.toFixed(1)}% と低迷]`;
        } else {
          storeBtn.title = `${store.storeName} の詳細レーダーを開く`;
        }

        if (this.onStoreClick) {
          storeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onStoreClick(store);
          });
        }
        tdStore.appendChild(storeBtn);
        tr.appendChild(tdStore);

        // 日商セル
        const tdDailySales = document.createElement('td');
        tdDailySales.className = 'td-col-val td-col-daily-sales';
        const hasDailySales = !store.isCleared && !store.isMissing && store.dailySales !== undefined && store.dailySales !== null;
        if (hasDailySales) {
          tdDailySales.textContent = Math.round(store.dailySales).toLocaleString();
        } else {
          tdDailySales.textContent = '-';
          tdDailySales.classList.add('val-empty');
        }
        tr.appendChild(tdDailySales);

        // 構成比セル
        const tdSalesRatio = document.createElement('td');
        tdSalesRatio.className = 'td-col-val td-col-sales-comp-ratio';
        if (store.salesCompRatioStr) {
          tdSalesRatio.textContent = store.salesCompRatioStr;
        } else {
          tdSalesRatio.textContent = '-';
          tdSalesRatio.classList.add('val-empty');
        }
        tr.appendChild(tdSalesRatio);

        // 各指標値セル
        this.metrics.forEach((metric) => {
          const td = document.createElement('td');
          td.className = 'td-col-val';

          const rawVal = store.metrics && store.metrics[metric.key] !== undefined
            ? store.metrics[metric.key]
            : (store.metrics && store.metrics[metric.id] !== undefined ? store.metrics[metric.id] : null);

          const isClearedOrMissing = store.isCleared || store.isMissing || rawVal === null;

          if (isClearedOrMissing) {
            td.textContent = '-';
            td.classList.add('val-empty');
          } else {
            td.textContent = `${rawVal.toFixed(1)}%`;
            const isLoss = (metric.id === 'lossRatio' || metric.key === 'lossRatio');
            if (isLoss) {
              const storeName = store.storeName || '';
              const storeBudget = resolveLossRatioBudget(store, this.config);
              if (rawVal <= storeBudget) {
                td.classList.add('val-achieved'); // 予算以内: 緑
              } else {
                td.classList.add('val-alert');    // 予算オーバー: 赤
              }
              td.title = `${storeName} ロス率予算: ${storeBudget.toFixed(2)}% (実績: ${rawVal.toFixed(2)}%)`;
            } else {
              // 売上高、客数、打数の3項目は店舗計（平均値）以下の場合に黄色判定
              const isTargetThreeMetric = ['salesRatio', 'customerRatio', 'itemHitRatio'].includes(metric.id);
              const avg = metricAverages[metric.id];

              if (rawVal > 100) {
                td.classList.add('val-achieved'); // 100%超え: 緑
              } else if (rawVal < 90) {
                td.classList.add('val-alert');    // 90%未満: 赤
              } else if (isTargetThreeMetric && avg !== null && rawVal <= avg) {
                td.classList.add('val-sub-avg');  // 平均値以下: 黄色
                td.title = `${metric.label}: カテゴリ平均 ${avg.toFixed(1)}% 以下のため黄色表示`;
              } else {
                td.classList.add('val-normal');   // 通常: 白〜淡灰
              }
            }
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      // TFOOT: 店舗計（平均）行
      const tfoot = document.createElement('tfoot');
      const trAvg = document.createElement('tr');
      trAvg.className = 'tr-summary-avg-row';

      const tdAvgLabel = document.createElement('td');
      tdAvgLabel.className = 'td-col-store-name td-avg-label';
      tdAvgLabel.textContent = '店舗計';
      trAvg.appendChild(tdAvgLabel);

      const tdAvgDailySales = document.createElement('td');
      tdAvgDailySales.className = 'td-col-val td-avg-val td-col-daily-sales';
      if (dailySalesCount > 0) {
        const avgDailySales = Math.round(dailySalesSum / dailySalesCount);
        tdAvgDailySales.textContent = avgDailySales.toLocaleString();
      } else {
        tdAvgDailySales.textContent = '-';
        tdAvgDailySales.classList.add('val-empty');
      }
      trAvg.appendChild(tdAvgDailySales);

      // 構成比セル (カテゴリ計)
      const tdAvgSalesRatio = document.createElement('td');
      tdAvgSalesRatio.className = 'td-col-val td-avg-val td-col-sales-comp-ratio';
      let catRatioSum = 0;
      let hasRatioData = false;
      this.stores.forEach(store => {
        if (store.salesCompRatioNum !== undefined) {
           catRatioSum += store.salesCompRatioNum;
           hasRatioData = true;
        }
      });
      if (hasRatioData) {
        tdAvgSalesRatio.textContent = `${catRatioSum.toFixed(1)}%`;
      } else {
        tdAvgSalesRatio.textContent = '-';
        tdAvgSalesRatio.classList.add('val-empty');
      }
      trAvg.appendChild(tdAvgSalesRatio);

      this.metrics.forEach((metric) => {
        const tdAvg = document.createElement('td');
        tdAvg.className = 'td-col-val td-avg-val';

        const avg = metricAverages[metric.id];
        if (avg !== null) {
          tdAvg.textContent = `${avg.toFixed(1)}%`;
          const isLoss = (metric.id === 'lossRatio' || metric.key === 'lossRatio');
          if (isLoss) {
            const totalBudget = resolveLossRatioBudget(categoryTotal, this.config);
            if (avg <= totalBudget) {
              tdAvg.classList.add('val-achieved'); // 予算以内: 緑
            } else {
              tdAvg.classList.add('val-alert');    // 予算オーバー: 赤
            }
          } else {
            if (avg > 100) {
              tdAvg.classList.add('val-achieved');
            } else if (avg < 90) {
              tdAvg.classList.add('val-alert');
            } else {
              tdAvg.classList.add('val-normal');
            }
          }
        } else {
          tdAvg.textContent = '-';
          tdAvg.classList.add('val-empty');
        }

        trAvg.appendChild(tdAvg);
      });

      tfoot.appendChild(trAvg);
      table.appendChild(tfoot);

      table.appendChild(tbody);
      this.container.appendChild(table);
    }
  }

  root.StoreMetricsTable = StoreMetricsTable;
  root.CategorySummaryTable = CategorySummaryTable;

})(typeof window !== 'undefined' ? window : this);
