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

  root.StoreMetricsTable = StoreMetricsTable;

})(typeof window !== 'undefined' ? window : this);
