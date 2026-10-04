// ==UserScript==
// @name         微博评论IP属地筛选 + 性别筛选
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  按IP属地筛选微博评论，自动抓取所有评论、获取用户性别、结果列表跳转、导出CSV
// @author       You
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
        mode: 'only-show',
        enabled: true
    };

    let settings = Object.assign({}, DEFAULT_SETTINGS, GM_getValue('settings', {}));

    const collectedMap = new Map();
    const genderCache = new Map();
    let isCollecting = false;
    let stopCollecting = false;
    let genderFetching = false;

    GM_addStyle(`
        .weibo-ip-filter-highlight {
            background-color: rgba(255, 235, 59, 0.25) !important;
            border-left: 4px solid #ff9800 !important;
            padding-left: 6px !important;
        }
        .weibo-ip-filter-hidden { display: none !important; }
        #weibo-ip-filter-panel {
            position: fixed; top: 60px; right: 20px; z-index: 2147483647;
            background: #fff; border: 1px solid #ddd; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 12px; font-size: 13px; width: 380px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #333;
            max-height: calc(100vh - 80px);
            display: flex; flex-direction: column;
        }
        #weibo-ip-filter-panel h4 { margin: 0 0 8px 0; font-size: 14px; }
        #weibo-ip-filter-panel label { display: block; margin-bottom: 4px; color: #555; }
        #weibo-ip-filter-panel input[type="text"] {
            width: 100%; box-sizing: border-box; padding: 5px 8px;
            margin-bottom: 6px; border: 1px solid #ccc; border-radius: 4px;
            font-size: 13px;
        }
        #weibo-ip-filter-panel select {
            width: 100%; padding: 5px; margin-bottom: 6px;
            border: 1px solid #ccc; border-radius: 4px;
            font-size: 13px;
        }
        #weibo-ip-filter-panel button {
            padding: 5px 10px; background: #ff8200; color: #fff;
            border: none; border-radius: 4px; cursor: pointer;
            margin-right: 4px; margin-top: 4px;
            font-size: 12px;
        }
        #weibo-ip-filter-panel button:hover { background: #e67400; }
        #weibo-ip-filter-panel button:disabled { background: #ccc; cursor: not-allowed; }
        #weibo-ip-filter-panel button.secondary { background: #999; }
        #weibo-ip-filter-panel button.secondary:hover { background: #777; }
        .wipe-section {
            border-top: 1px solid #eee;
            padding-top: 8px;
            margin-top: 8px;
        }
        #weibo-ip-filter-status {
            margin-top: 6px; font-size: 12px; color: #ff8200; min-height: 14px;
            word-break: break-all;
        }
        #wipe-collect-status {
            margin-top: 6px; font-size: 12px; color: #666;
        }
        #wipe-results-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-top: 8px; font-size: 12px;
        }
        #wipe-filters {
            display: flex; align-items: center; gap: 6px; margin-top: 6px;
            font-size: 12px;
        }
        #wipe-filters select {
            margin: 0; padding: 3px 6px; font-size: 12px;
            height: 24px;
            width: auto;
        }
        #wipe-ip-hint {
            font-size: 11px; color: #999;
            margin-left: auto;
        }
        #wipe-ip-hint b { color: #ff8200; }
        #wipe-results-list {
            flex: 1;
            overflow-y: auto;
            overscroll-behavior: contain;
            margin-top: 6px;
            border: 1px solid #eee;
            border-radius: 4px;
            max-height: 380px;
            min-height: 100px;
        }
        #wipe-results-list::-webkit-scrollbar { width: 6px; }
        #wipe-results-list::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        #wipe-results-list::-webkit-scrollbar-thumb:hover { background: #999; }
        .wipe-result-item {
            display: flex; gap: 8px; padding: 6px 8px;
            border-bottom: 1px solid #f5f5f5; cursor: pointer;
            align-items: flex-start;
        }
        .wipe-result-item:hover { background: #fafafa; }
        .wipe-result-avatar {
            width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
            object-fit: cover;
        }
        .wipe-result-info { flex: 1; min-width: 0; }
        .wipe-result-line1 {
            display: flex; align-items: center; gap: 5px;
            font-size: 12px; margin-bottom: 2px;
        }
        .wipe-result-name {
            font-weight: 500; color: #333;
            max-width: 100px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
        }
        .wipe-result-gender {
            font-size: 11px; padding: 0 4px; border-radius: 3px;
            background: #eee; color: #666;
        }
        .wipe-result-gender.m { color: #4a90e2; background: #e8f0fe; }
        .wipe-result-gender.f { color: #e91e63; background: #fce4ec; }
        .wipe-result-ip {
            font-size: 11px; color: #ff8200;
            background: #fff5e6; padding: 0 4px; border-radius: 3px;
        }
        .wipe-result-text {
            font-size: 12px; color: #888; line-height: 1.4;
            display: -webkit-box; -webkit-line-clamp: 2;
            -webkit-box-orient: vertical; overflow: hidden;
            word-break: break-all;
        }
        #weibo-ip-filter-toggle {
            position: fixed; top: 60px; right: 20px; z-index: 2147483647;
            width: 44px; height: 44px; border-radius: 50%;
            background: #ff8200; color: #fff; border: none; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-size: 14px; font-weight: bold;
            display: flex; align-items: center; justify-content: center;
        }
        #weibo-ip-filter-toggle:hover { background: #e67400; }
    `);

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function findScrollable() {
        let el = document.getElementById('scroller');
        while (el && el !== document.body) {
            const style = getComputedStyle(el);
            if (/(auto|scroll)/.test(style.overflowY) &&
                el.scrollHeight > el.clientHeight + 20) {
                return el;
            }
            el = el.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function isTargetIP(ip) {
        if (!ip) return false;
        return settings.targetIPs.some(t => ip === t || ip.includes(t) || t.includes(ip));
    }

    // ===================== 实时筛选 =====================
    let hiddenCount = 0;
    let foundCount = 0;

    function scanComments() {
        hiddenCount = 0; foundCount = 0;

        document.querySelectorAll('[data-weibo-ip-filter-processed]').forEach(el => {
            delete el.dataset.weiboIpFilterProcessed;
            el.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');
        });

        const containers = new Set();
        document.querySelectorAll('.info').forEach(info => {
            const m = (info.textContent || '').match(/来自\s*([^\s，,。；;、]+)/);
            if (!m) return;
            const ip = m[1].trim();
            const container = info.closest('.item1, .item2');
            if (!container || containers.has(container)) return;
            containers.add(container);
            foundCount++;

            container.dataset.weiboIpFilterProcessed = 'true';
            container.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');
            if (!settings.enabled) return;
            const matched = isTargetIP(ip);
            if (settings.mode === 'highlight') {
                if (matched) container.classList.add('weibo-ip-filter-highlight');
            } else {
                if (matched) container.classList.add('weibo-ip-filter-highlight');
                else { container.classList.add('weibo-ip-filter-hidden'); hiddenCount++; }
            }
        });

        updateStatus();
    }

    function updateStatus() {
        const el = document.getElementById('weibo-ip-filter-status');
        if (!el) return;
        if (!settings.enabled) el.textContent = '筛选已关闭';
        else if (settings.mode === 'only-show')
            el.textContent = `只显示 [${settings.targetIPs.join(', ')}]，已隐藏 ${hiddenCount} / 共 ${foundCount} 条`;
        else
            el.textContent = `高亮 [${settings.targetIPs.join(', ')}]，共 ${foundCount} 条`;
    }

    function resetAndRescan() {
        document.querySelectorAll('[data-weibo-ip-filter-processed]').forEach(el => {
            delete el.dataset.weiboIpFilterProcessed;
            el.classList.remove('weibo-ip-filter-highlight', 'weibo-ip-filter-hidden');
        });
        scanComments();
    }

    // ===================== 收集评论 =====================
    function collectVisibleComments() {
        let added = 0;
        document.querySelectorAll('.info').forEach(info => {
            const m = (info.textContent || '').match(/来自\s*([^\s，,。；;、]+)/);
            if (!m) return;
            const ip = m[1].trim();
            const container = info.closest('.item1, .item2');
            if (!container) return;

            const cidEl = container.querySelector('[data-cid]');
            const cidRaw = cidEl ? cidEl.getAttribute('data-cid') : null;

            const userLink = container.querySelector('a[usercard]');
            const uid = userLink ? userLink.getAttribute('usercard') : null;
            const nickname = userLink ? userLink.textContent.trim() : '';
            const avatarImg = container.querySelector('.woo-avatar-img');
            const avatar = avatarImg ? (avatarImg.src || '') : '';

            const textEl = container.querySelector('.con1 .text, .con2 .text');
            let text = '';
            if (textEl) {
                const clone = textEl.cloneNode(true);
                clone.querySelectorAll('a[usercard]').forEach(a => a.remove());
                text = clone.textContent.trim().replace(/^[：:]\s*/, '');
            }

            if (!uid) return;
            const cid = cidRaw || ('u_' + uid + '_' + ip + '_' + text.slice(0, 20));
            if (collectedMap.has(cid)) return;

            collectedMap.set(cid, {
                cid, uid, nickname, avatar, ip, text,
                gender: null, genderFetched: false
            });
            added++;
        });
        return added;
    }

    async function autoScrollAndCollect(onProgress) {
        isCollecting = true;
        stopCollecting = false;

        const scroller = findScrollable();
        const isWindow = scroller === document.scrollingElement || scroller === document.documentElement;

        let lastHeight = 0;
        let stableCount = 0;
        let rounds = 0;
        const MAX_ROUNDS = 500;

        while (!stopCollecting && stableCount < 5 && rounds < MAX_ROUNDS) {
            collectVisibleComments();
            onProgress && onProgress(collectedMap.size, rounds);

            const step = Math.max(400, (isWindow ? window.innerHeight : scroller.clientHeight) * 0.8);
            if (isWindow) window.scrollBy(0, step);
            else scroller.scrollTop = Math.min(scroller.scrollTop + step, scroller.scrollHeight);

            await sleep(500);
            rounds++;

            const h = isWindow ? document.body.scrollHeight : scroller.scrollHeight;
            if (h === lastHeight) stableCount++;
            else stableCount = 0;
            lastHeight = h;
        }

        collectVisibleComments();
        isCollecting = false;
        return collectedMap.size;
    }

    // ===================== 获取性别 =====================
    async function fetchGender(uid) {
        if (!uid) return null;
        if (genderCache.has(uid)) return genderCache.get(uid);

        try {
            const res = await fetch(`https://weibo.com/ajax/profile/info?uid=${uid}`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json, text/plain, */*' }
            });
            if (!res.ok) { genderCache.set(uid, null); return null; }
            const data = await res.json();
            const g = data && data.data && data.data.user ? data.data.user.gender : null;
            const result = (g === 'm' || g === 'f') ? g : null;
            genderCache.set(uid, result);
            return result;
        } catch (e) {
            genderCache.set(uid, null);
            return null;
        }
    }

    async function fetchAllGenders(onProgress) {
        genderFetching = true;

        const uidSet = new Set();
        collectedMap.forEach(c => {
            if (c.uid && !c.genderFetched) uidSet.add(c.uid);
        });
        const uids = Array.from(uidSet);

        let done = 0;
        const CONCURRENCY = 3;
        const total = uids.length;

        async function worker() {
            while (uids.length > 0) {
                const uid = uids.shift();
                if (!uid) break;
                const g = await fetchGender(uid);
                collectedMap.forEach(c => {
                    if (c.uid === uid) { c.gender = g; c.genderFetched = true; }
                });
                done++;
                onProgress && onProgress(done, total);
            }
        }

        const workers = [];
        for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
        await Promise.all(workers);

        genderFetching = false;
    }

    // ===================== 结果过滤 + 渲染 =====================
    // 关键变更：IP 过滤直接使用顶部输入框的 settings.targetIPs
    function getFilteredResults() {
        const genderFilter = document.getElementById('wipe-gender-filter').value;

        let arr = Array.from(collectedMap.values());
        if (genderFilter === 'm') arr = arr.filter(c => c.gender === 'm');
        else if (genderFilter === 'f') arr = arr.filter(c => c.gender === 'f');

        // IP 过滤复用顶部输入框
        if (settings.targetIPs.length > 0) {
            arr = arr.filter(c => c.ip && isTargetIP(c.ip));
        }
        return arr;
    }

    function updateIPHint() {
        const hintEl = document.getElementById('wipe-ip-hint');
        if (!hintEl) return;
        if (settings.targetIPs.length === 0) {
            hintEl.innerHTML = 'IP: <b>未设置</b>';
        } else {
            hintEl.innerHTML = 'IP: <b>' + escapeHtml(settings.targetIPs.join(', ')) + '</b>';
        }
    }

    function renderResults() {
        const listEl = document.getElementById('wipe-results-list');
        if (!listEl) return;

        updateIPHint();
        const arr = getFilteredResults();

        const countEl = document.getElementById('wipe-result-count');
        if (countEl) countEl.textContent = arr.length;

        if (arr.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:12px;">暂无匹配结果</div>';
            return;
        }

        const oldScroll = listEl.scrollTop;

        listEl.innerHTML = arr.map(c => {
            const gClass = c.gender === 'm' ? 'm' : c.gender === 'f' ? 'f' : '';
            const gText = c.gender === 'm' ? '♂' : c.gender === 'f' ? '♀' : '?';
            return `
                <div class="wipe-result-item" data-uid="${escapeHtml(c.uid || '')}" title="点击打开用户主页">
                    <img class="wipe-result-avatar" src="${escapeHtml(c.avatar)}" loading="lazy">
                    <div class="wipe-result-info">
                        <div class="wipe-result-line1">
                            <span class="wipe-result-name" title="${escapeHtml(c.nickname)}">${escapeHtml(c.nickname)}</span>
                            <span class="wipe-result-gender ${gClass}">${gText}</span>
                            <span class="wipe-result-ip">${escapeHtml(c.ip)}</span>
                        </div>
                        <div class="wipe-result-text">${escapeHtml(c.text)}</div>
                    </div>
                </div>
            `;
        }).join('');

        listEl.scrollTop = oldScroll;
    }

    // ===================== 导出 CSV =====================
    function exportResults() {
        const arr = getFilteredResults();
        if (arr.length === 0) {
            alert('当前筛选结果为空，无法导出');
            return;
        }

        const headers = ['昵称', '性别', 'IP属地', '评论内容', '用户主页'];
        const rows = arr.map(c => {
            const genderText = c.gender === 'm' ? '男' : c.gender === 'f' ? '女' : '';
            return [
                c.nickname || '',
                genderText,
                c.ip || '',
                c.text || '',
                c.uid ? 'https://weibo.com/u/' + c.uid : ''
            ];
        });

        const csvBody = [headers, ...rows].map(row =>
            row.map(cell => {
                let s = String(cell == null ? '' : cell);
                s = s.replace(/"/g, '""');
                if (/[",\n\r]/.test(s)) s = '"' + s + '"';
                return s;
            }).join(',')
        ).join('\r\n');

        const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });

        const date = new Date();
        const stamp = date.getFullYear() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0') + '_' +
            String(date.getHours()).padStart(2, '0') +
            String(date.getMinutes()).padStart(2, '0') +
            String(date.getSeconds()).padStart(2, '0');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `微博评论筛选_${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ===================== 结果列表滚动 =====================
    function setupListScroll() {
        const listEl = document.getElementById('wipe-results-list');
        if (!listEl) return;

        listEl.addEventListener('wheel', (e) => {
            e.stopPropagation();

            const atTop = listEl.scrollTop <= 0;
            const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 1;
            const scrollingUp = e.deltaY < 0;
            const scrollingDown = e.deltaY > 0;

            if ((scrollingUp && atTop) || (scrollingDown && atBottom)) return;

            e.preventDefault();
            listEl.scrollTop += e.deltaY;
        }, { passive: false, capture: true });

        listEl.addEventListener('mousedown', (e) => e.stopPropagation());
        listEl.addEventListener('mouseup', (e) => e.stopPropagation());
    }

    // ===================== 面板 UI =====================
    function createPanel() {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'weibo-ip-filter-toggle';
        toggleBtn.textContent = 'IP';
        toggleBtn.title = '微博IP筛选';
        toggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('weibo-ip-filter-panel');
            if (panel) { panel.style.display = 'flex'; toggleBtn.style.display = 'none'; }
        });
        document.body.appendChild(toggleBtn);

        const panel = document.createElement('div');
        panel.id = 'weibo-ip-filter-panel';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h4 style="margin:0;">微博评论IP筛选 v3.2</h4>
                <button id="wipe-close" style="background:none;color:#999;padding:2px 8px;margin:0;font-size:18px;line-height:1;">×</button>
            </div>

            <label>目标IP属地（逗号分隔，同时作用于实时筛选与下方结果列表）</label>
            <input type="text" id="weibo-ip-target" value="${escapeHtml(settings.targetIPs.join(','))}" placeholder="例如：北京,上海">

            <label>筛选模式</label>
            <select id="weibo-ip-mode">
                <option value="highlight" ${settings.mode === 'highlight' ? 'selected' : ''}>高亮匹配IP</option>
                <option value="only-show" ${settings.mode === 'only-show' ? 'selected' : ''}>只显示匹配IP</option>
            </select>

            <label>
                <input type="checkbox" id="weibo-ip-enabled" ${settings.enabled ? 'checked' : ''}> 启用实时筛选
            </label>

            <div>
                <button id="weibo-ip-only-show">只看匹配IP</button>
                <button id="weibo-ip-rescan" class="secondary">重新扫描</button>
                <button id="weibo-ip-reset" class="secondary">重置</button>
            </div>

            <div id="weibo-ip-filter-status"></div>

            <div class="wipe-section">
                <h4>抓取全部评论 + 性别筛选</h4>
                <div>
                    <button id="wipe-start">🔄 自动抓取全部</button>
                    <button id="wipe-stop" class="secondary" disabled>停止</button>
                    <button id="wipe-fetch-gender">获取性别</button>
                    <button id="wipe-clear" class="secondary">清空</button>
                    <button id="wipe-export" class="secondary">📥 导出CSV</button>
                </div>
                <div id="wipe-collect-status">未开始</div>

                <div id="wipe-results-header">
                    <span>共收集 <b id="wipe-total-count">0</b> 条，筛选后 <b id="wipe-result-count">0</b> 条</span>
                </div>

                <div id="wipe-filters">
                    <span>性别:</span>
                    <select id="wipe-gender-filter">
                        <option value="all">全部</option>
                        <option value="m">男</option>
                        <option value="f">女</option>
                    </select>
                    <span id="wipe-ip-hint">IP: <b>北京</b></span>
                </div>

                <div id="wipe-results-list">
                    <div style="padding:20px;text-align:center;color:#999;font-size:12px;">点击"自动抓取全部"开始收集评论</div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        panel.style.display = 'none';

        document.getElementById('wipe-close').addEventListener('click', () => {
            panel.style.display = 'none';
            toggleBtn.style.display = 'flex';
        });

        document.getElementById('weibo-ip-only-show').addEventListener('click', () => {
            const targetStr = document.getElementById('weibo-ip-target').value.trim();
            settings.targetIPs = targetStr ? targetStr.split(',').map(s => s.trim()).filter(Boolean) : [];
            settings.mode = 'only-show';
            settings.enabled = true;
            GM_setValue('settings', settings);
            document.getElementById('weibo-ip-mode').value = 'only-show';
            document.getElementById('weibo-ip-enabled').checked = true;
            resetAndRescan();
            renderResults(); // 结果列表同步刷新
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

        // 顶部 IP 输入框：改动后同时刷新实时筛选 + 结果列表
        const targetInput = document.getElementById('weibo-ip-target');
        function onTargetChanged() {
            const targetStr = targetInput.value.trim();
            settings.targetIPs = targetStr ? targetStr.split(',').map(s => s.trim()).filter(Boolean) : [];
            GM_setValue('settings', settings);
            resetAndRescan();
            renderResults(); // ★ 结果列表复用同一个输入框
        }
        targetInput.addEventListener('change', onTargetChanged);
        targetInput.addEventListener('input', () => {
            // 输入时也同步，体验更跟手（列表筛选是纯前端过滤，不卡）
            onTargetChanged();
        });

        // ---- 抓取按钮 ----
        const startBtn = document.getElementById('wipe-start');
        const stopBtn = document.getElementById('wipe-stop');
        const fetchGenderBtn = document.getElementById('wipe-fetch-gender');
        const clearBtn = document.getElementById('wipe-clear');
        const exportBtn = document.getElementById('wipe-export');
        const collectStatus = document.getElementById('wipe-collect-status');
        const totalCountEl = document.getElementById('wipe-total-count');

        function updateTotalCount() { totalCountEl.textContent = collectedMap.size; }

        startBtn.addEventListener('click', async () => {
            if (isCollecting) return;
            startBtn.disabled = true;
            stopBtn.disabled = false;

            collectVisibleComments();
            updateTotalCount();
            renderResults();

            await autoScrollAndCollect((count, rounds) => {
                collectStatus.textContent = `抓取中… 第 ${rounds} 轮，已收集 ${count} 条`;
                updateTotalCount();
            });

            startBtn.disabled = false;
            stopBtn.disabled = true;
            collectStatus.textContent = `抓取完成，共 ${collectedMap.size} 条。开始获取性别…`;
            updateTotalCount();
            renderResults();

            if (collectedMap.size > 0) await doFetchGenders();
        });

        stopBtn.addEventListener('click', () => {
            stopCollecting = true;
            collectStatus.textContent = '正在停止…';
        });

        async function doFetchGenders() {
            if (genderFetching) return;
            if (collectedMap.size === 0) {
                collectStatus.textContent = '还没有收集到评论';
                return;
            }
            fetchGenderBtn.disabled = true;
            await fetchAllGenders((done, total) => {
                collectStatus.textContent = `获取性别中… ${done}/${total}`;
            });
            fetchGenderBtn.disabled = false;
            collectStatus.textContent = `完成！共收集 ${collectedMap.size} 条评论`;
            renderResults();
        }

        fetchGenderBtn.addEventListener('click', doFetchGenders);

        clearBtn.addEventListener('click', () => {
            if (collectedMap.size === 0) return;
            if (!confirm(`确定清空已收集的 ${collectedMap.size} 条评论吗？`)) return;
            collectedMap.clear();
            renderResults();
            updateTotalCount();
            collectStatus.textContent = '已清空';
        });

        exportBtn.addEventListener('click', exportResults);

        document.getElementById('wipe-gender-filter').addEventListener('change', renderResults);

        document.getElementById('wipe-results-list').addEventListener('click', (e) => {
            const item = e.target.closest('.wipe-result-item');
            if (!item) return;
            const uid = item.dataset.uid;
            if (uid) window.open('https://weibo.com/u/' + uid, '_blank');
        });

        setupListScroll();

        // 初次渲染，同步一次 IP 提示
        updateIPHint();
    }

    // ===================== 初始化 =====================
    let scanTimeout = null;
    function debouncedScan() {
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(scanComments, 300);
    }
    const observer = new MutationObserver(() => debouncedScan());

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