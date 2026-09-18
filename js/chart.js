/**
 * Luxury Dark Style Pure SVG レーダーチャート描画エンジン (chart.js)
 * 
 * 外部ライブラリ不使用、innerHTML不使用、DOM/SVG APIのみで構築。
 * 時計回り5項目、グラデーション塗り、同心円/多角形グリッド、ネオングローノードを精密描画。
 */

(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let chartIdCounter = 0;

  /**
   * 時計回りの極座標変換（0ラジアン = 真上12時方向）
   */
  function polarToCartesian(cx, cy, r, angleRad) {
    return {
      x: cx + r * Math.sin(angleRad),
      y: cy - r * Math.cos(angleRad)
    };
  }

  class StoreRadarChart {
    /**
     * @param {HTMLElement} containerElement 描画先DOM要素
     * @param {Object} storeRecord 店舗データ
     * @param {Object} config アプリ設定
     * @param {Object} categoryConfig カテゴリ設定
     */
    constructor(containerElement, storeRecord, config, categoryConfig, customOptions) {
      this.container = containerElement;
      this.store = storeRecord;
      this.config = config || {};
      this.categoryConfig = categoryConfig || {};
      this.customOptions = customOptions || {};
      this.metrics = this.config.metrics || [];
      this.chartOpts = Object.assign({}, this.config.chartOptions || {}, this.customOptions);
      
      this.chartId = `radar-${++chartIdCounter}`;

      this.size = this.chartOpts.size || 280;
      this.margin = this.chartOpts.margin || 44;
      this.cx = this.size / 2;
      this.cy = this.size / 2;
      this.radius = (this.size / 2) - this.margin;
      this.levels = this.chartOpts.levels || 5;

      // 端の値を100%に設定（configから取得、デフォルト 0%〜100%）
      this.scaleMin = this.chartOpts.scaleMin !== undefined ? this.chartOpts.scaleMin : 0;
      this.scaleMax = this.chartOpts.scaleMax !== undefined ? this.chartOpts.scaleMax : 100;
      this.benchmarkVal = this.chartOpts.benchmarkVal || 100.0;

      // テーマカラー
      this.chartColors = this.categoryConfig.chartColor || {
        stroke: "#38bdf8",
        fillStart: "rgba(56, 189, 248, 0.45)",
        fillEnd: "rgba(37, 99, 235, 0.15)",
        nodeGlow: "rgba(56, 189, 248, 0.6)"
      };

      this.render();
    }

    /**
     * 値から半径ピクセルへのマッピング
     * 90%〜100%の微細な変化を視覚的に拡大するため、区分線形（Piecewise）スケールを採用:
     * - 0% 〜 90%: 半径の 0% 〜 40%（中心から40%位置を90%に設定）
     * - 90% 〜 100%: 半径の 40% 〜 100%（外側60%の広大な領域に展開し、変化を6倍拡大）
     */
    valueToRadius(value) {
      // 異常値（NaN, null, undefined, 文字列）に対するゼロ安全フォールバック
      const safeVal = (typeof value === 'number' && Number.isFinite(value)) ? value : 0;
      const clamped = Math.max(this.scaleMin, Math.min(this.scaleMax, safeVal));
      let ratio;
      if (clamped >= 90) {
        // 90%〜100% の 10%幅を 半径の 40%〜100%（60%幅）に拡大展開（6倍スケール）
        ratio = 0.40 + ((clamped - 90) / 10) * 0.60;
      } else {
        // 0%〜90% を 半径の 0%〜40% に圧縮マッピング
        ratio = (clamped / 90) * 0.40;
      }
      return this.radius * ratio;
    }

    /**
     * チャート描画
     */
    render() {
      // 既存の子要素を安全に全削除
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('class', 'luxury-radar-svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${this.store.storeName} レーダーチャート`);

      const numAxes = this.metrics.length; // 5
      const angleStep = (Math.PI * 2) / numAxes;

      // --- DEFS: ラグジュアリーグロー＆グラデーション定義 ---
      const defs = document.createElementNS(SVG_NS, 'defs');

      // ポリゴン用リニアグラデーション（カテゴリ別の鮮やかなグラデーション）
      const gradId = `grad-${this.chartId}`;
      const linearGrad = document.createElementNS(SVG_NS, 'linearGradient');
      linearGrad.setAttribute('id', gradId);
      linearGrad.setAttribute('x1', '0%');
      linearGrad.setAttribute('y1', '0%');
      linearGrad.setAttribute('x2', '100%');
      linearGrad.setAttribute('y2', '100%');

      const stop1 = document.createElementNS(SVG_NS, 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', this.chartColors.stroke);
      stop1.setAttribute('stop-opacity', '0.48'); // 明るくマイルドな発色

      const stop2 = document.createElementNS(SVG_NS, 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', this.chartColors.stroke);
      stop2.setAttribute('stop-opacity', '0.10'); // ほどよい透過性

      linearGrad.appendChild(stop1);
      linearGrad.appendChild(stop2);
      defs.appendChild(linearGrad);

      // グローフィルター（明るく柔らかなマイルド光彩）
      const filterId = `glow-${this.chartId}`;
      const filter = document.createElementNS(SVG_NS, 'filter');
      filter.setAttribute('id', filterId);
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-20%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '140%');

      const feDropShadow = document.createElementNS(SVG_NS, 'feDropShadow');
      feDropShadow.setAttribute('dx', '0');
      feDropShadow.setAttribute('dy', '0');
      feDropShadow.setAttribute('stdDeviation', '2.0');
      feDropShadow.setAttribute('flood-color', this.chartColors.stroke);
      feDropShadow.setAttribute('flood-opacity', '0.32');
      filter.appendChild(feDropShadow);
      defs.appendChild(filter);

      svg.appendChild(defs);

      // --- 1. 背景グリッド（多角形＋同心円の融合ラグジュアリースタイル） ---
      const gridGroup = document.createElementNS(SVG_NS, 'g');
      gridGroup.setAttribute('class', 'chart-grid');

      // 最外周の円形ラグジュアリーリング
      if (this.chartOpts.showOuterRing) {
        const outerCircle = document.createElementNS(SVG_NS, 'circle');
        outerCircle.setAttribute('cx', this.cx.toFixed(1));
        outerCircle.setAttribute('cy', this.cy.toFixed(1));
        outerCircle.setAttribute('r', (this.radius + 4).toFixed(1));
        outerCircle.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
        outerCircle.setAttribute('stroke-width', '1');
        outerCircle.setAttribute('fill', 'none');
        gridGroup.appendChild(outerCircle);
      }

      // 多角形グリッド（40%位置=90%、90%〜100%の変化を視覚的に捉えやすい新目盛り構成）
      const gridLevels = [
        { pct: 60, label: "60%", isAlert: true },
        { pct: 90, label: "90%", isBase: true },
        { pct: 92.5, label: "92.5%", isSub: true },
        { pct: 95, label: "95%", isMid: true },
        { pct: 97.5, label: "97.5%", isSub: true },
        { pct: 100, label: "100%", isOuter: true }
      ];

      gridLevels.forEach((gridItem) => {
        const levelRadius = this.valueToRadius(gridItem.pct);
        const isOuterEdge = Boolean(gridItem.isOuter);
        const points = [];

        for (let i = 0; i < numAxes; i++) {
          const angle = i * angleStep;
          const pos = polarToCartesian(this.cx, this.cy, levelRadius, angle);
          points.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
        }

        const polygon = document.createElementNS(SVG_NS, "polygon");
        polygon.setAttribute("points", points.join(" "));
        
        if (isOuterEdge) {
          // 最外周端（100%ライン）：淡いソフトローズの破線枠
          polygon.setAttribute("stroke", this.chartOpts.benchmarkColor || "rgba(251, 113, 133, 0.75)");
          polygon.setAttribute("stroke-width", "1.4");
          polygon.setAttribute("stroke-dasharray", "4,2");
          polygon.setAttribute("fill", "none");
        } else if (gridItem.isBase) {
          // 40%位置の90%ライン（基準の境界線として繊細に強調）
          polygon.setAttribute("stroke", "rgba(255, 255, 255, 0.22)");
          polygon.setAttribute("stroke-width", "0.9");
          polygon.setAttribute("stroke-dasharray", "3,2");
          polygon.setAttribute("fill", "none");
        } else if (gridItem.isSub) {
          // 92.5% / 97.5% の補助線（極細の淡いガイドライン）
          polygon.setAttribute("stroke", "rgba(255, 255, 255, 0.06)");
          polygon.setAttribute("stroke-width", "0.5");
          polygon.setAttribute("fill", "none");
        } else {
          // 60%・95% などの通常グリッド線
          polygon.setAttribute("stroke", "rgba(255, 255, 255, 0.11)");
          polygon.setAttribute("stroke-width", "0.7");
          polygon.setAttribute("fill", "none");
        }
        gridGroup.appendChild(polygon);

        // レベル目盛り数値（補助線は非表示、主要な60%, 90%, 95%を配置）
        const showBenchmarkLabel = Boolean(this.chartOpts.showBenchmarkLabel);
        if ((!isOuterEdge || showBenchmarkLabel) && !gridItem.isSub) {
          const scalePos = polarToCartesian(this.cx, this.cy, levelRadius, 0);
          const scaleText = document.createElementNS(SVG_NS, "text");
          scaleText.setAttribute("x", (scalePos.x + 3).toFixed(1));
          scaleText.setAttribute("y", (scalePos.y + 2).toFixed(1));
          scaleText.setAttribute("class", isOuterEdge ? "chart-scale-label-outer" : "chart-scale-label");
          scaleText.setAttribute("fill", gridItem.isBase ? "rgba(255, 255, 255, 0.75)" : "rgba(148, 163, 184, 0.55)");
          scaleText.setAttribute("font-size", gridItem.isBase ? "8.5px" : "7.5px");
          scaleText.setAttribute("font-weight", gridItem.isBase ? "700" : "500");
          scaleText.setAttribute("font-family", "monospace");
          scaleText.textContent = gridItem.label;
          gridGroup.appendChild(scaleText);
        }
      });
      svg.appendChild(gridGroup);

      // --- 2. 放射軸線 ---
      const axisGroup = document.createElementNS(SVG_NS, 'g');
      axisGroup.setAttribute('class', 'chart-axes');

      for (let i = 0; i < numAxes; i++) {
        const angle = i * angleStep;
        const endPos = polarToCartesian(this.cx, this.cy, this.radius, angle);

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', this.cx.toFixed(1));
        line.setAttribute('y1', this.cy.toFixed(1));
        line.setAttribute('x2', endPos.x.toFixed(1));
        line.setAttribute('y2', endPos.y.toFixed(1));
        line.setAttribute('stroke', 'rgba(255, 255, 255, 0.14)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '2,3');
        axisGroup.appendChild(line);
      }
      svg.appendChild(axisGroup);

        // --- 2.5 全店計（背景比較用）ポリゴン ---
        try {
          if (this.config && window.RadarAppTotalStoreData && window.RadarAppTotalStoreData.metrics && this.store && this.store.categoryId !== 'total') {
            const totalGroup = document.createElementNS(SVG_NS, 'g');
            totalGroup.setAttribute('class', 'chart-total-data');
                          const totalTheme = this.config.totalStoreTheme || { chartColor: { stroke: '#f472b6', fillStart: 'rgba(244,114,182,0.3)' }};
              const totalPoints = [];
              this.metrics.forEach((metric, i) => {
                const angle = i * angleStep;
                let rawVal = window.RadarAppTotalStoreData.metrics[metric.key];
                if (rawVal === undefined) rawVal = window.RadarAppTotalStoreData.metrics[metric.id];
                if (rawVal === undefined || isNaN(rawVal) || rawVal === null) rawVal = 0;
                
                const clampedVal = Math.min(this.scaleMax, Math.max(this.scaleMin, rawVal));
                const r = this.valueToRadius(clampedVal);
                const pos = polarToCartesian(this.cx, this.cy, r, angle);
                totalPoints.push(pos.x.toFixed(1) + "," + pos.y.toFixed(1));
                
                // 全店計の数値ラベル（自店舗の邪魔にならないよう内側に小さく配置）
                if (this.chartOpts.showValuesOnNodes) {
                  const valText = document.createElementNS(SVG_NS, 'text');
                  valText.setAttribute('font-size', '8px');
                  valText.setAttribute('fill', totalTheme.chartColor.stroke);
                  valText.setAttribute('opacity', '0.85');
                  valText.setAttribute('font-weight', '600');
                  valText.setAttribute('font-family', 'monospace');
                  valText.textContent = `${rawVal.toFixed(1)}%`;
                  
                                    const sinA = Math.sin(angle);
                  const cosA = Math.cos(angle);
                  
                                      // インデックス(i)に基づいて、ユーザー指定の方向に配置
                    // 0:売上高(右), 1:客数(右), 2:打数(下), 3:客単価(下), 4:一品単価(上)
                    const isLargeModal = this.size >= 400;
                    
                    // ベースとして店舗ラベルの外側に配置するための距離
                    const baseR = r + (isLargeModal ? 22 : 16);
                    let textX = this.cx + baseR * Math.sin(angle);
                    let textY = this.cy - baseR * Math.cos(angle);
                    let anchor = 'middle';
                    
                    if (i === 0) {
                      // 売上高 -> 右側
                      textX += (isLargeModal ? 20 : 15);
                      anchor = 'start';
                    } else if (i === 1) {
                      // 客数 -> 右側
                      textX += (isLargeModal ? 15 : 10);
                      anchor = 'start';
                    } else if (i === 2) {
                      // 打数 -> 下側
                      textY += (isLargeModal ? 12 : 10);
                    } else if (i === 3) {
                      // 客単価 -> 下側
                      textY += (isLargeModal ? 12 : 10);
                    } else if (i === 4) {
                      // 一品単価 -> 上側
                      textY -= (isLargeModal ? 12 : 10);
                    }
                    
                    valText.setAttribute('text-anchor', anchor);
                    valText.setAttribute('x', textX);
                    valText.setAttribute('y', textY);
                  
                  totalGroup.appendChild(valText);
                }
              });
            const totalFillPoly = document.createElementNS(SVG_NS, 'polygon');
            totalFillPoly.setAttribute('points', totalPoints.join(' '));
            totalFillPoly.setAttribute('fill', totalTheme.chartColor.fillStart || 'rgba(251,207,232,0.3)');
            totalFillPoly.setAttribute('opacity', '0.45');
            totalGroup.appendChild(totalFillPoly);
            const totalPoly = document.createElementNS(SVG_NS, 'polygon');
            totalPoly.setAttribute('points', totalPoints.join(' '));
            totalPoly.setAttribute('fill', 'none');
            totalPoly.setAttribute('stroke', totalTheme.chartColor.stroke || '#fbcfe8');
            totalPoly.setAttribute('stroke-width', '0.8');
            // 実線に変更するため dasharray を削除
            // totalPoly.setAttribute('stroke-dasharray', '4, 4');
            totalPoly.setAttribute('stroke-opacity', '1.0');
            totalGroup.appendChild(totalPoly);
            svg.appendChild(totalGroup);
          }
        } catch (e) {
          console.error('Total store background overlay error:', e);
        }
        // --- 3. 実測値ポリゴン（ラグジュアリーグロー＆グラデーション：クリア時は未描画） ---
      if (!this.store.isCleared) {
        const dataGroup = document.createElementNS(SVG_NS, 'g');
        dataGroup.setAttribute('class', 'chart-data');

        const dataPoints = [];
        const nodeCoords = [];

        this.metrics.forEach((metric, i) => {
          const angle = i * angleStep;
          const rawVal = this.store.metrics[metric.key] !== undefined
            ? this.store.metrics[metric.key]
            : (this.store.metrics[metric.id] || 0);

          // 端の値（100%）を上限としてクランプ
          const clampedVal = Math.min(this.scaleMax, Math.max(this.scaleMin, rawVal));
          const r = this.valueToRadius(clampedVal);
          const pos = polarToCartesian(this.cx, this.cy, r, angle);

          dataPoints.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
          nodeCoords.push({
            x: pos.x,
            y: pos.y,
            val: clampedVal,
            rawVal: rawVal,
            metric: metric,
            angle: angle,
            index: i
          });
        });

        // 塗りつぶしグラデーションポリゴン（できる限り細い極細外枠線）
        const polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('points', dataPoints.join(' '));
        polygon.setAttribute('fill', `url(#${gradId})`);
        polygon.setAttribute('stroke', this.chartColors.stroke);
        polygon.setAttribute('stroke-width', String(this.chartOpts.strokeWidth !== undefined ? this.chartOpts.strokeWidth : 0.8));
        polygon.setAttribute('class', 'store-data-polygon');
        dataGroup.appendChild(polygon);

        // 各頂点のラグジュアリーノードポイント
        nodeCoords.forEach((node) => {
          // 外周リング（繊細な極細リング）
          const outerCircle = document.createElementNS(SVG_NS, 'circle');
          outerCircle.setAttribute('cx', node.x.toFixed(1));
          outerCircle.setAttribute('cy', node.y.toFixed(1));
          outerCircle.setAttribute('r', '3.8');
          outerCircle.setAttribute('fill', '#0b1329');
          outerCircle.setAttribute('stroke', this.chartColors.stroke);
          outerCircle.setAttribute('stroke-width', '1.2');
          dataGroup.appendChild(outerCircle);

          // 内芯ポイント
          const innerCircle = document.createElementNS(SVG_NS, 'circle');
          innerCircle.setAttribute('cx', node.x.toFixed(1));
          innerCircle.setAttribute('cy', node.y.toFixed(1));
          innerCircle.setAttribute('r', '1.5');
          innerCircle.setAttribute('fill', '#ffffff');
          dataGroup.appendChild(innerCircle);

          // ノード数値ラベル（実際の実績値を表示。チャート線やノードに被らないよう外側にオフセット配置）
          if (this.chartOpts.showValuesOnNodes && !this.store.isMissing) {
            const actualVal = node.rawVal !== undefined ? node.rawVal : node.val;
            const valText = document.createElementNS(SVG_NS, 'text');
            valText.setAttribute('class', 'chart-node-val');
            valText.setAttribute('font-size', this.size >= 400 ? '11px' : '9.5px');
            valText.setAttribute('font-weight', '700');
            valText.setAttribute('font-family', 'monospace');
            valText.textContent = `${actualVal.toFixed(2)}%`;

            // チャート線・ノード・外枠線に被らないよう、角度（三角関数）に基づいて全自動で外側へオフセット
            const isLargeModal = this.size >= 400;
            const distBase = isLargeModal ? 16 : 11;

            const sinA = Math.sin(node.angle);
            const cosA = Math.cos(node.angle);

            // 上半分左右ノード（客数・一品単価等: cosA > 0.05 && |sinA| > 0.35）の判定
            const isUpperSide = cosA > 0.05 && Math.abs(sinA) > 0.35;

            let textX = node.x + distBase * sinA;
            let textY = node.y - distBase * cosA;

            let textAnchor = 'middle';
            let dominantBaseline = 'central';

            if (isUpperSide) {
              // 一品単価・客数：ノードの斜め上のクリア領域へリフト（下揃えで上方向へ展開）
              textY = node.y - (isLargeModal ? 8 : 5);
              textX = node.x + (isLargeModal ? 6 : 4) * Math.sign(sinA);
              textAnchor = sinA > 0 ? 'start' : 'end';
              dominantBaseline = 'auto';
            } else {
              // その他のノード（真上・下半分など）
              if (sinA > 0.25) {
                textAnchor = 'start';
                textX += (isLargeModal ? 4 : 2.5);
              } else if (sinA < -0.25) {
                textAnchor = 'end';
                textX -= (isLargeModal ? 4 : 2.5);
              }

              if (cosA > 0.15) {
                dominantBaseline = 'auto';
                textY -= 2;
              } else if (cosA < -0.35) {
                dominantBaseline = 'hanging';
                textY += 2;
              }
            }

            valText.setAttribute('x', textX.toFixed(1));
            valText.setAttribute('y', textY.toFixed(1));
            valText.setAttribute('text-anchor', textAnchor);
            valText.setAttribute('dominant-baseline', dominantBaseline);
            dataGroup.appendChild(valText);
          }
        });
        svg.appendChild(dataGroup);
      }

      // --- 5. 軸ラベルの描画（実績値ラベルと重ならない全自動三角関数クリアランス） ---
      const labelsGroup = document.createElementNS(SVG_NS, 'g');
      labelsGroup.setAttribute('class', 'chart-labels');

      const isLarge = this.size >= 400;
      this.metrics.forEach((metric, i) => {
        const angle = i * angleStep;
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);
        const isUpperSide = cosA > 0.05 && Math.abs(sinA) > 0.35;

        let labelX;
        let labelY;
        let labelAnchor = 'middle';
        let labelBaseline = 'central';

        if (isUpperSide) {
          // 一品単価・客数などの上半分左右軸は、実績値のさらに上側へスタック配置（SVG端切れ＆チャート被りを完全防止）
          labelX = this.cx + (this.radius + (isLarge ? 6 : 4)) * sinA;
          labelY = (this.cy - this.radius * cosA) - (isLarge ? 24 : 17);
          labelAnchor = sinA > 0 ? 'start' : 'end';
          labelBaseline = 'auto';
        } else {
          // 真上・下半分などの通常軸配置
          const horizontalExpansion = Math.abs(sinA) * 12;
          const axisOffset = 26 + horizontalExpansion + (isLarge ? 12 : 0);
          const labelDist = this.radius + axisOffset;
          const pos = polarToCartesian(this.cx, this.cy, labelDist, angle);

          labelX = pos.x;
          labelY = pos.y;

          if (sinA > 0.25) {
            labelAnchor = 'start';
          } else if (sinA < -0.25) {
            labelAnchor = 'end';
          } else {
            labelAnchor = 'middle';
          }

          if (cosA > 0.15) {
            labelBaseline = 'bottom';
          } else if (cosA < -0.35) {
            labelBaseline = 'hanging';
          } else {
            labelBaseline = 'central';
          }
        }

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', labelX.toFixed(1));
        text.setAttribute('y', labelY.toFixed(1));
        text.setAttribute('class', 'chart-axis-title');
        text.setAttribute('fill', '#94a3b8');
        text.setAttribute('font-size', isLarge ? '12px' : '10px');
        text.setAttribute('font-weight', '600');
        text.setAttribute('text-anchor', labelAnchor);
        text.setAttribute('dominant-baseline', labelBaseline);

        text.textContent = metric.shortLabel || metric.label.replace('比較日比', '');

        const titleEl = document.createElementNS(SVG_NS, 'title');
        titleEl.textContent = `${metric.label} (基準: ${metric.benchmark}%)`;
        text.appendChild(titleEl);

        labelsGroup.appendChild(text);
      });
      svg.appendChild(labelsGroup);

      this.container.appendChild(svg);
    }
  }

  root.StoreRadarChart = StoreRadarChart;

})(typeof window !== 'undefined' ? window : this);
