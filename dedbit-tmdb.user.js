// ==UserScript==
// @name         Dedbit: TMDb Posters+Ratings (FAST,v1.8 full)
// @namespace    yourname.dedbit.tmdb.fast
// @version      1.8
// @description  Movie/TV poster+rating: ENG-only strict matching, year boost, hover zoom, TV uses detail poster, Movie fallback to detail poster if TMDb misses
// @match        https://www.dedbit.com/*
// @match        http://www.dedbit.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// ==/UserScript==
(function () {
  'use strict';

  // ===== CONFIG =====
  const USE_STORAGE_KEY = true;
  const STORAGE_KEY_NAME = 'tmdb_api_key';
  const HARDCODED_TMDB_KEY = '';
  const IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';
  const CONCURRENCY = 6;
  const MAX_ITEMS = 300;
  const CACHE_TTL_MS = 14 * 24 * 3600 * 1000;
  const CACHE_NS = 'tmdb_cache_v3:'; // cache namespace
  const ACCEPT_THRESHOLD = 0.35;
  const MAX_TRIES = 10;

  const DEBUG_SHOW_NEAR_TITLE = true;
  const DEBUG_LOG = false;

  // ===== Hotkey: set API key =====
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
      const cur = GM_getValue(STORAGE_KEY_NAME, '');
      const input = prompt('ใส่ TMDb API Key:', cur || '');
      if (input !== null) {
        GM_setValue(STORAGE_KEY_NAME, input.trim());
        alert('บันทึกแล้ว! รีเฟรชหน้า');
      }
    }
  });

  const TMDB_KEY = (USE_STORAGE_KEY ? GM_getValue(STORAGE_KEY_NAME, '') : HARDCODED_TMDB_KEY).trim();
  if (!TMDB_KEY) console.warn('[Dedbit TMDb] ยังไม่ตั้งค่า TMDb API key (Ctrl+Alt+D)');

  // ===== STYLE =====
  GM_addStyle(`
    td.catpic { position: relative; }
    .tmdb-poster {
      width:120px; height:150px; object-fit:cover;
      border-radius:4px; border:1px solid rgba(255,255,255,.2);
      display:block; margin:auto; background:#111;
      transition: transform 0.25s ease-in-out, box-shadow 0.25s ease-in-out;
      cursor: zoom-in;
    }
    .tmdb-poster:hover {
      transform: scale(2.2);
      z-index: 9999;
      box-shadow: 0 8px 20px rgba(0,0,0,0.6);
      position: relative;
    }
    .tmdb-badge { display:inline-block; padding:2px 6px; border-radius:6px; font-size:12px; font-weight:600; background:#232324; color:#fff; line-height:1; border:1px solid rgba(255,255,255,.12); }
    .tmdb-badge--good { background:#1e7c39; } .tmdb-badge--ok { background:#6b6f1b; } .tmdb-badge--bad { background:#7c1e1e; }
    .tmdb-badge-overlay { position:absolute; right:4px; bottom:4px; opacity:.95; }
    .tmdb-skel { width:120px; height:150px; border-radius:4px; background:linear-gradient(90deg,#2a2a2a 0%,#3a3a3a 50%,#2a2a2a 100%); background-size:200% 100%; animation: tmdbSh 1.2s linear infinite; margin:auto; }
    @keyframes tmdbSh { 0%{background-position:0% 0} 100%{background-position:200% 0} }
    .tmdb-dbg { margin-left:6px; padding:0 6px; border-radius:4px; border:1px dashed rgba(255,255,255,.25); font-size:11px; color:#9aa; opacity:.8; cursor:help; }
  `);

  // ===== CATEGORY CHECK =====
  const FORCE_TV    = /browse\.php\?cat=7/.test(location.href);
  const FORCE_MOVIE = /browse\.php\?cat=35/.test(location.href);

  // ===== DOM PICKER =====
  function findTitleLinks() {
    let nodes = Array.from(document.querySelectorAll('table.torrenttable tr td[align="left"] a[href*="details.php?id="]'));
    if (!nodes.length) nodes = Array.from(document.querySelectorAll('table a[href*="details"]'));
    return nodes.slice(0, MAX_ITEMS);
  }
  function setSkeleton(row) {
    const td = row.querySelector('td.catpic');
    if (td) td.innerHTML = `<div class="tmdb-skel"></div>`;
  }

  // ===== Fetch poster from details page (used for TV and movie fallback) =====
  async function fetchDetailPoster(detailsUrl){
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET', url: detailsUrl,
        onload: (res) => {
          try {
            const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
            const imgs = Array.from(doc.querySelectorAll('td.desc img[src]'));
            // pick first non-site icon
            const poster = imgs.find(img => img.src && !img.src.includes('/pic/'));
            resolve(poster ? poster.src : (imgs[0]?.src || null));
          } catch { resolve(null); }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }
  async function renderTVResult(row, a) {
    const td = row.querySelector('td.catpic'); if (!td) return;
    td.innerHTML = `<div class="tmdb-skel"></div>`;
    const posterUrl = await fetchDetailPoster(a.href);
    td.innerHTML = '';
    if (posterUrl) {
      const img = document.createElement('img');
      img.className = 'tmdb-poster';
      img.src = posterUrl;
      img.loading = 'lazy';
      td.appendChild(img);
    } else {
      td.innerHTML = '<span style="font-size:12px;color:#aaa;">N/A</span>';
    }
  }

  // ===== CLEAN / VARIANTS (ENG-only) =====
  const TOKENS = /\b(1080p|2160p|720p|480p|4K|8K|WEB[- ]?DL|WEBRip|BluRay|BRRip|HDRip|DVDRip|HEVC|x264|x265|AV1|UHD|IMAX|Remux|Remastered|Restored|Extended|Edition|Director'?s\sCut|Special\sEdition|Unrated|Criterion|Atmos|AAC|HDR|7 1|DTS|DDP?|TRUEHD|Dual\sAudio|MULTI|HC|CAM|TS|R5|SDR|DS4K|Mini|HYBRID\+?|AMZN|10Bit|H\s?264|HD|ESTB|5 1|MA|WebDL|NETFLIX|Season|S\d{1,2}E\d{1,3}|Ep|Episode|ตอนที่|จบ)\b/ig;
  const EN_STOP = new Set(['the','a','an','of','and','with','for','in','on','at','to','from','into','by','part','chapter','episode','season','movie','film']);

  function normalizeDigits(s){const map={'๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9'};return (s||'').replace(/[\u0E50-\u0E59]/g,ch=>map[ch]||ch);}
  function stripParensExceptYear(s){return s.replace(/\((?!\d{4}\b)[^)]+\)/g,' ');}
  function cleanNoise(s){
    return stripParensExceptYear(
      normalizeDigits(s)
        .replace(/\[[^\]]+\]/g,' ')
        .replace(TOKENS,' ')
        .replace(/[\u0E00-\u0E7F]+/g,' ')
        .replace(/\s+/g,' ')
        .trim()
    );
  }
  function yearFrom(raw){const m=normalizeDigits(raw).match(/\b(19[3-9]\d|20[0-4]\d|2050)\b/);return m?parseInt(m[1],10):undefined;}
  function onlyEnglishSideParts(raw){return raw.split('|').map(s=>s.trim()).filter(s=>/[a-z]/i.test(s));}
  function colonVariants(t){const w=t.split(' ').filter(Boolean),v=[];if(w.length>=3){v.push(w[0]+': '+w.slice(1).join(' '));v.push(w.slice(0,2).join(' ')+': '+w.slice(2).join(' '));}return v;}
  function joinPairVariants(t){const w=t.split(' ').filter(Boolean),v=[];if(w.length>=2){const last2=w.slice(-2).join('');v.push(w.slice(0,-2).concat(last2).join(' '));}return v;}
  function dropGenericSuffix(t){return t.replace(/\b(the\s+movie|the\s+film)\b/ig,'').trim();}
  function stripLeadingNumber(raw){return raw.replace(/^\s*\d{1,2}\s+/,'');}

  function variantsFrom(raw){
    raw = stripLeadingNumber(raw);
    const year = yearFrom(raw);
    const bases = onlyEnglishSideParts(raw);
    if(!bases.length) bases.push(raw);

    const out=[];
    for(const c0 of bases){
      const c=dropGenericSuffix(c0);
      const t0=cleanNoise(c);
      const t=year?t0.replace(new RegExp(`\\b${year}\\b`),' ').trim():t0;
      if(!t) continue;

      out.push({title:t,year},{title:t});

      if(/\band\b/i.test(t)){const amp=t.replace(/\band\b/ig,'&');if(amp!==t) out.push({title:amp,year},{title:amp});}
      if(/season\s+\d+/i.test(t)){const noSeason=t.replace(/\bseason\s+\d+\b/ig,'').trim();if(noSeason) out.push({title:noSeason,year},{title:noSeason});}

      const beforeParen=c.split('(')[0].trim();
      if(beforeParen.length>1){const bp=cleanNoise(dropGenericSuffix(beforeParen));if(bp) out.push({title:bp,year},{title:bp});}

      const words=t.split(' ');
      if(words.length>2) out.push({title:words.slice(0,-1).join(' '),year});

      for(const cv of colonVariants(t)) out.push({title:cv,year},{title:cv});
      for(const jv of joinPairVariants(t)) out.push({title:jv,year},{title:jv});

      const short3=words.slice(0,3).join(' ');
      if(short3&&short3!==t) out.push({title:short3,year},{title:short3});
    }

    const seen=new Set(),dedup=[];
    for(const v of out){
      const k=(v.title+'|'+(v.year||'')).toLowerCase();
      if(!seen.has(k)){seen.add(k);dedup.push(v);}
      if(dedup.length>=5) break;
    }
    return dedup;
  }

  // ===== SCORING =====
  function tokens(s){return normalizeDigits((s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ')).split(/\s+/).filter(Boolean).filter(x=>!EN_STOP.has(x));}
  function bigrams(arr){const out=new Set();for(let i=0;i<arr.length-1;i++) out.add(arr[i]+' '+arr[i+1]);return out;}
  function releaseYearOf(r){const d=r.release_date||r.first_air_date||'';const m=d.match(/^(\d{4})/);return m?parseInt(m[1],10):undefined;}
  function normalizeTitleSimple(s){return normalizeDigits((s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').trim());}
  function collapsed(s){return normalizeDigits((s||'').toLowerCase().replace(/[^a-z0-9]+/g,''));}

  function matchScore(qTitle,qYear,r){
    const qt=tokens(qTitle),cand=tokens(r.title||r.name||r.original_title||r.original_name||'');
    const setQ=new Set(qt),setC=new Set(cand);

    // guard สำหรับชื่อสั้นมาก
    if(qt.length<=2){
      const qCol=collapsed(qTitle),nCol=collapsed(r.title||r.name||r.original_title||r.original_name||'');
      if(qCol.length>=6&&!nCol.includes(qCol)) return -1;
    }

    let inter=0; setQ.forEach(t=>{if(setC.has(t)) inter++;});
    const jacc=inter/Math.max(1,new Set([...qt,...cand]).size);
    const dice=(2*inter)/Math.max(1,(qt.length+cand.length));
    const bQ=bigrams(qt), bC=bigrams(cand);
    let bInter=0; bQ.forEach(b=>{ if(bC.has(b)) bInter++; });
    const bScore=bInter/Math.max(1,Math.min(bQ.size,bC.size));

    const ry=releaseYearOf(r);
    let yearS=0;
    if(qYear&&ry){
      const diff=Math.abs(qYear-ry);
      yearS = diff===0 ? 1 : diff===1 ? 0.65 : diff===2 ? 0.35 : -0.4;
    }

    let score=(jacc*0.5+dice*0.5)*0.6 + bScore*0.15 + yearS*0.25;
    if(qYear && ry===qYear) score+=0.5; // year ตรงเป๊ะ boost
    return score;
  }

  function strictExactPick(list, qTitle, qYear){
    const qNorm = normalizeTitleSimple(qTitle);
    for (const r of list) {
      const n = normalizeTitleSimple(r.title||r.name||r.original_title||r.original_name||'');
      if (!n || n !== qNorm) continue;
      if (qYear && releaseYearOf(r) !== qYear) continue;
      return r;
    }
    return null;
  }

  // ===== CACHE =====
  const memCache = new Map();
  function cacheKey(raw){
    return cleanNoise(raw).toLowerCase() + '|' + (yearFrom(raw)||'');
  }
  function readPersistent(k){
    try{
      const j=GM_getValue(CACHE_NS+k,null); if(!j) return null;
      const o=JSON.parse(j); if(!o||!o.ts||(Date.now()-o.ts)>CACHE_TTL_MS) return null;
      return o.result||null;
    }catch{return null;}
  }
  function writePersistent(k,v){
    try{GM_setValue(CACHE_NS+k,JSON.stringify({ts:Date.now(),result:v}));}catch{}
  }

  // ===== FETCH (TMDb) =====
  function gmFetchJson(url){
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method:'GET', url,
        onload: (res) => { try{ resolve(JSON.parse(res.responseText)); }catch{ resolve(null); } },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }
  async function tmdbSearchOnce(q, params = {}, language = 'en-US', kind = 'movie'){
    const base = kind==='tv' ? 'https://api.themoviedb.org/3/search/tv'
      : (kind==='multi' ? 'https://api.themoviedb.org/3/search/multi'
                        : 'https://api.themoviedb.org/3/search/movie');
    const u = new URL(base);
    u.searchParams.set('api_key', TMDB_KEY);
    u.searchParams.set('query', q);
    u.searchParams.set('include_adult', 'false');
    u.searchParams.set('language', language);
    if (params.year && kind!=='tv') {
      u.searchParams.set('year', params.year);
      u.searchParams.set('primary_release_year', params.year);
    }
    if (params.first_air_date_year && kind==='tv') {
      u.searchParams.set('first_air_date_year', params.first_air_date_year);
    }
    const data = await gmFetchJson(u.toString());
    const arr  = data?.results || [];
    return arr.filter(r => (r.media_type || kind)==='movie' || (r.media_type || kind)==='tv');
  }

  function strictYearFilter(arr, qYear, strict){
    if (!strict || !qYear) return arr;
    return arr.filter(r => releaseYearOf(r) === qYear);
  }

  // ===== FIND BEST (variants + scoring) =====
  async function findBestFast(raw) {
    const key = cacheKey(raw);
    if (memCache.has(key)) return memCache.get(key);
    const fromDisk = readPersistent(key);
    if (fromDisk !== undefined && fromDisk !== null) { memCache.set(key, fromDisk); return fromDisk; }

    const vars = variantsFrom(raw);
    const qYear = yearFrom(raw);
    const STRICT_YEAR = !!qYear && tokens(cleanNoise(raw)).length <= 2;

    let best = null, bestScore = -1;
    let tries = 0;

    for (const v of vars) {
      // เดาตาม pattern ของชื่อว่าเป็น TV ไหม (สำหรับกรณีหน้า movie ปน series)
      const hintTV = /\bS\d{1,2}(E\d{1,3})?\b/i.test(raw) || /\bSeason\b/i.test(raw);
      const pMovie = v.year ? { year: v.year } : {};
      const pTV    = v.year ? { first_air_date_year: v.year } : {};

      // 1) movie with year
      if (tries++ < MAX_TRIES) {
        let r1 = await tmdbSearchOnce(v.title, pMovie, 'en-US', 'movie');
        r1 = strictYearFilter(r1, qYear, STRICT_YEAR);
        const ex1 = strictExactPick(r1, v.title, v.year || qYear);
        if (ex1) { best=ex1; bestScore=1.5; break; }
        for (const r of r1){ const s=matchScore(v.title, v.year, r); if (s>bestScore){bestScore=s; best=r;} }
        if (bestScore >= 0.9) break;
      }

      // 2) movie no year
      if (tries++ < MAX_TRIES) {
        let r2 = await tmdbSearchOnce(v.title, {}, 'en-US', 'movie');
        r2 = strictYearFilter(r2, qYear, STRICT_YEAR);
        const ex2 = strictExactPick(r2, v.title, v.year || qYear);
        if (ex2) { best=ex2; bestScore=1.5; break; }
        for (const r of r2){ const s=matchScore(v.title, v.year, r); if (s>bestScore){bestScore=s; best=r;} }
        if (bestScore >= 0.9) break;
      }

      // 3) tv only if hint
      if (hintTV && tries++ < MAX_TRIES) {
        let r3 = await tmdbSearchOnce(v.title, pTV, 'en-US', 'tv');
        r3 = strictYearFilter(r3, qYear, STRICT_YEAR);
        const ex3 = strictExactPick(r3, v.title, v.year || qYear);
        if (ex3) { best=ex3; bestScore=1.5; break; }
        for (const r of r3){ const s=matchScore(v.title, v.year, r); if (s>bestScore){bestScore=s; best=r;} }
        if (bestScore >= 0.9) break;
      }

      // 4) multi fallback (ถ้าไม่ strict-year)
      if (!STRICT_YEAR && tries++ < MAX_TRIES) {
        let r4 = await tmdbSearchOnce(v.title, {}, 'en-US', 'multi');
        r4 = strictYearFilter(r4, qYear, STRICT_YEAR);
        const ex4 = strictExactPick(r4, v.title, v.year || qYear);
        if (ex4) { best=ex4; bestScore=1.5; break; }
        for (const r of r4){ const s=matchScore(v.title, v.year, r); if (s>bestScore){bestScore=s; best=r;} }
      }
    }

    if (DEBUG_LOG) {
      const firstVariant = vars[0]?.title || '';
      console.log('[TMDb DEBUG] raw:', raw,
        '| year:', qYear,
        '| firstVariant:', firstVariant,
        '| variants:', vars.map(v => v.title + (v.year ? ` (${v.year})` : '')),
        '| best:', best ? (best.title || best.name) : null,
        '| bestYear:', best ? releaseYearOf(best) : null,
        '| score:', bestScore.toFixed(3));
    }

    if (bestScore < ACCEPT_THRESHOLD) { memCache.set(key, null); return null; }
    memCache.set(key, best);
    if (best) writePersistent(key, best);
    return best;
  }

  // ===== RENDER (movie path; TV ใช้ renderTVResult) =====
  function ratingClass(score){
    if (score >= 7.0) return 'tmdb-badge tmdb-badge--good';
    if (score >= 5.5) return 'tmdb-badge tmdb-badge--ok';
    return 'tmdb-badge tmdb-badge--bad';
  }

  async function renderResult(row, a, result){
    const td = row.querySelector('td.catpic'); if (!td) return;
    td.innerHTML=''; td.style.position='relative';

    let poster = result?.poster_path ? `${IMAGE_BASE}${result.poster_path}` : null;
    if (!poster) poster = await fetchDetailPoster(a.href); // fallback

    if (poster) {
      const img=document.createElement('img');
      img.className='tmdb-poster'; img.src=poster; img.loading='lazy'; img.decoding='async';
      td.appendChild(img);
    } else {
      td.innerHTML = '<span style="font-size:12px;color:#aaa;">N/A</span>';
    }

    const v = (typeof result?.vote_average === 'number') ? Number(result.vote_average) : null;
    const badge=document.createElement('span');
    if (v && v > 0) {
      badge.className = ratingClass(v) + ' tmdb-badge-overlay';
      badge.textContent = (Math.round(v*10)/10).toFixed(1);
    } else {
      badge.className = 'tmdb-badge tmdb-badge-overlay';
      badge.textContent = 'N/A';
    }
    td.appendChild(badge);
  }

  // ===== DEBUG near title =====
  function injectDebugNearTitle(a, raw){
    if (!DEBUG_SHOW_NEAR_TITLE || !a || a.dataset.tmdbDebugInjected) return;
    a.dataset.tmdbDebugInjected = '1';
    const y = yearFrom(raw);
    const vars = variantsFrom(raw);
    const top = vars[0]?.title || '(none)';
    const s = document.createElement('span');
    s.className = 'tmdb-dbg';
    s.textContent = `q: "${top}"${y ? ` y:${y}` : ''}`;
    s.title = `RAW: ${raw}\nCLEANED VARIANTS (ENG-only, ${vars.length}):\n- ` +
      vars.map(v => v.title + (v.year ? ` (${v.year})` : '')).join('\n- ');
    a.insertAdjacentElement('afterend', s);
    if (DEBUG_LOG) console.log('[TMDb DEBUG] CLEAN:', { raw, year: y, variants: vars });
  }

  // ===== QUEUE SCHEDULER =====
  const queue=[]; let running=0;
  async function runNext(){
    if (running>=CONCURRENCY) return;
    const job = queue.shift(); if(!job) return;
    running++;
    try{
      const { raw, row, a } = job;
      const res = TMDB_KEY ? await findBestFast(raw) : null; // ถ้าไม่มี key จะใช้แต่ fallback poster
      await renderResult(row, a, res);
    } catch(e){
      console.debug('[Dedbit TMDb] fetch error', e);
      await renderResult(job.row, job.a, null);
    } finally {
      running--; if(queue.length) runNext();
    }
  }
  function enqueueJob(raw, row, a){ queue.push({raw,row,a}); runNext(); }

  // ===== MAIN =====
  const links = findTitleLinks();
  if (!links.length) return;

  const rows = [];
  for (const a of links) {
    const row = a.closest('tr'); if (!row) continue;
    rows.push({ row, a });
    setSkeleton(row);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        const el = en.target;
        io.unobserve(el);
        const a = el.querySelector('td[align="left"] a[href*="details.php?id="]') || el.querySelector('a[href*="details"]');
        const raw = (a?.textContent || a?.title || '').trim();
        if (!raw || !a) return;

        injectDebugNearTitle(a, raw);

        if (FORCE_TV) {
          // TV category → ไม่เรียก TMDb, ใช้รูปจากหน้า detail
          renderTVResult(el, a);
        } else {
          // Movie/อื่น ๆ → ลอง TMDb ก่อน ถ้าไม่เจอจะ fallback รูปจากหน้า detail
          enqueueJob(raw, el, a);
        }
      }
    });
  }, { rootMargin: '900px 0px' });

  rows.forEach(({ row }) => io.observe(row));
})();
