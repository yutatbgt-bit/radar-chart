/**
 * 安全な店舗別項目データ表コンポーネント (table.js) - Luxury Dark Style
 * 
 * レーダーチャートと1セットで表示される5項目の実績比較テーブル。
 * innerHTMLは使用せず、DOM APIとtextContentのみで安全にレンダリング。
 */

(function (root) {
  'use strict';

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
          const budgets = (this.config && this.config.lossRatioBudgets) || (window.RadarAppConfig && window.RadarAppConfig.lossRatioBudgets) || {};
          const storeName = this.store.storeName || '';
          let storeBudget = budgets[storeName] !== undefined ? budgets[storeName] : (budgets[this.store.csvName] !== undefined ? budgets[this.store.csvName] : (budgets['default'] !== undefined ? budgets['default'] : 4.0));
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
          let benchmark = metric.benchmark || 100.0;
          if (isLoss) {
            const budgets = (this.config && this.config.lossRatioBudgets) || (window.RadarAppConfig && window.RadarAppConfig.lossRatioBudgets) || {};
            const storeName = this.store.storeName || '';
            if (budgets[storeName] !== undefined) {
              benchmark = budgets[storeName];
            } else if (budgets[this.store.csvName] !== undefined) {
              benchmark = budgets[this.store.csvName];
            } else if (budgets['default'] !== undefined) {
              benchmark = budgets['default'];
            }
          }

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

      // 1. 事前に各指標・日商の店舗計（平均値）を計算
      const metricSums = {};
      const metricCounts = {};
      let dailySalesSum = 0;
      let dailySalesCount = 0;

      this.metrics.forEach(m => {
        metricSums[m.id] = 0;
        metricCounts[m.id] = 0;
      });

      this.stores.forEach((store) => {
        if (!store.isCleared && !store.isMissing) {
          if (store.dailySales !== undefined && store.dailySales !== null) {
            dailySalesSum += store.dailySales;
            dailySalesCount++;
          }
          this.metrics.forEach((metric) => {
            const rawVal = store.metrics && store.metrics[metric.key] !== undefined
              ? store.metrics[metric.key]
              : (store.metrics && store.metrics[metric.id] !== undefined ? store.metrics[metric.id] : null);
            if (rawVal !== null && typeof rawVal === 'number' && !isNaN(rawVal)) {
              metricSums[metric.id] += rawVal;
              metricCounts[metric.id]++;
            }
          });
        }
      });

      const metricAverages = {};
      this.metrics.forEach(m => {
        const count = metricCounts[m.id] || 0;
        metricAverages[m.id] = count > 0 ? (metricSums[m.id] / count) : null;
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
              const budgets = (this.config && this.config.lossRatioBudgets) || (window.RadarAppConfig && window.RadarAppConfig.lossRatioBudgets) || {};
              const storeName = store.storeName || '';
              let storeBudget = budgets[storeName] !== undefined ? budgets[storeName] : (budgets[store.csvName] !== undefined ? budgets[store.csvName] : (budgets['default'] !== undefined ? budgets['default'] : 4.0));
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

      this.metrics.forEach((metric) => {
        const tdAvg = document.createElement('td');
        tdAvg.className = 'td-col-val td-avg-val';

        const count = metricCounts[metric.id] || 0;
        if (count > 0) {
          const avg = metricAverages[metric.id];
          tdAvg.textContent = `${avg.toFixed(1)}%`;
          const isLoss = (metric.id === 'lossRatio' || metric.key === 'lossRatio');
          if (isLoss) {
            const budgets = (this.config && this.config.lossRatioBudgets) || (window.RadarAppConfig && window.RadarAppConfig.lossRatioBudgets) || {};
            const totalBudget = budgets['全店計'] !== undefined ? budgets['全店計'] : 4.0;
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
