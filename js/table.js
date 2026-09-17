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
      thDiff.textContent = '前年差';
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
        tdName.textContent = metric.label;
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
          const benchmark = metric.benchmark || 100.0;
          const diff = Math.round((rawVal - benchmark) * 100) / 100;

          const badge = document.createElement('span');
          if (diff >= 0) {
            badge.className = 'badge-diff badge-positive';
            badge.textContent = `+${diff.toFixed(2)}%`;
          } else {
            badge.className = 'badge-diff badge-negative';
            badge.textContent = `${diff.toFixed(2)}%`;
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
      table.setAttribute('aria-label', `${this.category.name} 数値実績一覧表`);

      // THEAD
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const thStore = document.createElement('th');
      thStore.className = 'th-col-store';
      thStore.textContent = '店舗名';
      headerRow.appendChild(thStore);

      this.metrics.forEach((metric) => {
        const th = document.createElement('th');
        th.className = 'th-col-metric';
        th.textContent = metric.shortLabel || metric.label.replace('比較日比', '');
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // TBODY
      const tbody = document.createElement('tbody');

      // 店舗計（平均）計算用アキュムレータ
      const metricSums = {};
      const metricCounts = {};
      this.metrics.forEach(m => {
        metricSums[m.id] = 0;
        metricCounts[m.id] = 0;
      });

      this.stores.forEach((store) => {
        const tr = document.createElement('tr');
        tr.className = 'tr-summary-store-row';

        // 売上比と客数比の比較判定（客数比に対して売上比が低いか）
        const salesVal = store.metrics && (store.metrics['salesRatio'] !== undefined ? store.metrics['salesRatio'] : store.metrics['売上高比較日比']);
        const custVal = store.metrics && (store.metrics['customerRatio'] !== undefined ? store.metrics['customerRatio'] : store.metrics['客数比較日比']);
        const isDataValid = !store.isCleared && !store.isMissing && typeof salesVal === 'number' && typeof custVal === 'number';
        const isSalesLagging = isDataValid && (salesVal < custVal);

        // 店舗名セル（クリック可能）
        const tdStore = document.createElement('td');
        tdStore.className = 'td-col-store-name';
        
        const storeBtn = document.createElement('button');
        storeBtn.type = 'button';
        storeBtn.className = 'btn-summary-store-link';
        storeBtn.textContent = store.storeName;

        if (isSalesLagging) {
          // 客数比に対して売上比が低い店舗へのマーキング（店舗名のみに適用）
          storeBtn.classList.add('store-lagging-mark');
          storeBtn.title = `${store.storeName} [要注目: 客数比 ${custVal.toFixed(1)}% に対し 売上比 ${salesVal.toFixed(1)}% と下回っています]`;
        } else {
          storeBtn.title = `${store.storeName} の詳細モーダルを開く`;
        }

        if (this.onStoreClick) {
          storeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onStoreClick(store);
          });
        }
        tdStore.appendChild(storeBtn);
        tr.appendChild(tdStore);

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
            if (rawVal >= 100) {
              td.classList.add('val-achieved'); // 100%以上
            } else if (rawVal < 90) {
              td.classList.add('val-alert');    // 90%未満
            } else {
              td.classList.add('val-normal');   // 90%〜100%
            }

            metricSums[metric.id] += rawVal;
            metricCounts[metric.id]++;
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      // TFOOT: 店舗計行
      const tfoot = document.createElement('tfoot');
      const trAvg = document.createElement('tr');
      trAvg.className = 'tr-summary-avg-row';

      const tdAvgLabel = document.createElement('td');
      tdAvgLabel.className = 'td-col-store-name td-avg-label';
      tdAvgLabel.textContent = '店舗計';
      trAvg.appendChild(tdAvgLabel);

      this.metrics.forEach((metric) => {
        const tdAvg = document.createElement('td');
        tdAvg.className = 'td-col-val td-avg-val';

        const count = metricCounts[metric.id] || 0;
        if (count > 0) {
          const avg = metricSums[metric.id] / count;
          tdAvg.textContent = `${avg.toFixed(1)}%`;
          if (avg >= 100) {
            tdAvg.classList.add('val-achieved');
          } else if (avg < 90) {
            tdAvg.classList.add('val-alert');
          } else {
            tdAvg.classList.add('val-normal');
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
