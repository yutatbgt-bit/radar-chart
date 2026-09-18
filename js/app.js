/**
 * アプリケーション コアロジック (app.js)
 * 
 * 全24店舗・4列カンバンビューの統合制御。
 * innerHTMLは使用せず、DOM APIとtextContentを用いて堅牢かつ安全に画面構築。
 * 初期値データは保持せず、起動時はクリーンな店舗枠状態で立ち上がります。
 */

(function () {
  'use strict';

  const config = window.RadarAppConfig;
  let currentCsvFileName = '';

  /**
   * 安全なトーストメッセージの表示
   * @param {string} message 
   * @param {string} type 'info' | 'error' | 'success'
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fadeout');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  /**
   * 4列カンバンボードのレンダリング
   * @param {Array} kanbanCategories 
   */
  function renderKanbanBoard(kanbanCategories) {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    // 安全に子要素を全削除
    while (board.firstChild) {
      board.removeChild(board.firstChild);
    }

    kanbanCategories.forEach((category) => {
      // カンバン列要素
      const column = document.createElement('section');
      column.className = 'kanban-column';
      column.setAttribute('data-category', category.id);
      column.setAttribute('aria-label', `${category.name} 列`);

      // 列ヘッダー
      const colHeader = document.createElement('div');
      colHeader.className = 'kanban-column-header';

      const badge = document.createElement('span');
      badge.className = 'kanban-category-badge';
      badge.style.color = category.badgeColor;
      badge.style.backgroundColor = category.badgeBg;
      badge.textContent = category.name;

      const countBadge = document.createElement('span');
      countBadge.className = 'kanban-count-badge';
      countBadge.textContent = `${category.stores.length}店舗`;

      colHeader.appendChild(badge);
      colHeader.appendChild(countBadge);
      column.appendChild(colHeader);

      // カードコンテナ
      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'kanban-cards-container';

      // 各店舗カード（レーダーチャートとテーブルの1セット）
      category.stores.forEach((store) => {
        const card = document.createElement('article');
        card.className = 'store-kanban-card';
        card.setAttribute('aria-label', `${store.storeName} 実績カード`);
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');

        // カードヘッダー
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';

        const nameSpan = document.createElement('h2');
        nameSpan.className = 'card-store-name';
        nameSpan.textContent = store.storeName;

        const codeSpan = document.createElement('span');
        codeSpan.className = 'card-store-code';
        codeSpan.textContent = store.code ? `#${store.code}` : '';

        cardHeader.appendChild(nameSpan);
        if (store.code) cardHeader.appendChild(codeSpan);
        card.appendChild(cardHeader);

        // 1. レーダーチャート領域（セットの上部）
        const chartArea = document.createElement('div');
        chartArea.className = 'card-chart-area';
        card.appendChild(chartArea);

        // レーダーチャートのインスタンス化
        new window.StoreRadarChart(chartArea, store, config, category);

        // 2. 各店の項目別データ表領域（カード内の表を消さずに維持）
        const tableArea = document.createElement('div');
        tableArea.className = 'card-table-area';
        card.appendChild(tableArea);

        // テーブルコンポーネントのインスタンス化
        new window.StoreMetricsTable(tableArea, store, config);

        // クリック時およびキーボード操作時のPOPアップ拡大表示
        card.addEventListener('click', () => {
          openStoreModal(store, category);
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openStoreModal(store, category);
          }
        });

        cardsContainer.appendChild(card);
      });

      column.appendChild(cardsContainer);

      // 各列の一番下に、その列の全店舗の数値をまとめた一覧表を配置
      const summarySection = document.createElement('div');
      summarySection.className = 'kanban-column-summary-section';

      const summaryHeader = document.createElement('div');
      summaryHeader.className = 'column-summary-header';

      const summaryTitle = document.createElement('h3');
      summaryTitle.className = 'column-summary-title';
      summaryTitle.textContent = `${category.name} 数値実績一覧`;

      summaryHeader.appendChild(summaryTitle);
      summarySection.appendChild(summaryHeader);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'column-summary-table-wrapper';
      summarySection.appendChild(tableWrapper);

      // カテゴリ別全店舗サマリーデータ表のインスタンス化
      new window.CategorySummaryTable(tableWrapper, category, config, (clickedStore) => {
        openStoreModal(clickedStore, category);
      });

      column.appendChild(summarySection);
      board.appendChild(column);
    });

    // レンダリング直後にカードコンテナ高さを最大列（中型店A）に統一し、まとめ表を横一列に整列
    requestAnimationFrame(() => {
      alignCardsContainersHeight();
    });
  }

  /**
   * 各列のカードコンテナ高さを最大列（中型店A等）に揃え、
   * 各列下部の一覧表開始位置を完全に横一列に整列
   */
  function alignCardsContainersHeight() {
    const containers = Array.from(document.querySelectorAll('.kanban-cards-container'));
    if (containers.length === 0) return;

    // 一旦 minHeight をリセットして純粋なコンテンツ高さを計測
    containers.forEach((c) => {
      c.style.minHeight = '';
    });

    let maxHeight = 0;
    containers.forEach((c) => {
      if (c.offsetHeight > maxHeight) {
        maxHeight = c.offsetHeight;
      }
    });

    if (maxHeight > 0) {
      containers.forEach((c) => {
        c.style.minHeight = `${maxHeight}px`;
      });
    }
  }

  /**
   * 店舗詳細ポップアップモーダルを開く（拡大表示）
   * @param {Object} store 店舗データ
   * @param {Object} category カテゴリ設定
   */
  function openStoreModal(store, category) {
    const modalOverlay = document.getElementById('store-modal-overlay');
    const badgeEl = document.getElementById('modal-category-badge');
    const codeEl = document.getElementById('modal-store-code');
    const nameEl = document.getElementById('modal-store-name');
    const chartContainer = document.getElementById('modal-chart-container');
    const tableContainer = document.getElementById('modal-table-container');

    if (!modalOverlay || !badgeEl || !nameEl || !chartContainer || !tableContainer) return;

    // ヘッダー情報設定
    badgeEl.textContent = category.name;
    badgeEl.setAttribute('data-category', category.id);
    badgeEl.style.color = category.badgeColor;
    badgeEl.style.backgroundColor = category.badgeBg;
    badgeEl.style.borderColor = category.badgeBorder || category.badgeColor;

    codeEl.textContent = store.code ? `#${store.code}` : '';
    nameEl.textContent = store.storeName;

    // 拡大レーダーチャートの描画 (サイズ420px、枠線はできる限り細い極細ヘアライン0.8px)
    new window.StoreRadarChart(chartContainer, store, config, category, {
      size: 420,
      margin: 64,
      strokeWidth: (config.chartOptions && config.chartOptions.strokeWidth !== undefined) ? config.chartOptions.strokeWidth : 0.8,
      levels: 5
    });

    // 拡大データ表の描画
    new window.StoreMetricsTable(tableContainer, store, config);

    // モーダル表示
    modalOverlay.style.display = 'flex';
    modalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // 背景スクロール固定
  }

  /**
   * 店舗詳細ポップアップモーダルを閉じる
   */
  function closeStoreModal() {
    const modalOverlay = document.getElementById('store-modal-overlay');
    if (!modalOverlay) return;

    modalOverlay.style.display = 'none';
    modalOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; // 背景スクロール解除
  }

  /**
   * 全店舗の数値をクリア（店舗数・カテゴリー・項目構成は完全維持）
   * @param {boolean} silent トースト通知を抑止するかどうか
   */
  function clearAllStoreData(silent = false) {
    const categories = config.categories || [];
    const clearedCategories = categories.map((cat) => {
      const clearedStores = cat.stores.map((s) => {
        const emptyMetrics = {};
        (config.metrics || []).forEach((m) => {
          emptyMetrics[m.key] = null;
          emptyMetrics[m.id] = null;
        });
        return {
          storeName: s.name,
          csvName: s.name,
          code: '',
          metrics: emptyMetrics,
          categoryId: cat.id,
          categoryName: cat.name,
          isCleared: true
        };
      });

      return {
        id: cat.id,
        name: cat.name,
        badgeColor: cat.badgeColor,
        badgeBg: cat.badgeBg,
        badgeBorder: cat.badgeBorder,
        chartColor: cat.chartColor,
        stores: clearedStores
      };
    });

    renderKanbanBoard(clearedCategories);
    currentCsvFileName = '';
    RadarStorage.clearAll().then(function() {
      if (!silent) {
        showToast('全店舗の数値をクリアしました（店舗構成・評価項目は維持しています）', 'info');
      }
    }).catch(function() {
      if (!silent) {
        showToast('全店舗の数値をクリアしました', 'info');
      }
    });
  }

  const THEME_STORAGE_KEY = 'radar_chart_theme';

    // =========================================================================
  // CSVファイル処理・永続化・カンバン描画ロジック
  // =========================================================================

  /**
   * CSVテキストを安全にパースしてカンバンボードを描画し、永続化保存する
   * @param {string} csvText 
   * @param {string} [fileName] 
   * @param {boolean} [isRestore=false] 
   */
  function loadAndProcessCsv(csvText, fileName = '', isRestore = false) {
    try {
      const matrix = window.SafeCsvParser.parse(csvText);
      const storeMap = window.SafeCsvParser.extractStores(matrix, config);
      const kanbanCategories = window.SafeCsvParser.buildKanban(storeMap, config);

      renderKanbanBoard(kanbanCategories);

      if (!isRestore && csvText) {
        RadarStorage.set('csv_state', {
          csvText: csvText,
          fileName: fileName || currentCsvFileName || '',
          timestamp: new Date().toISOString()
        }).catch(function(err) {
          console.warn('[RadarStorage] persist error:', err);
        });
      }

      const totalStores = kanbanCategories.reduce((acc, c) => acc + c.stores.length, 0);
      showToast(データ読み込み完了: 全店舗のカンバンを描画しました。, 'success');
    } catch (err) {
      console.error('CSVパースエラー:', err);
      showToast(エラー: , 'error');
    }
  }

  /**
   * 単一のFileオブジェクトを安全に検証・読込する共通関数
   * @param {File} file 
   */
  function processCsvFile(file) {
    if (!file) return;

    const fileName = file.name || '';
    const isCsv = fileName.toLowerCase().endsWith('.csv') ||
                  file.type.includes('csv') ||
                  file.type.includes('text') ||
                  fileName.toLowerCase().endsWith('.txt');

    if (!isCsv) {
      showToast('CSV形式（.csv）のファイルを選択またはドロップしてください。', 'error');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast('ファイルサイズが大きすぎます（20MB以内）。', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      currentCsvFileName = fileName || '';
      showToast(「」読み込み中..., 'info');
      loadAndProcessCsv(content, fileName, false);
    };
    reader.onerror = () => {
      showToast('ファイルの読み込みに失敗しました。', 'error');
    };
    reader.readAsText(file, 'UTF-8');
  }

  // 後方互換性用インラインハンドラ
  window.handleInlineCsvDrop = function(e) {
    if (!e) return;
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    processCsvFile(dt.files[0]);
  };

  /**
   * 起動時に保存済みCSVデータを復元
   */
  function restorePersistedData() {
    RadarStorage.get('csv_state').then(function(state) {
      if (!state || !state.csvText) return;
      currentCsvFileName = state.fileName || '';
      loadAndProcessCsv(state.csvText, currentCsvFileName, true);
      showToast(前回保存されたデータ（）を復元しました。, 'info');
    }).catch(function(err) {
      console.warn('[restorePersistedData] error:', err);
    });
  }

  function init() {
    // 初期は店舗構成・項目を維持したクリア状態（定数設定）で画面描画
    clearAllStoreData(true);

    // ファイルアップロードイベント (input[type=file])
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        processCsvFile(file);
        fileInput.value = '';
      });
    }

    // クリアボタン（全店舗数値クリア＆保存データ削除）
    const clearBtn = document.getElementById('btn-clear-data');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearAllStoreData(false);
      });
    }

    // テーマ切り替え
    initThemeToggle();

    // 全画面表示切り替え
    initFullscreenToggle();

    // モーダル閉じるイベント
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeStoreModal);
    }

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
      alignCardsContainersHeight();
    });

    const modalOverlay = document.getElementById('store-modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          closeStoreModal();
        }
      });
    }

    // 起動時に保存済みデータを復元
    restorePersistedData();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeStoreModal();
      }
    });

    // =========================================================================
    // ドラッグ＆ドロップ処理（ドロップゾーン ＋ 画面全体サポート）
    // =========================================================================
    const dropZone = document.getElementById('csv-drop-zone');

    // ブラウザデフォルトの意図しない画面外ファイルドロップ（別タブ遷移）防止
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      // ユーザーがドロップゾーン以外の画面領域にCSVをドロップした場合でも受け付ける
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        const fileName = (file.name || '').toLowerCase();
        if (fileName.endsWith('.csv') || file.type.includes('csv') || file.type.includes('text')) {
          processCsvFile(file);
        }
      }
    });

    if (dropZone) {
      let zoneDragCounter = 0;

      dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zoneDragCounter++;
        dropZone.classList.add('is-drag-over');
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        dropZone.classList.add('is-drag-over');
      });

      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zoneDragCounter--;
        if (zoneDragCounter <= 0) {
          zoneDragCounter = 0;
          dropZone.classList.remove('is-drag-over');
        }
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zoneDragCounter = 0;
        dropZone.classList.remove('is-drag-over');

        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;

        processCsvFile(files[0]);
      });
    }
  }

  // DOMContentLoadedで初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
