// ==UserScript==
// @name         微博评论IP属地筛选
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  按 IP 属地（来自 XX）筛选微博评论
// @author       Deepseek
// @match        https://weibo.com/*
// @match        https://*.weibo.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_SETTINGS = {
        targetIPs: ['北京'],
        mode: 'only-show', // 'highlight' | 'only-show'
        enabled: true
    };

    let settings = Object.assign({}, DEFAULT_SETTINGS, GM_getValue('settings', {}));

    GM_addStyle(`
        .weibo-ip-filter-highlight {
            background-color: rgba(255, 235, 59, 0.25) !important;
            border-left: 4px solid #ff9800 !important;
            padding-left: 6px !important;
        }
        .weibo-ip-filter-hidden {
            display: none !important;
        }
        #weibo-ip-filter-panel {
            position: fixed; top: 100px; right: 20px; z-index: 2147483647;
            background: #fff; border: 1px solid #ddd; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 12px; font-size: 14px; width: 280px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #333;
        }
        #weibo-ip-filter-panel h4 { margin: 0 0 8px 0; font-size: 15px; }
        #weibo-ip-filter-panel label { display: block; margin-bottom: 6px; color: #555; }
        #weibo-ip-filter-panel input[type="text"] {
            width: 100%; box-sizing: border-box; padding: 6px 8px;
            margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px;
        }
        #weibo-ip-filter-panel select {
            width: 100%; padding: 6px; margin-bottom: 8px;
            border: 1px solid #ccc; border-radius: 4px;
        }
        #weibo-ip-filter-panel button {
            padding: 6px 10px; background: #ff8200; color: #fff;
            border: none; border-radius: 4px; cursor: pointer;
            margin-right: 4px; margin-top: 4px;
        }
        #weibo-ip-filter-panel button:hover { background: #e67400; }
        #weibo-ip-filter-panel button.secondary { background: #999; }
        #weibo-ip-filter-panel button.secondary:hover { background: #777; }
        #weibo-ip-filter-status {
            margin-top: 8px; font-size: 12px; color: #ff8200; min-height: 16px;
            word-break: break-all;
        }
        #weibo-ip-filter-toggle {
            position: fixed; top: 100px; right: 20px; z-index: 2147483647;
            width: 44px; height: 44px; border-radius: 50%;
            background: #ff8200; color: #fff; border: none; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-size: 14px; font-weight: bold;
            display: flex; align-items: center; justify-content: center;
        }
        #weibo-ip-filter-toggle:hover { background: #e67400; }
    `);

    function isTargetIP(ip) {
        if (!ip) return false;
        return settings.targetIPs.some(t => ip === t || ip.includes(t) || t.includes(ip));
    }

    let hiddenCount = 0;
    let foundCount = 0;

    // 核心：直接从 .info 里抽取 "来自 XX"，并把对应的 .item1 / .item2 当作容器
    function scanComments() {
        hiddenCount = 0;
        foundCount = 0;

        // 清理旧的标记
        document.querySelectorAll('[data-weibo-ip-filter-processed]').forEach(el => {
            delete el.dataset.weiboIpFilterProcessed;
            el.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');
        });

        const infoEls = document.querySelectorAll('.info');
        const containers = new Set();

        infoEls.forEach(info => {
            const text = info.textContent || '';
            const m = text.match(/来自\s*([^\s，,。；;、]+)/);
            if (!m) return;
            const ip = m[1].trim();

            const container = info.closest('.item1, .item2');
            if (!container) return;
            if (containers.has(container)) return;
            containers.add(container);

            foundCount++;
            container.dataset.weiboIpFilterProcessed = 'true';
            container.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');

            if (!settings.enabled) return;

            const matched = isTargetIP(ip);

            if (settings.mode === 'highlight') {
                if (matched) container.classList.add('weibo-ip-filter-highlight');
            } else {
                // only-show
                if (matched) {
                    container.classList.add('weibo-ip-filter-highlight');
                } else {
                    container.classList.add('weibo-ip-filter-hidden');
                    hiddenCount++;
                }
            }
        });

        updateStatus();
    }

    function updateStatus() {
        const statusEl = document.getElementById('weibo-ip-filter-status');
        if (!statusEl) return;
        if (!settings.enabled) {
            statusEl.textContent = '筛选已关闭';
        } else if (settings.mode === 'only-show') {
            statusEl.textContent = `只显示 [${settings.targetIPs.join(', ')}]，已隐藏 ${hiddenCount} / 共 ${foundCount} 条`;
        } else {
            statusEl.textContent = `高亮 [${settings.targetIPs.join(', ')}]，共 ${foundCount} 条`;
        }
    }

    function resetAndRescan() {
        document.querySelectorAll('[data-weibo-ip-filter-processed]').forEach(el => {
            delete el.dataset.weiboIpFilterProcessed;
            el.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');
        });
        scanComments();
    }

    let scanTimeout = null;
    function debouncedScan() {
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(scanComments, 300);
    }

    const observer = new MutationObserver(() => debouncedScan());

    function createPanel() {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'weibo-ip-filter-toggle';
        toggleBtn.textContent = 'IP';
        toggleBtn.title = '微博IP筛选设置';
        toggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('weibo-ip-filter-panel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.body.appendChild(toggleBtn);

        const panel = document.createElement('div');
        panel.id = 'weibo-ip-filter-panel';
        panel.innerHTML = `
            <h4>微博评论IP筛选</h4>
            <label>目标IP属地（逗号分隔）</label>
            <input type="text" id="weibo-ip-target" value="${settings.targetIPs.join(',')}" placeholder="例如：北京,上海">
            <label>筛选模式</label>
            <select id="weibo-ip-mode">
                <option value="highlight" ${settings.mode === 'highlight' ? 'selected' : ''}>高亮匹配IP</option>
                <option value="only-show" ${settings.mode === 'only-show' ? 'selected' : ''}>只显示匹配IP</option>
            </select>
            <label>
                <input type="checkbox" id="weibo-ip-enabled" ${settings.enabled ? 'checked' : ''}> 启用筛选
            </label>
            <div>
                <button id="weibo-ip-only-show">只看匹配IP</button>
                <button id="weibo-ip-rescan" class="secondary">重新扫描</button>
                <button id="weibo-ip-reset" class="secondary">重置</button>
            </div>
            <div id="weibo-ip-filter-status"></div>
        `;
        document.body.appendChild(panel);
        panel.style.display = 'none';

        document.getElementById('weibo-ip-only-show').addEventListener('click', () => {
            const targetStr = document.getElementById('weibo-ip-target').value.trim();
            settings.targetIPs = targetStr ? targetStr.split(',').map(s => s.trim()).filter(Boolean) : [];
            settings.mode = 'only-show';
            settings.enabled = true;
            GM_setValue('settings', settings);
            document.getElementById('weibo-ip-mode').value = 'only-show';
            document.getElementById('weibo-ip-enabled').checked = true;
            resetAndRescan();
        });

        document.getElementById('weibo-ip-rescan').addEventListener('click', () => resetAndRescan());

        document.getElementById('weibo-ip-reset').addEventListener('click', () => {
            settings.enabled = false;
            GM_setValue('settings', settings);
            document.getElementById('weibo-ip-enabled').checked = false;
            resetAndRescan();
        });

        document.getElementById('weibo-ip-mode').addEventListener('change', (e) => {
            settings.mode = e.target.value;
            GM_setValue('settings', settings);
            resetAndRescan();
        });
        document.getElementById('weibo-ip-enabled').addEventListener('change', (e) => {
            settings.enabled = e.target.checked;
            GM_setValue('settings', settings);
            resetAndRescan();
        });
        document.getElementById('weibo-ip-target').addEventListener('change', (e) => {
            const targetStr = e.target.value.trim();
            settings.targetIPs = targetStr ? targetStr.split(',').map(s => s.trim()).filter(Boolean) : [];
            GM_setValue('settings', settings);
            resetAndRescan();
        });
    }

    function init() {
        createPanel();
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(scanComments, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
