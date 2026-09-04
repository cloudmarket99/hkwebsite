(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  // Progressive enhancement marker.
  document.documentElement.classList.add('flagship-ready');

  // Mega menu.
  const megaToggle = $('[data-mega-toggle]');
  const megaShell = $('[data-mega-shell]');
  const megaClose = () => {
    megaShell?.classList.remove('is-open');
    megaToggle?.setAttribute('aria-expanded', 'false');
  };
  const megaOpen = () => {
    megaShell?.classList.add('is-open');
    megaToggle?.setAttribute('aria-expanded', 'true');
  };
  megaToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    megaShell?.classList.contains('is-open') ? megaClose() : megaOpen();
  });
  megaShell?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', megaClose);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') megaClose();
  });

  // Site-wide command palette and static index search.
  const palette = $('[data-command-palette]');
  const palettePanel = $('.command-panel', palette || document);
  const paletteInput = $('[data-command-input]');
  const paletteResults = $('[data-command-results]');
  const searchTriggers = $$('[data-open-search]');
  let searchIndex = [];
  let searchPromise = null;
  let activeResult = -1;
  let paletteReturn = null;

  const getSearchIndexPath = () => {
    const scripts = $$('script');
    for (const s of scripts) {
      if (s.src && s.src.includes('flagship.js')) {
        return s.src.replace(/assets\/js\/flagship\.js.*$/, 'search-index.json');
      }
    }
    return 'search-index.json';
  };

  const resolveItemUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('/')) {
      const scripts = $$('script');
      for (const s of scripts) {
        if (s.src && s.src.includes('flagship.js')) {
          const rootUrl = s.src.replace(/assets\/js\/flagship\.js.*$/, '');
          const cleanUrl = url.replace(/^\//, '');
          const targetUrl = cleanUrl.endsWith('/') ? cleanUrl + 'index.html' : cleanUrl;
          return rootUrl + targetUrl;
        }
      }
    }
    return url;
  };

  const loadSearchIndex = () => {
    if (!searchPromise) {
      const path = getSearchIndexPath();
      searchPromise = fetch(path, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error(`Search index ${response.status}`);
          return response.json();
        })
        .then((data) => {
          searchIndex = Array.isArray(data) ? data : [];
          return searchIndex;
        })
        .catch((error) => {
          console.warn(error);
          searchIndex = [];
          return [];
        });
    }
    return searchPromise;
  };

  const normalize = (value) => String(value || '').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  const scoreItem = (item, query) => {
    if (!query) return 1;
    const title = normalize(item.title);
    const summary = normalize(item.summary);
    const tags = normalize((item.tags || []).join(' '));
    let score = 0;
    if (title === query) score += 100;
    if (title.startsWith(query)) score += 45;
    if (title.includes(query)) score += 30;
    if (tags.includes(query)) score += 18;
    if (summary.includes(query)) score += 10;
    query.split(' ').filter(Boolean).forEach((token) => {
      if (title.includes(token)) score += 8;
      if (tags.includes(token)) score += 5;
      if (summary.includes(token)) score += 2;
    });
    return score;
  };

  const searchItems = (query, limit = 9) => {
    const q = normalize(query);
    return searchIndex
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || String(a.item.title).localeCompare(String(b.item.title), 'ko'))
      .slice(0, limit)
      .map((entry) => entry.item);
  };

  const escapeHTML = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const renderPaletteResults = (query = '') => {
    if (!paletteResults) return;
    const matches = searchItems(query, 10);
    activeResult = matches.length ? 0 : -1;
    if (!matches.length) {
      paletteResults.innerHTML = '<div class="command-empty">검색 결과가 없습니다. 다른 단어로 다시 검색해 주세요.</div>';
      return;
    }
    paletteResults.innerHTML = matches.map((item, index) => `
      <a class="command-result${index === 0 ? ' is-active' : ''}" href="${escapeHTML(resolveItemUrl(item.url))}" data-command-result>
        <span>${escapeHTML((item.type || 'PAGE').slice(0, 2).toUpperCase())}</span>
        <div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.summary)}</small></div>
        <em>${escapeHTML(item.type || '페이지')}</em>
      </a>`).join('');
  };

  const toggleBackgroundAria = (open) => {
    $$('.site-header, #main, .site-footer, .utility-bar, .mobile-nav, .mobile-quick, .skip-link, .back-to-top, .chapter-rail, header, footer').forEach((el) => {
      if (el) open ? el.setAttribute('aria-hidden', 'true') : el.removeAttribute('aria-hidden');
    });
  };

  const setPalette = async (open) => {
    if (!palette) return;
    toggleBackgroundAria(open);
    if (open) {
      paletteReturn = document.activeElement;
      document.body.classList.add('has-modal');
      palette.classList.add('is-open');
      palette.setAttribute('aria-hidden', 'false');
      await loadSearchIndex();
      renderPaletteResults(paletteInput?.value || '');
      requestAnimationFrame(() => paletteInput?.focus());
    } else {
      palette.classList.remove('is-open');
      palette.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-modal');
      if (paletteReturn instanceof HTMLElement) paletteReturn.focus({ preventScroll: true });
    }
  };

  searchTriggers.forEach((trigger) => trigger.addEventListener('click', () => setPalette(true)));
  palette?.addEventListener('click', (event) => {
    if (event.target === palette) setPalette(false);
  });
  paletteInput?.addEventListener('input', () => renderPaletteResults(paletteInput.value));
  paletteInput?.addEventListener('keydown', (event) => {
    const results = $$('[data-command-result]', paletteResults || document);
    if (!results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeResult = event.key === 'ArrowDown'
        ? (activeResult + 1) % results.length
        : (activeResult - 1 + results.length) % results.length;
      results.forEach((node, index) => node.classList.toggle('is-active', index === activeResult));
      results[activeResult]?.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') {
      const href = results[Math.max(activeResult, 0)]?.href;
      if (href) location.href = href;
    }
  });
  palette?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setPalette(false);
      return;
    }
    if (event.key !== 'Tab' || !palettePanel) return;
    const focusables = $$('input,a[href],button:not([disabled])', palettePanel).filter((node) => node.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setPalette(!palette?.classList.contains('is-open'));
    } else if (!editable && event.key === '/' && !palette?.classList.contains('is-open')) {
      event.preventDefault();
      setPalette(true);
    }
  });
  loadSearchIndex();

  // Fallback search page uses the same index.
  const pageSearch = $('[data-page-search]');
  const pageResults = $('[data-page-results]');
  const renderPageResults = async () => {
    if (!pageResults || !pageSearch) return;
    await loadSearchIndex();
    const matches = searchItems(pageSearch.value, 30);
    pageResults.innerHTML = matches.length ? matches.map((item) => `
      <a class="command-result" href="${escapeHTML(resolveItemUrl(item.url))}">
        <span>${escapeHTML((item.type || 'PAGE').slice(0, 2).toUpperCase())}</span>
        <div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.summary)}</small></div>
        <em>${escapeHTML(item.type || '페이지')}</em>
      </a>`).join('') : '<div class="command-empty">검색 결과가 없습니다.</div>';
  };
  pageSearch?.addEventListener('input', renderPageResults);
  if (pageSearch) {
    const initialQuery = new URLSearchParams(location.search).get('q');
    if (initialQuery) pageSearch.value = initialQuery;
    renderPageResults();
  }

  // Native interactive Strategy OS tabs.
  const osButtons = $$('[data-os-tab]');
  const osPanels = $$('[data-os-panel]');
  const setOS = (key) => {
    osButtons.forEach((button) => {
      const active = button.dataset.osTab === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    osPanels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.osPanel === key));
  };
  osButtons.forEach((button, index) => {
    button.addEventListener('click', () => setOS(button.dataset.osTab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (index + 1) % osButtons.length;
      if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = (index - 1 + osButtons.length) % osButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = osButtons.length - 1;
      setOS(osButtons[next].dataset.osTab);
      osButtons[next].focus();
    });
  });

  // Filterable editorial/case indexes.
  $$('[data-filter-group]').forEach((group) => {
    const buttons = $$('[data-filter]', group);
    const targetSelector = group.dataset.filterTarget || '[data-filter-item]';
    const scope = group.closest('section') || document;
    const items = $$(targetSelector, scope);
    buttons.forEach((button) => button.addEventListener('click', () => {
      const value = button.dataset.filter || 'all';
      buttons.forEach((node) => node.classList.toggle('is-active', node === button));
      items.forEach((item) => {
        const tags = String(item.dataset.filterItem || '').split('|');
        item.hidden = value !== 'all' && !tags.includes(value);
      });
    }));
  });

  // Reading progress on long-form content.
  const readingBar = $('[data-reading-progress]');
  const articleBody = $('[data-article-body]');
  const updateReading = () => {
    if (!readingBar || !articleBody) return;
    const rect = articleBody.getBoundingClientRect();
    const length = Math.max(1, rect.height - innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / length));
    readingBar.style.transform = `scaleX(${progress})`;
  };
  addEventListener('scroll', updateReading, { passive: true });
  addEventListener('resize', updateReading);
  if (articleBody) requestAnimationFrame(updateReading);

  // Clipboard checklist helper.
  $$('[data-copy-checklist]').forEach((button) => {
    button.addEventListener('click', async () => {
      const root = button.closest('.article-checklist');
      const title = $('h2', root || document)?.textContent?.trim() || '상담 준비 체크리스트';
      const items = $$('li', root || document).map((node) => `□ ${node.textContent.trim()}`);
      const text = [title, '', ...items, '', '법무법인 호경 · 1533-1198'].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = '복사 완료';
        setTimeout(() => { button.textContent = original; }, 1800);
      } catch {
        button.textContent = '복사 불가';
      }
    });
  });

  // Print helpers.
  $$('[data-print-page]').forEach((button) => button.addEventListener('click', () => print()));

  // Back to top.
  const backToTop = $('[data-back-to-top]');
  const updateBackToTop = () => backToTop?.classList.toggle('is-visible', scrollY > 800);
  addEventListener('scroll', updateBackToTop, { passive: true });
  if (backToTop) requestAnimationFrame(updateBackToTop);
  backToTop?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

  // Spotlight coordinate for premium cards.
  if (finePointer) {
    $$('[data-spotlight]').forEach((node) => {
      let rect = null;
      node.addEventListener('pointerenter', () => { rect = node.getBoundingClientRect(); });
      node.addEventListener('pointermove', (event) => {
        if (!rect) rect = node.getBoundingClientRect();
        node.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        node.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
      });
      node.addEventListener('pointerleave', () => { rect = null; });
    });
  }

  // Blueprint-style hero canvas. It is decorative and disabled for reduced motion.
  const canvas = $('[data-intelligence-canvas]');
  if (canvas instanceof HTMLCanvasElement && !reduceMotion) {
    const context = canvas.getContext('2d', { alpha: true });
    let width = 0;
    let height = 0;
    let ratio = 1;
    let pointerX = 0.72;
    let pointerY = 0.42;
    let frame = 0;
    let running = true;
    const points = Array.from({ length: 34 }, (_, index) => ({
      x: (index * 0.61803398875) % 1,
      y: (index * 0.38196601125 + 0.17) % 1,
      phase: index * 0.73,
      speed: 0.35 + (index % 5) * 0.08,
      size: 0.7 + (index % 4) * 0.45,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time) => {
      if (!running || !context) return;
      context.clearRect(0, 0, width, height);
      const t = time * 0.00018;
      const centerX = width * (0.69 + (pointerX - 0.5) * 0.025);
      const centerY = height * (0.45 + (pointerY - 0.5) * 0.025);

      // Large analytical rings.
      context.lineWidth = 1;
      [0.18, 0.28, 0.39].forEach((scale, index) => {
        context.beginPath();
        context.strokeStyle = `rgba(144,202,231,${0.09 - index * 0.015})`;
        context.arc(centerX, centerY, Math.min(width, height) * scale, 0, Math.PI * 2);
        context.stroke();
      });

      const projected = points.map((point) => {
        const driftX = Math.sin(t * point.speed + point.phase) * 14;
        const driftY = Math.cos(t * point.speed * 0.8 + point.phase) * 10;
        return { ...point, px: point.x * width + driftX, py: point.y * height + driftY };
      });
      projected.forEach((point, index) => {
        for (let j = index + 1; j < projected.length; j += 1) {
          const other = projected[j];
          const dx = point.px - other.px;
          const dy = point.py - other.py;
          const distance = Math.hypot(dx, dy);
          if (distance < 145) {
            context.beginPath();
            context.strokeStyle = `rgba(131,192,222,${(1 - distance / 145) * 0.12})`;
            context.moveTo(point.px, point.py);
            context.lineTo(other.px, other.py);
            context.stroke();
          }
        }
        context.beginPath();
        context.fillStyle = `rgba(176,224,243,${0.16 + (index % 3) * 0.04})`;
        context.arc(point.px, point.py, point.size, 0, Math.PI * 2);
        context.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    const heroEl = canvas.closest('[data-hero]');
    let heroRect = null;
    heroEl?.addEventListener('pointerenter', () => { heroRect = canvas.getBoundingClientRect(); });
    heroEl?.addEventListener('pointermove', (event) => {
      if (!heroRect) heroRect = canvas.getBoundingClientRect();
      pointerX = (event.clientX - heroRect.left) / Math.max(1, heroRect.width);
      pointerY = (event.clientY - heroRect.top) / Math.max(1, heroRect.height);
    });
    heroEl?.addEventListener('pointerleave', () => { heroRect = null; });
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) frame = requestAnimationFrame(draw);
      else cancelAnimationFrame(frame);
    });
    addEventListener('resize', resize);
    requestAnimationFrame(() => {
      resize();
      frame = requestAnimationFrame(draw);
    });
  }

  // Blog Pagination Controller
  document.addEventListener('click', (event) => {
    const numBtn = event.target.closest('.pagination-number');
    if (numBtn) {
      event.preventDefault();
      const parentNav = numBtn.closest('.blog-pagination');
      if (!parentNav) return;
      
      const allNums = [...parentNav.querySelectorAll('.pagination-number')];
      allNums.forEach(btn => {
        btn.classList.remove('is-active');
        btn.style.background = '#ffffff';
        btn.style.color = '#0f172a';
        btn.style.fontWeight = '700';
        btn.style.boxShadow = 'none';
        btn.style.border = '1px solid #e2e8f0';
      });
      
      numBtn.classList.add('is-active');
      numBtn.style.background = 'var(--navy-900,#031627)';
      numBtn.style.color = '#ffffff';
      numBtn.style.fontWeight = '800';
      numBtn.style.boxShadow = '0 4px 12px rgba(3,22,39,0.25)';
      numBtn.style.border = 'none';
      
      const prevBtn = parentNav.querySelector('.pagination-prev');
      const nextBtn = parentNav.querySelector('.pagination-next');
      const activeIdx = allNums.indexOf(numBtn);
      
      if (prevBtn) {
        if (activeIdx === 0) {
          prevBtn.classList.add('is-disabled');
          prevBtn.style.background = '#f1f5f9';
          prevBtn.style.color = '#94a3b8';
          prevBtn.style.pointerEvents = 'none';
          prevBtn.style.boxShadow = 'none';
        } else {
          prevBtn.classList.remove('is-disabled');
          prevBtn.style.background = 'var(--navy-900,#031627)';
          prevBtn.style.color = '#ffffff';
          prevBtn.style.pointerEvents = 'auto';
          prevBtn.style.boxShadow = '0 4px 12px rgba(3,22,39,0.2)';
        }
      }
      
      if (nextBtn) {
        if (activeIdx === allNums.length - 1) {
          nextBtn.classList.add('is-disabled');
          nextBtn.style.background = '#f1f5f9';
          nextBtn.style.color = '#94a3b8';
          nextBtn.style.pointerEvents = 'none';
          nextBtn.style.boxShadow = 'none';
        } else {
          nextBtn.classList.remove('is-disabled');
          nextBtn.style.background = 'var(--navy-900,#031627)';
          nextBtn.style.color = '#ffffff';
          nextBtn.style.pointerEvents = 'auto';
          nextBtn.style.boxShadow = '0 4px 12px rgba(3,22,39,0.2)';
        }
      }
      
      const grid = document.querySelector('.blog-grid') || document.querySelector('.insight-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
})();


/* FULL 44 WINNING CASES CONTROLLER */
window.ALL_CASES_DATA = [{"wr_id": "184", "id": "CASE 01", "category": "이혼.상간", "metric": "인용 결정", "metric_label": "증거보전", "title": "상간소송 진행을 위한 숙박업소 CCTV 증거보전 인용", "desc": "사건 결과 숙박업소 CCTV 영상 제출 명령 CCTV 영상 법원 제출을 위한 증거보전 결정 인용 외도 사실 입증을 위한 핵심 증거 확보 절차 진행 01. 사건 개요 본 사건은 배우자의 외도 정황이 확인된 상황에서 상간손해배상 소송을 ...", "img": "../assets/img/cases/case_real_184.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "183", "id": "CASE 02", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "영업소득자 채무 1억 원, 원금 약 86.5% 탕감 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 13.5% 적용 원금 기준 약 86.5% 탕감 변제기간: 36개월 01. 사건 개요 본 사건은 장기간의 정신질환으로 인해 정상적인 직장생활이 어려워진 이후, 생활비...", "img": "../assets/img/cases/case_real_183.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "182", "id": "CASE 03", "category": "사기", "metric": "전액 지급", "metric_label": "손해배상", "title": "손해배상 책임 인정되어 4,271만원 전액 지급 판결된 사건", "desc": "사건 결과 피고 1, 원고에게 33,010,000원 지급 판결 피고 2, 원고에게 9,700,000원 지급 판결 각 금원에 대해 연 5% 및 이후 연 12% 지연이자 인정 소송비용 피고 전원 부담 가집행 선고 01. 사건 개요 본 사...", "img": "../assets/img/cases/case_real_182.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "181", "id": "CASE 04", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "탕감율 87%, 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 총 채무 대비 탕감율 약 87% 채권자 추심 및 독촉 중단 01. 사건 개요 의뢰인은 생활비 및 생계자금 마련 과정에서 금융권 채무가 점차 누적되었고, 정상적인 상환이 어려운 상태에 이르러 개인회생 절차를...", "img": "../assets/img/cases/case_real_181.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "180", "id": "CASE 05", "category": "이혼.상간", "metric": "인용 결정", "metric_label": "증거보전", "title": "외도 입증을 위한 숙박업소 CCTV 증거보전 결정 사례", "desc": "사건 결과 법원은 증거소지인이 해당 결정을 송달받은 날로부터 7일 이내에 관련 자료를 법원에 제출하도록 명령하였습니다. 01. 사건 개요 본 사건은 상간 손해배상 소송을 준비하는 과정에서 외도 사실을 입증할 수 있는 핵심 자료를 확보...", "img": "../assets/img/cases/case_real_180.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "179", "id": "CASE 06", "category": "사기", "metric": "승소 인용", "metric_label": "판결 결과", "title": "허위 수수료·환전 오류를 이용한 사기 사건, 피해금 4,700만원 전액 인정 판결", "desc": "사건 결과 피고들 공동하여 47,009,600원 지급 판결 연 5% 및 이후 연 12% 지연손해금 인정 소송비용 피고 전원 부담 가집행 선고 무변론 전부승소 판결 01. 사건 개요 본 사건은 상품 거래를 가장하여 피해자에게 반복적으로...", "img": "../assets/img/cases/case_real_179.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "178", "id": "CASE 07", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "사회초년생 생활비·의료비 채무, 원금 약 80.6% 탕감 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 19.35% 적용 원금 기준 약 80.6% 탕감 01. 사건 개요 본 사건은 사회생활 초기 단계에서 생활비와 의료비 부담이 누적되어 개인회생을 신청하게 된 사안입니...", "img": "../assets/img/cases/case_real_178.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "177", "id": "CASE 08", "category": "이혼.상간", "metric": "전액 지급", "metric_label": "손해배상", "title": "상간 부정행위 인정, 위자료 2,500만 원 인용 상간손해배상 일부승소 사례", "desc": "사건 결과 위자료 2,500만 원 지급 판결 연 5% → 연 12% 지연손해금 지급 명령 나머지 청구 기각 (일부승소) 01. 사건 개요 본 사건은 혼인 관계가 유지 중인 배우자와 부정행위를 한 제3자를 상대로 정신적 손해에 대한 위...", "img": "../assets/img/cases/case_real_177.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "176", "id": "CASE 09", "category": "채권", "metric": "승소 인용", "metric_label": "판결 결과", "title": "보증금 3,000만 원 전액 인정 · 항소 기각", "desc": "사건 결과 피고 항소 기각 보증금 3,000만 원 전액 반환 인정 연 5% → 연 12% 지연이자 지급 소송비용 피고 부담 1심 전부승소 판결 유지 01. 사건 개요 본 사건은 임대차 계약 종료 이후에도 보증금을 반환받지 못한 임차인...", "img": "../assets/img/cases/case_real_176.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "175", "id": "CASE 10", "category": "개인회생", "metric": "원금 탕감", "metric_label": "개시결정", "title": "이혼·양육비 부담과 소득 단절에 대한 법원 판단, 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 24.86% 적용 원금 기준 약 75.14% 탕감 01. 사건 개요 본 사건은 젊은 나이에 가장이 되어 가족을 부양하던 의뢰인이 이혼 이후 급격한 소득 단절과 채무...", "img": "../assets/img/cases/case_real_175.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "174", "id": "CASE 11", "category": "이혼.상간", "metric": "전액 지급", "metric_label": "손해배상", "title": "상간 부정행위 인정, 위자료 2,000만 원 인용된 손해배상 일부승소 사례", "desc": "사건 결과 상간 부정행위에 대한 민사상 불법행위 책임 인정 위자료 2,000만 원 지급 판결 지연손해금 지급 명령 청구 금액 중 일부만 인용되어 일부승소 01. 사건 개요 본 사건은 배우자가 있는 사람임을 알면서도 부정행위를 지속한 ...", "img": "../assets/img/cases/case_real_174.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "173", "id": "CASE 12", "category": "조세불복", "metric": "전부 취소", "metric_label": "조세불복", "title": "부가세 약4억원 조세불복소송 전액승소", "desc": "사건 결과 부가가치세 부과처분 전부 취소 2021년 1기분 부가가치세381,242,070원 취소 2021년 2기분 부가가치세25,115,730원 취소 소송비용 전부 피고 부담 01. 사건 개요 본 사건은 금지금 도매업 등을 영위하던 ...", "img": "../assets/img/cases/case_real_173.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "172", "id": "CASE 13", "category": "이혼.상간", "metric": "전액 지급", "metric_label": "손해배상", "title": "상간손해배상 1,700만 원 인정, 일부승소 사례", "desc": "사건 결과 위자료 17,000,000원 인용 나머지 청구 기각 가집행 가능 판결 01. 사건 개요 본 사건은 혼인 중인 배우자와의 부정행위로 인해 발생한 정신적 손해에 대해 위자료를 청구한 사안입니다. 원고는 배우자와의 혼인관계가 유...", "img": "../assets/img/cases/case_real_172.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "171", "id": "CASE 14", "category": "사기", "metric": "전액 지급", "metric_label": "손해배상", "title": "손해배상 1천만 원, 법원에서 인정된 사례", "desc": "사건 결과 불법행위로 인한 피해 중 1천만 원이 인정되며, 원고에게 유리한 일부승소 판결을 이끌어낸 사건입니다. 01. 사건 개요 상대방의 불법행위로 피해를 입은 의뢰인(원고)이 정당한 손해배상금을 회수하기 위해 법무법인 호경을 찾았...", "img": "../assets/img/cases/case_real_171.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "170", "id": "CASE 15", "category": "채권", "metric": "승소 인용", "metric_label": "판결 결과", "title": "임차인의 퇴거 거부에 대한 법원 판단, 건물인도 청구 전부승소 사례", "desc": "사건 결과 건물 인도 청구 전부 인용 소송비용 피고 부담 가집행 가능 판결 01. 사건 개요 본 사건은 부동산 점유자가 계약 종료 이후에도 건물을 인도하지 않아 분쟁이 발생한 사안입니다. 의뢰인은 적법하게 부동산을 소유·관리하고 있었...", "img": "../assets/img/cases/case_real_170.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "169", "id": "CASE 16", "category": "사기", "metric": "승소 인용", "metric_label": "판결 결과", "title": "형사처벌 위험 사건에서 벌금형으로 마무리된 사례", "desc": "사건 결과 벌금 1,000,000원 선고 미납 시 10만원 = 1일 환산 노역장 유치 벌금 상당 금액 가납 명령 01. 사건 개요 본 사건은 사기 혐의로 기소된 형사 사건입니다. 의뢰인은 금전 거래 과정에서 발생한 분쟁으로 인해 사기...", "img": "../assets/img/cases/case_real_169.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "168", "id": "CASE 17", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "가족 부양 부담과 의료비 채무에 대한 법원 판단, 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 14.8% 적용 원금 기준 약 85.2% 탕감 01. 사건 개요 본 사건은 가족 부양과 의료비 부담으로 채무가 누적된 의뢰인이 개인회생을 신청한 사안입니다. 의뢰인...", "img": "../assets/img/cases/case_real_168.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "167", "id": "CASE 18", "category": "사기", "metric": "승소 인용", "metric_label": "판결 결과", "title": "기망행위 인정되어 형사책임이 인정된 사건", "desc": "사건 결과 피고인 벌금 5,000,000원 선고 벌금 미납 시 10만원을 1일로 환산하여 노역장 유치 벌금 상당 금액에 대한 가납 명령 01. 사건 개요 본 사건은 금전 거래 과정에서 상대방을 기망하여 재산상 이익을 취득한 사기 사건...", "img": "../assets/img/cases/case_real_167.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "166", "id": "CASE 19", "category": "이혼.상간", "metric": "전액 지급", "metric_label": "손해배상", "title": "외도행위 손해배상 2천만 원, 법원에서 인정된 사례", "desc": "사건 결과 외도행위로 인한 피해를 주장한 사건에서 주요 손해가 인정되어 2천만 원 상당의 손해배상을 받아낸 사례입니다 01. 사건 개요 상대방의 불법행위로 피해를 입은 의뢰인(원고)이 손해배상금을 회수하기 위해 법무법인 호경을 찾았습...", "img": "../assets/img/cases/case_real_166.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "165", "id": "CASE 20", "category": "사기", "metric": "전액 지급", "metric_label": "손해배상", "title": "손해배상 2천3백만 원, 법원에서 인정된 사례", "desc": "사건 결과 불법행위로 인한 피해 중 2천3백만 원이 인정되며, 원고에게 유리한 일부승소 판결을 확보한 사건입니다. 01. 사건 개요 상대방의 불법행위로 피해를 입은 의뢰인(원고)이 정당한 손해배상금을 회수하기 위해 법무법인 호경을 찾...", "img": "../assets/img/cases/case_real_165.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "164", "id": "CASE 21", "category": "형사", "metric": "승소 인용", "metric_label": "판결 결과", "title": "검사 구형 대비 형량 감경 및 일부 무죄 이끌어낸 사건", "desc": "사건 결과 일부 공소사실 무죄 인정 징역 3년 선고 약물치료 프로그램 40시간 이수 명령 압수물 몰수 추징금 30만원 부과 01. 사건 개요 본 사건은 마약류관리법 위반(향정 및 대마) 혐의로 기소된 형사 사건입니다. 의뢰인은 마약류...", "img": "../assets/img/cases/case_real_164.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "163", "id": "CASE 22", "category": "사기", "metric": "승소 인용", "metric_label": "판결 결과", "title": "흉기 협박·강요 송금 사기, 4,011만 원 전액 인용된 무변론 판결 사례", "desc": "사건 결과 손해배상금 40,114,000원 전부 인용 연 12% 지연이자 지급 명령 소송비용 전액 피고 부담 가집행 선고 01. 사건 개요 본 사건은 피고가 원고를 상대로 위협과 강요 행위를 통해 금전을 갈취한 사안으로 원고가 이에 ...", "img": "../assets/img/cases/case_real_163.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "162", "id": "CASE 23", "category": "음주", "metric": "승소 인용", "metric_label": "판결 결과", "title": "도주치상·사고후미조치, 집행유예 2년으로 선처된 사례", "desc": "사건 결과 도주치상 및 사고후미조치로 징역 1년 2월이 선고되었으나, 정상관계 소명과 변론 전략으로 집행유예 2년을 이끌어낸 사례입니다. 01. 사건 개요 도주치상(뺑소니) 및 사고후미조치 혐의로 형사 처벌(실형) 위기에 처한 피고인...", "img": "../assets/img/cases/case_real_162.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "161", "id": "CASE 24", "category": "사기", "metric": "전부 취소", "metric_label": "조세불복", "title": "미지급 용역비 분쟁, 1.4억 전액 배상판결", "desc": "사건 결과 기업이 지급을 미루던 1억 4천만 원의 용역비에 대해 법원이 전액 지급과 지연이자 지급까지 인정하였습니다. 01. 사건 개요 용역 계약에 따른 업무를 모두 완료했음에도 불구하고, 약정된 용역비 1억 4천만 원을 지급받지 못...", "img": "../assets/img/cases/case_real_161.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "160", "id": "CASE 25", "category": "사기", "metric": "전액 지급", "metric_label": "손해배상", "title": "불법행위 손해배상 2천만 원, 법원에서 인정된 사례", "desc": "사건 결과 불법행위로 인한 피해를 주장한 사건에서 주요 손해가 인정되어 2천만 원의 배상 판결을 이끌어냈습니다. 01. 사건 개요 상대방의 불법행위로 인해 정신적·재산적 피해를 입은 의뢰인(원고)이 정당한 손해배상금을 지급받기 위해 ...", "img": "../assets/img/cases/case_real_160.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "159", "id": "CASE 26", "category": "이혼.상간", "metric": "전액 지급", "metric_label": "손해배상", "title": "상간 손해배상 청구 사건, 법원 화해권고결정으로 분쟁 종결된 사례", "desc": "사건 결과 피고가 원고에게 금 10,000,000원 지급 지급기한 경과 시 연 12% 지연손해금 부과 나머지 청구 포기 이의 없을 경우 확정판결과 동일한 효력 01. 사건 개요 본 사건은 혼인 중인 배우자와의 부정행위로 인해 혼인관계...", "img": "../assets/img/cases/case_real_159.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "158", "id": "CASE 27", "category": "채권", "metric": "승소 인용", "metric_label": "판결 결과", "title": "영업금지가처분 신청 기각, 방어 성공 사례", "desc": "사건 결과 영업금지가처분 신청 기각 01. 사건 개요 본 사건은 휴대폰 판매점 운영자가 퇴사한 근로자를 상대로 경업금지약정 및 영업비밀 침해를 이유로 영업금지가처분을 신청한 사안입니다. 채권자는 채무자가 퇴사 후 인근에서 유사 업종의...", "img": "../assets/img/cases/case_real_158.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "157", "id": "CASE 28", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "질병·사고로 인한 채무, 원금 75.9% 탕감된 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 24.1% 적용 원금 기준 약 75.9% 탕감 01. 사건 개요 본 사건은 지속적인 건강 악화와 반복된 사고로 정상적인 소득 활동이 어려워진 의뢰인이 개인회생을 신...", "img": "../assets/img/cases/case_real_157.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "156", "id": "CASE 29", "category": "형사", "metric": "승소 인용", "metric_label": "판결 결과", "title": "실형 선고 가능성 사건에서 집행유예로 마무리된 사례", "desc": "사건 결과 징역 6월 선고 집행유예 2년 스토킹 재범예방강의 40시간 수강 명령 01. 사건 개요 본 사건은 스토킹범죄의 처벌 등에 관한 법률 위반 및 주거침입 혐의로 기소된 형사 사건입니다. 의뢰인은 피해자에 대한 반복적인 접근 및...", "img": "../assets/img/cases/case_real_156.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "155", "id": "CASE 30", "category": "사기", "metric": "인용 결정", "metric_label": "증거보전", "title": "증거보전 인용, 영상녹화물 제출 명령 확보", "desc": "사건 결과 필요한 사실관계를 입증하기 위해 제기된 증거보전 신청이 인용되어 법원이 별지 기재 기계·영상녹화물의 제출을 명령한 사례입니다.", "img": "../assets/img/cases/case_real_155.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "154", "id": "CASE 31", "category": "사기", "metric": "인용 결정", "metric_label": "증거보전", "title": "증거보전 신청 인용, 영상녹화물 제출 명령 확보", "desc": "사건 결과 분쟁 해결에 필수적인 영상·기계 자료 확보를 위해 진행한 증거보전 신청이 인용되어 법원이 해당 자료 제출을 명령한 사례입니다.", "img": "../assets/img/cases/case_real_154.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "153", "id": "CASE 32", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "이자 전액 탕감, 원금 변제율 약71% 적용 개인회생 개시결정", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 70.4% 적용 01. 사건 개요 본 사건은 중학교 교사로 재직 중인 의뢰인이 부동산 투자 과정에서 발생한 채무로 인해 개인회생을 신청한 사안입니다. 의뢰인은 결혼...", "img": "../assets/img/cases/case_real_153.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "152", "id": "CASE 33", "category": "이혼.상간", "metric": "인용 결정", "metric_label": "증거보전", "title": "외도 분쟁, 법원이 핵심 CCTV 증거 확보 명령", "desc": "사건 결과 배우자의 외도 의심으로 제기된 분쟁에서 법원이 요구한 CCTV 시간대 영상들을 확보해 동선·출입 사실을 명확히 입증했습니다.", "img": "../assets/img/cases/case_real_152.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "151", "id": "CASE 34", "category": "이혼.상간", "metric": "인용 결정", "metric_label": "증거보전", "title": "증거보전 인용, USB 제출 명령으로 증거 확보", "desc": "사건 결과 신청인의 증거보전 요청이 받아들여져, 법원이 모넥스 모델 A366 등 관련 기계·자료를 7일 내 제출하도록 명령한 사례입니다.", "img": "../assets/img/cases/case_real_151.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "150", "id": "CASE 35", "category": "개인회생.파산", "metric": "원금 탕감", "metric_label": "개시결정", "title": "보육교사 5,100만 원 채무, 원금 약 70.9% 탕감 개인회생 개시결정 사례", "desc": "사건 결과 개인회생 개시결정 이자 100% 전액 탕감 원금 변제율 약 29.1% 적용 원금 기준 약 70.9% 탕감 변제기간: 36개월 01. 사건 개요 본 사건은 가족의 질병과 그로 인한 의료비 부담이 장기간 누적되며 생활고가 심화...", "img": "../assets/img/cases/case_real_150.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "149", "id": "CASE 36", "category": "채권", "metric": "전액 지급", "metric_label": "손해배상", "title": "공사대금 미지급 분쟁에서 2억1,000만 원 손해배상 책임 인정된 사례", "desc": "사건 결과 피고들 연대하여 2억 1,000만원 지급 판결 2021.7.21부터 2024.12.18까지 연 6% 지연이자 이후 완제 시까지 연 12% 지연이자 지급 소송비용 원고 30%, 피고 70% 부담 01. 사건 개요 본 사건은 ...", "img": "../assets/img/cases/case_real_149.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "148", "id": "CASE 37", "category": "사기", "metric": "전액 지급", "metric_label": "손해배상", "title": "투자사기 피해, 손해배상 2천만원 판결", "desc": "사건 결과 투자사기 피해 입증 후 전액 및 이자까지 지급 판결을 이끌어냈습니다. 01. 사건 개요 1심에서 억울하게 패소한 의뢰인이 판결을 뒤집기 위해 법무법인 호경을 찾았습니다. 호경은 항소심(2심)을 대리하여 1심 판결의 부당함을...", "img": "../assets/img/cases/case_real_148.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "147", "id": "CASE 38", "category": "이혼.상간", "metric": "인용 결정", "metric_label": "증거보전", "title": "증거보전 인용, 영상녹화물 제출 명령으로 증거", "desc": "사건 결과 확보증거보전 신청이 이유 있다고 인정되어 별지 기재 기계·영상녹화물의 제출을 법원이 명령한 사례입니다.", "img": "../assets/img/cases/case_real_147.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "146", "id": "CASE 39", "category": "사기", "metric": "인용 결정", "metric_label": "증거보전", "title": "증거보전 신청 인용, CCTV·녹화물 제출 명령 확보사건", "desc": "사건 결과 처리에 필수적인 영상자료 확보를 위해 진행한 증거보전 신청이 인용되어 증거보전 명령을 받아낸 사례입니다.", "img": "../assets/img/cases/case_real_146.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "145", "id": "CASE 40", "category": "이혼.상간", "metric": "승소 인용", "metric_label": "판결 결과", "title": "상간소송 위자료 3,000만원 조정 성립 사실상 전부승소 사례", "desc": "사건 결과 피고, 원고에게 위자료 30,000,000원 지급 지급기한: 2023.12.31.까지 미지급 시 연 12% 지연손해금 적용 01. 사건 개요 본 사건은 배우자의 부정행위로 인해 혼인관계가 침해되었다고 보고,상간자를 상대로 ...", "img": "../assets/img/cases/case_real_145.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "144", "id": "CASE 41", "category": "이혼.상간", "metric": "승소 인용", "metric_label": "판결 결과", "title": "혼인관계 침해 인정되어 고액 위자료 전부 인정된 사건", "desc": "사건 결과 피고, 원고에게 30,000,100원 지급 판결 (전부 인용) 2023.01.07.부터 완제 시까지 연 12% 지연이자 소송비용 전액 피고 부담 01. 사건 개요 본 사건은 배우자의 부정행위로 인해 혼인관계가 침해된 상황에...", "img": "../assets/img/cases/case_real_144.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "143", "id": "CASE 42", "category": "채권", "metric": "승소 인용", "metric_label": "판결 결과", "title": "3억 원 청구 사건에서 전액 방어 성공한 항소심 판결", "desc": "사건 결과 원고의 항소 전부 기각 항소비용 원고 부담 01. 사건 개요 본 사건은 원고가 피고를 상대로 거액의 손해배상을 청구한 사건으로, 1심 판결 이후 원고가 불복하여 항소를 제기하면서 진행된 항소심 사건입니다. 원고는 피고들에게...", "img": "../assets/img/cases/case_real_143.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "142", "id": "CASE 43", "category": "채권", "metric": "승소 인용", "metric_label": "판결 결과", "title": "금전 대여 사실 인정되어 5,926만원 전액 인용 전부승소 사례", "desc": "사건 결과 피고, 원고에게 59,265,000원 전액 지급 판결 2021.08.25.부터 완제 시까지 연 12% 지연이자 소송비용 전액 피고 부담 가집행 선고 01. 사건 개요 본 사건은 금전을 빌려준 이후 이를 반환받지 못하여 발생...", "img": "../assets/img/cases/case_real_142.png", "link": "../cases/cctv-evidence-preservation/index.html"}, {"wr_id": "119", "id": "CASE 44", "category": "이혼.상간", "metric": "승소 인용", "metric_label": "판결 결과", "title": "혼인 파탄 책임 인정되어 위자료 지급 판결된 사건", "desc": "사건 결과 피고, 원고에게 1,000만원 지급 판결 2024.09.26.~2025.03.19. 연 5% 이자 이후 완제 시까지 연 12% 지연이자 나머지 청구는 기각 소송비용 각자 부담 가집행 선고 01. 사건 개요 본 사건은 배우자...", "img": "../assets/img/cases/case_real_119.png", "link": "../cases/cctv-evidence-preservation/index.html"}];

(function initCasesController() {
  const gridContainer = document.querySelector('.page-cases .blog-grid');
  const paginationContainer = document.querySelector('.page-cases .blog-pagination');
  const filterButtons = document.querySelectorAll('.page-cases .filter-bar button');

  if (!gridContainer || !window.ALL_CASES_DATA) return;

  let currentCategory = 'all';
  let currentPage = 1;
  const itemsPerPage = 9;

  function renderCases() {
    // Filter items
    let filtered = window.ALL_CASES_DATA.filter(item => {
      if (currentCategory === 'all') return true;
      return item.category.includes(currentCategory) || currentCategory.includes(item.category);
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + itemsPerPage);

    // Render 3x3 cards HTML
    let html = '';
    pageItems.forEach(item => {
      const isCasesDir = window.location.pathname.includes('/cases/');
      const targetLink = isCasesDir ? `./review-${item.wr_id}/index.html` : `./cases/review-${item.wr_id}/index.html`;
      html += `
      <article class="blog-card" data-spotlight data-filter-item="${item.category}">
        <a class="blog-card__link" href="${targetLink}">
          <div class="blog-card__thumb">
            <img src="${item.img}" alt="${item.title} 실제 승소 이미지" loading="lazy">
            <span class="blog-card__badge">${item.category}</span>
          </div>
          <div class="blog-card__body">
            <div class="blog-card__author">
              <span>${item.id}</span>
              <span style="margin-left:8px; color:var(--brand-gold, #c5a059); font-weight:850;">[${item.metric_label}: ${item.metric}]</span>
            </div>
            <h3 class="blog-card__title">${item.title}</h3>
            <p class="blog-card__summary">${item.desc}</p>
            <div class="blog-card__foot">
              <span class="blog-card__read">법리 구조 검증</span>
              <span class="blog-card__more">승소 판결 보기 →</span>
            </div>
          </div>
        </a>
      </article>`;
    });

    gridContainer.innerHTML = html;

    // Render pagination buttons
    if (paginationContainer) {
      let pageNumsHtml = '';
      for (let i = 1; i <= totalPages; i++) {
        pageNumsHtml += `<button type="button" class="pagination-number ${i === currentPage ? 'is-active' : ''}" data-page="${i}">${i}</button>`;
      }

      paginationContainer.innerHTML = `
        <button type="button" class="pagination-prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="이전 페이지">← 이전</button>
        <div class="pagination-numbers">${pageNumsHtml}</div>
        <button type="button" class="pagination-next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="다음 페이지">다음 →</button>
      `;

      // Re-bind pagination events
      paginationContainer.querySelector('.pagination-prev')?.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderCases();
          gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      paginationContainer.querySelector('.pagination-next')?.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderCases();
          gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      paginationContainer.querySelectorAll('.pagination-number').forEach(btn => {
        btn.addEventListener('click', (e) => {
          currentPage = parseInt(e.target.getAttribute('data-page'), 10);
          renderCases();
          gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  }

  // Filter click handlers
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => b.classList.remove('is-active'));
      e.target.classList.add('is-active');
      currentCategory = e.target.getAttribute('data-filter');
      currentPage = 1;
      renderCases();
    });
  });

  // Initial render
  renderCases();
})();
