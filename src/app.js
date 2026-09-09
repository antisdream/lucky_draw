const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const PALETTE = ['#ff76ab', '#f9d95f', '#d6ed75', '#91d6b7', '#8ba5f8', '#d4b6eb', '#ffb788', '#f4a2b9'];
const GAMES = {
  roulette: { title: '럭키 룰렛', eyebrow: '01 / SPIN', action: '룰렛 돌리기', ready: '준비됐나요? 행운을 돌려보세요.', running: '빙글빙글, 행운이 가까워지고 있어요.', finish: '행운이 멈춘 곳!' },
  dart: { title: '다트 한 방', eyebrow: '02 / THROW', action: '원판 회전 · 던질 준비', ready: '시작 후 아래 핀을 잡고 원판으로 끌어 놓으세요.', running: '핀을 위로 끌어 던지세요. 빗나가면 다시!', finish: '행운에 명중!' },
  munch: { title: '냠냠 마지막 쿠키', eyebrow: '03 / LAST BITE', action: '몬스터 깨우기', ready: '쿠키를 냠냠! 딱 하나만 남겨줘.', running: '몬스터가 쿠키를 먹고 있어요…', finish: '마지막 쿠키의 주인공!' },
  tail: { title: '꼬리 뽑는 우체통', eyebrow: '04 / PULL', action: '꼬리 고를 준비', ready: '다섯 꼬리 뒤에 숨은 행운의 편지.', running: '하나를 잡고 아래로 쭉 당겨보세요.', finish: '꼬리 끝에 도착한 행운!' }
};
const ENTRY_PAGE_SIZE = 6, RESULT_PAGE_SIZE = 24, DISPLAY_SIZE = 12;
let portable = {};
try { portable = JSON.parse($('portable-state').textContent || '{}'); } catch { /* Fall back to an empty setup. */ }
const DEVICE_STORAGE_KEY = 'lucky-draw.portable.v1';
const MOTION_STORAGE_KEY = 'lucky-draw.motion.v1';
const hasEmbeddedConfig = !!portable.config;
const webEnvironment = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
const nativeApp = typeof location !== 'undefined' && location.hostname === 'appassets.androidplatform.net';
const installableLocation = webEnvironment && (/\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname));
if (!portable.config && webEnvironment) {
  try { const saved=localStorage.getItem(DEVICE_STORAGE_KEY);if(saved)portable=normalizePortable(JSON.parse(saved)); } catch { /* Storage can be unavailable or contain an older save. */ }
}
const defaults = { owner: '', mode: 'numbers', start: '1', count: '12', people: '1', rounds: '1', repeat: false, duration: '3400', game: 'roulette', motionMode: 'system', reduced: false, manual: ['1','2','3','4','5','6'], csvEntries: [] };
const state = { ...defaults };
if (portable.config && typeof portable.config === 'object') {
  for (const key of ['owner','start','count','people','rounds']) if (typeof portable.config[key] === 'string') state[key] = portable.config[key];
  for (const key of ['repeat','reduced']) if (typeof portable.config[key] === 'boolean') state[key] = portable.config[key];
  for (const key of ['manual','csvEntries']) if (Array.isArray(portable.config[key])) state[key] = portable.config[key].map(String);
  if (['numbers','manual','csv'].includes(portable.config.mode)) state.mode = portable.config.mode;
  if (Object.hasOwn(GAMES, portable.config.game)) state.game = portable.config.game;
  if (['1800','3400','5000'].includes(portable.config.duration)) state.duration = portable.config.duration;
}
state.motionMode = motionModeFromConfig(portable.config);
if (webEnvironment && !hasEmbeddedConfig) {
  try { const mode=localStorage.getItem(MOTION_STORAGE_KEY);if(['system','full','reduced'].includes(mode))state.motionMode=mode; } catch { /* HTML saving still preserves the preference. */ }
}
state.reduced = state.motionMode === 'reduced';
let entryPage = 0, resultPage = 0, csvRows = [], csvFile = null, csvLoadId = 0;
let running = false, activeRun = null, lastResult = null, resultFresh = true;
let soundEnabled = false, audioContext = null, toastTimer;
let htmlDownloadUrl = null, htmlShareFile = null;
let stageFrame = { progress: 0, items: [], winner: 0, ended: false };
let pointerGesture = null;
const motionPreference = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
const reducedMotion = () => shouldReduceMotion(state.motionMode, motionPreference.matches);
const nextPaint = () => new Promise(resolve => setTimeout(resolve, 0));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function showError(message) { $('form-error').textContent = message; $('form-error').hidden = !message; }
function configFromInputs() {
  state.owner = $('owner').value;
  state.start = $('number-start').value; state.count = $('number-count').value;
  state.people = $('people').value; state.rounds = $('rounds').value;
  state.repeat = $('repeat').checked; state.duration = $('duration').value;
  return state;
}
function currentPool() {
  configFromInputs();
  return makePool({ ...state, entries: state.mode === 'manual' ? state.manual : state.csvEntries });
}
function ownerName() { return state.owner.trim() || '우리'; }
function updateOwner() {
  state.owner = $('owner').value;
  $('play-heading').textContent = `${ownerName()}의 럭키드로우`;
  document.title = `${ownerName()}의 럭키드로우`;
}
function markChanged() {
  if (lastResult) { resultFresh = false; $('result-subtitle').textContent = '이전 추첨 결과 · 새 설정은 다음 시작에 적용돼요'; }
}
function updateStats(redraw = true) {
  configFromInputs();
  let pool;
  try {
    pool = currentPool();
    $('candidate-badge').textContent = `${formatCount(pool.size)}명`;
    $('stage-note').textContent = ['dart','tail','munch'].includes(state.game) ? `총 ${formatCount(pool.size)}명의 후보에서 같은 확률로 뽑아요. 소품의 개수는 후보 수와 달라요.` : pool.size > BigInt(DISPLAY_SIZE) ? '화면에는 일부 후보만 보여요. 추첨에는 모든 후보가 같은 확률로 참여해요.' : '모든 후보에게 같은 기회, 결과는 무작위로.';
  } catch { $('candidate-badge').textContent = '후보 확인'; }
  try {
    const people = positiveInteger(state.people), rounds = positiveInteger(state.rounds);
    $('draw-summary').textContent = `${formatCount(rounds)}회 × ${formatCount(people)}명 = 총 ${formatCount(people * rounds)}명 · 연출은 한 번만`;
  } catch { $('draw-summary').textContent = '인원과 횟수는 1 이상의 정수로 입력해주세요.'; }
  if (state.mode === 'numbers') {
    const target = $('number-preview'); target.replaceChildren();
    try {
      const first = integer(state.start), count = positiveInteger(state.count);
      for (let i = 0n; i < (count < 4n ? count : 4n); i++) {
        const label = (first + i).toString(), ball = el('span', 'number-ball', shortLabel(label, 4));
        ball.title = label; target.append(ball);
      }
      if (count > 4n) target.append(el('span', 'number-more', `+ ${formatCount(count - 4n)}명`));
    } catch { target.append(el('span', 'helper', '시작 번호와 후보 수를 확인해주세요.')); }
  }
  if (redraw && !running) {
    stageFrame = { progress: 0, items: previewItems(pool), winner: 0, ended: false };
    document.querySelector('.game-panel').classList.remove('is-result');
    $('stage-status').textContent = GAMES[state.game].ready;
    renderStage();
  }
}
function previewItems(pool) {
  if (!pool) return [{ index: 0n, label: '?' }];
  const count = Number(pool.size < BigInt(DISPLAY_SIZE) ? pool.size : BigInt(DISPLAY_SIZE));
  return Array.from({ length: count }, (_, i) => {
    const index = pool.size <= BigInt(DISPLAY_SIZE) ? BigInt(i) : BigInt(i) * pool.size / BigInt(count);
    return { index, label: pool.labelAt(index) };
  });
}
function setMode(mode, focus = false) {
  if (running) return;
  state.mode = mode;
  for (const button of document.querySelectorAll('[data-mode]')) {
    const selected = button.dataset.mode === mode;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $(`panel-${button.dataset.mode}`).hidden = !selected;
    if (selected && focus) button.focus();
  }
  renderEntries(); updateStats(); showError(''); markChanged();
}
function renderEntries(focusIndex = null) {
  const pages = Math.max(1, Math.ceil(state.manual.length / ENTRY_PAGE_SIZE));
  entryPage = Math.min(entryPage, pages - 1);
  const rows = $('entry-rows'); rows.replaceChildren();
  const offset = entryPage * ENTRY_PAGE_SIZE;
  for (let i = offset; i < Math.min(offset + ENTRY_PAGE_SIZE, state.manual.length); i++) {
    const row = el('div', 'entry-row'), input = el('input');
    input.type = 'text'; input.value = state.manual[i]; input.placeholder = String(i + 1);
    input.setAttribute('aria-label', `후보 ${i + 1}`); input.autocomplete = 'off';
    input.addEventListener('input', () => { state.manual[i] = input.value; updateStats(); markChanged(); });
    const remove = el('button', '', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `후보 ${i + 1} 삭제`);
    remove.addEventListener('click', () => { state.manual.splice(i, 1); renderEntries(); updateStats(); markChanged(); });
    row.append(el('span', '', String(i + 1)), input, remove); rows.append(row);
    if (i === focusIndex) requestAnimationFrame(() => { input.focus(); input.select(); });
  }
  if (!state.manual.length) rows.append(el('p', 'helper', '후보 추가 버튼으로 첫 후보를 넣어주세요.'));
  $('entry-page').textContent = `${entryPage + 1} / ${pages}`;
  $('entry-prev').disabled = entryPage === 0; $('entry-next').disabled = entryPage >= pages - 1;
}
function refreshCsvColumns() {
  const selected = Number($('csv-column').value) || 0;
  const count = csvRows.reduce((max, row) => Math.max(max, row.length), 0);
  $('csv-column').replaceChildren();
  for (let i = 0; i < count; i++) {
    const name = $('csv-header').checked ? (csvRows[0]?.[i] || `열 ${i + 1}`) : `열 ${i + 1}`;
    const option = el('option', '', shortLabel(name, 50)); option.value = String(i); $('csv-column').append(option);
  }
  $('csv-column').value = String(Math.min(selected, Math.max(0, count - 1)));
  $('csv-options').hidden = !csvRows.length;
  applyCsvColumn();
}
function applyCsvColumn() {
  state.csvEntries = columnEntries(csvRows, Number($('csv-column').value) || 0, $('csv-header').checked);
  $('csv-preview').textContent = `${state.csvEntries.length.toLocaleString('ko-KR')}명 준비 · ${state.csvEntries.slice(0, 4).join(', ')}${state.csvEntries.length > 4 ? ' …' : ''}`;
  updateStats(); markChanged();
}
async function loadCsv(file) {
  if (!file || running) return;
  const loadId = ++csvLoadId; csvFile = file;
  $('csv-filename').textContent = '파일을 읽고 있어요…';
  try {
    const bytes = await file.arrayBuffer();
    if (loadId !== csvLoadId || running) return;
    let text;
    try { text = new TextDecoder($('csv-encoding').value, { fatal: true }).decode(bytes); }
    catch { throw new Error('글자를 읽을 수 없어요. 파일 인코딩을 한국어 Windows (CP949) 또는 UTF-8로 바꿔주세요.'); }
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('파일에 후보가 없습니다. 파일 내용을 확인해주세요.');
    csvRows = rows; $('csv-filename').textContent = file.name;
    refreshCsvColumns(); showError(''); toast('파일을 읽었어요. 후보가 있는 열을 확인해주세요.');
  } catch (error) {
    if (loadId !== csvLoadId) return;
    $('csv-filename').textContent = '파일을 다시 선택해주세요';
    csvRows = []; state.csvEntries = []; $('csv-options').hidden = true;
    updateStats(); showError(error.message);
  }
}
function selectGame(game, changeView = true) {
  if (running || !Object.hasOwn(GAMES, game)) return;
  if (lastResult && lastResult.game !== game) markChanged();
  state.game = game;
  $('game-title').textContent = GAMES[game].title; $('stage-eyebrow').textContent = GAMES[game].eyebrow;
  $('gesture-help').hidden = !['dart','tail'].includes(game);
  $('gesture-help').textContent = game==='dart' ? '핀의 방향은 직접 조작해요. 명중하면 전체 후보에서 무작위로 뽑아요. 원판 숫자는 당첨 번호가 아니에요.' : '꼬리 색은 선택하는 재미! 편지의 주인공은 전체 후보에서 무작위로 뽑아요.';
  $('start-label').textContent = GAMES[game].action; $('game-canvas').setAttribute('aria-label', `${GAMES[game].title} 추첨 화면`);
  document.querySelector('.game-panel').dataset.game = game;
  if (changeView) { $('home-view').hidden = true; $('play-view').hidden = false; window.scrollTo({ top: 0, behavior: 'instant' }); }
  updateOwner(); updateStats();
  requestAnimationFrame(renderStage);
}
function goHome() {
  if (running) return;
  $('play-view').hidden = true; $('home-view').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' }); requestAnimationFrame(renderPreviews);
}
function setRunning(value) {
  running = value; $('settings').disabled = value; $('start-button').disabled = value;
  $('home-button').disabled = value; $('back-button').disabled = value; $('edit-owner').disabled = value;
  $('save-html').disabled = value; $('run-actions').hidden = !value;
  $('restore-file').disabled = value; $('save-device').disabled = value;
  $('motion-mode').disabled = value;
  document.querySelector('.game-panel').classList.toggle('is-running', value);
  $('game-canvas').setAttribute('aria-busy', String(value));
  $('gesture-assist').hidden = true;
  $('game-canvas').classList.toggle('gesture-active', value && ['dart','tail'].includes(state.game));
  if(!value)pointerGesture=null;
}
function makeDisplayItems(pool, winner) {
  if (pool.size <= BigInt(DISPLAY_SIZE)) return previewItems(pool);
  const sample = makeSampler(pool.size), seen = new Set([winner.toString()]);
  const indexes = [winner];
  while (indexes.length < DISPLAY_SIZE) { const i = sample.next(); if (!seen.has(i.toString())) { seen.add(i.toString()); indexes.push(i); } }
  const position = Number(randomBelow(BigInt(DISPLAY_SIZE)));
  [indexes[0], indexes[position]] = [indexes[position], indexes[0]];
  return indexes.map(index => ({ index, label: pool.labelAt(index) }));
}
async function startDraw() {
  if (running) return;
  let pool, options;
  try { pool = currentPool(); options = validateDraw(pool, state.people, state.rounds, state.repeat); }
  catch (error) { showError(error.message); return; }
  showError(''); $('results').hidden = true;
  const reduced = reducedMotion();
  const run = { cancelled: false, skip: false, computed: false, animationDone: false, draws: [], startedAt: performance.now(), options, pool, game: state.game, owner: ownerName(), repeat: state.repeat, reduced, duration: reduced ? 160 : Number(state.duration) };
  activeRun = run; setRunning(true);
  $('stage-status').textContent = GAMES[run.game].running; $('start-label').textContent = '행운을 찾고 있어요…';
  if (options.total > 1n) $('stage-note').textContent = `연출은 첫 번째 결과를 보여줘요. 총 ${formatCount(options.total)}명의 결과는 아래에 함께 공개돼요.`;
  if(['dart','tail'].includes(run.game)){
    run.waiting=true;run.angle=0;
    stageFrame={progress:0,items:previewItems(pool),winner:0,ended:false,interaction:run};
    $('gesture-assist').hidden=false;$('gesture-assist').textContent=run.game==='dart'?'버튼으로 가운데 던지기':'버튼으로 가운데 꼬리 당기기';
    $('skip-button').hidden=true;$('game-canvas').focus({preventScroll:true});
    $('stage').scrollIntoView({behavior:'instant',block:'start'});
    waitForGesture(run);return;
  }
  return computeDraw(run);
}
async function computeDraw(run){
  const {pool,options}=run;
  if(activeRun!==run||run.cancelled||run.computing)return;
  run.computing=true;run.waiting=false;run.angleAtThrow=run.angle||0;run.startedAt=performance.now();
  if(run.game==='dart')$('stage-status').textContent='다트가 날아갑니다!';
  if(run.game==='tail')$('stage-status').textContent='꼬리 끝의 편지를 열고 있어요!';
  $('gesture-assist').hidden=true;$('skip-button').hidden=false;
  try {
    if (soundEnabled) initSound();
    const sampler = makeSampler(pool.size, run.repeat);
    const firstIndex = sampler.next();
    run.draws.push({ label: pool.labelAt(firstIndex), id: pool.idAt(firstIndex) });
    const items = makeDisplayItems(pool, firstIndex);
    const winner = items.findIndex(item => item.index === firstIndex);
    stageFrame = { progress: 0, items, winner, ended: false, interaction:run };
    animateRun(run);
    let generated = 1n;
    while (generated < options.total) {
      const budgetStart = performance.now();
      do {
        const index = sampler.next(); run.draws.push({ label: pool.labelAt(index), id: pool.idAt(index) }); generated++;
      } while (generated < options.total && performance.now() - budgetStart < 8);
      if (run.cancelled) return;
      if (performance.now() - run.startedAt > run.duration) $('stage-status').textContent = `후보를 뽑는 중 · ${formatCount(generated)} / ${formatCount(options.total)}명`;
      await nextPaint();
      if (run.cancelled) return;
    }
    run.computed = true;
    if (run.animationDone || run.skip) finishRun(run);
  } catch (error) {
    if (run.cancelled || activeRun !== run) return;
    run.cancelled = true; setRunning(false); activeRun = null;
    $('start-label').textContent = GAMES[state.game].action;
    showError(error instanceof RangeError ? '이 기기의 메모리로 결과를 모두 담기 어려워요. 뽑을 인원 또는 반복 횟수를 줄여 다시 시작해주세요.' : error.message);
    updateStats();
  }
}
function waitForGesture(run){
  function frame(now){
    if(activeRun!==run||run.cancelled||!run.waiting)return;
    run.angle=run.reduced?0:(now-run.startedAt)*.0012;
    if(run.miss){const t=Math.min(1,(now-run.miss.at)/450);stageFrame.progress=t*.7;run.flight=run.miss;if(t===1){run.miss=null;run.flight=null;stageFrame.progress=0;}}
    renderStage();requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function assistGesture(){
  const run=activeRun;if(!run?.waiting||run.miss)return;
  const rect=$('game-canvas').getBoundingClientRect(),b=dartLayout(rect.width,rect.height);
  pointerGesture=null;run.drag=null;
  if(run.game==='dart')run.flight={fromX:b.launchX,fromY:b.launchY,x:b.x+b.radius*.25,y:b.y,hit:true,width:rect.width,height:rect.height};
  else run.slot=2;
  return computeDraw(run);
}
function gesturePoint(event){const r=$('game-canvas').getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top,w:r.width,h:r.height};}
function pointerDown(event){
  const run=activeRun;if(!run?.waiting||run.miss||pointerGesture||event.isPrimary===false||event.button>0)return;
  const point=gesturePoint(event),b=dartLayout(point.w,point.h);
  if(run.game==='dart'&&Math.hypot(point.x-b.launchX,point.y-b.launchY)>Math.max(36,point.w*.12))return;
  if(run.game==='tail'&&(point.y<point.h*.48||point.y>point.h*.85||point.x<point.w*.08||point.x>point.w*.92))return;
  event.preventDefault();pointerGesture={...point,id:event.pointerId};run.slot=tailSlot(point.x,point.w);run.drag={...point,startY:point.y};
  $('game-canvas').setPointerCapture(event.pointerId);
}
function pointerMove(event){
  if(!pointerGesture||event.pointerId!==pointerGesture.id||!activeRun?.waiting)return;
  event.preventDefault();activeRun.drag={...gesturePoint(event),startY:pointerGesture.y};renderStage();
}
function pointerEnd(event,cancelled=false){
  const run=activeRun,start=pointerGesture;if(!start||event.pointerId!==start.id)return;
  pointerGesture=null;const point=gesturePoint(event);if(run)run.drag=null;
  const canvas=$('game-canvas');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  if(cancelled||!run?.waiting||run.cancelled){renderStage();return;}
  if(run.game==='dart'){
    const flight=evaluateThrow(start,point,point.w,point.h);
    if(!flight.valid){$('stage-status').textContent='핀을 원판 쪽으로 충분히 끌어 놓으세요.';return;}
    if(!flight.hit){run.miss={...flight,at:performance.now()};$('stage-status').textContent='아깝다! 빗나갔어요. 다시 던져보세요.';return;}
    run.flight=flight;
  }else if(!pullAccepted(start,point,point.h)){$('stage-status').textContent='꼬리를 조금 더 아래로 당겨보세요.';return;}
  $('stage-status').textContent=run.game==='dart'?'다트가 날아갑니다!':'꼬리 끝의 편지를 열고 있어요!';
  void computeDraw(run);
}
function animateRun(run) {
  let lastBeat = -1;
  function frame(now) {
    if (activeRun !== run || run.cancelled) return;
    const p = run.skip ? 1 : Math.min(1, (now - run.startedAt) / run.duration);
    stageFrame.progress = p;
    if(run.game==='dart')run.angle=run.reduced?0:run.angleAtThrow+Math.min(.7,p)*run.duration*.0012;
    if (!run.reduced || p >= 1) renderStage();
    const beat = Math.floor((1 - Math.pow(1 - p, 3)) * 14);
    if (beat !== lastBeat && p < .92) { if (!run.reduced) tone(240 + beat * 18, .025, .018); lastBeat = beat; }
    if (p < 1) requestAnimationFrame(frame);
    else { run.animationDone = true; if (run.computed) finishRun(run); }
  }
  requestAnimationFrame(frame);
}
function finishRun(run) {
  if (activeRun !== run || run.cancelled || !run.computed) return;
  run.animationDone = true; stageFrame.progress = 1; stageFrame.ended = true;
  renderStage(); setRunning(false); activeRun = null;
  document.querySelector('.game-panel').classList.add('is-result');
  $('stage-status').textContent = `${GAMES[run.game].finish} ${shortLabel(run.draws[0].label, 34)}${run.draws.length > 1 ? ` 외 ${formatCount(BigInt(run.draws.length) - 1n)}명` : ''}`;
  $('start-label').textContent = '한 번 더 뽑기';
  lastResult = { draws: run.draws, perRound: run.options.perRound.toString(), rounds: run.options.roundCount.toString(), candidateCount: run.pool.size.toString(), game: run.game, owner: run.owner, repeat: run.repeat, at: new Date().toISOString() };
  resultFresh = true; resultPage = 0; renderResults();
  if (!run.reduced) burst();
  tone(523.25, .14, .045); setTimeout(() => tone(659.25, .16, .035), 90); setTimeout(() => tone(783.99, .23, .035), 180);
  $('results').focus({ preventScroll: true });
  $('results').scrollIntoView({ behavior: 'instant', block: 'start' });
}
function cancelDraw() {
  if (!activeRun) return;
  activeRun.cancelled = true; activeRun.draws = []; activeRun = null;
  setRunning(false); updateStats(); $('start-label').textContent = GAMES[state.game].action;
  if (lastResult) renderResults();
  toast('이번 추첨을 취소했어요.');
}
function renderResults() {
  if (!lastResult) return;
  $('results').hidden = false;
  const perRound = positiveInteger(lastResult.perRound), count = lastResult.draws.length;
  $('result-subtitle').textContent = resultFresh ? "TODAY'S LUCKY PICKS" : '이전 추첨 결과 · 새 설정은 다음 시작에 적용돼요';
  $('results-heading').textContent = count === 1 ? '오늘의 행운이 도착했어요!' : `${count.toLocaleString('ko-KR')}명의 행운이 도착했어요!`;
  const date = new Date(lastResult.at).toLocaleString('ko-KR', { hour12: false });
  $('results-description').textContent = `${lastResult.owner}의 ${GAMES[lastResult.game].title} · ${formatCount(lastResult.rounds)}회 × ${formatCount(perRound)}명 · ${lastResult.repeat ? '중복 허용' : '전체 회차 중복 없음'} · ${date}`;
  const pages = Math.max(1, Math.ceil(count / RESULT_PAGE_SIZE)); resultPage = Math.min(resultPage, pages - 1);
  const list = $('result-list'); list.replaceChildren();
  for (let i = resultPage * RESULT_PAGE_SIZE; i < Math.min((resultPage + 1) * RESULT_PAGE_SIZE, count); i++) {
    const draw = lastResult.draws[i], round = BigInt(i) / perRound + 1n, place = BigInt(i) % perRound + 1n;
    const card = el('article', 'result-card');
    card.append(el('span', 'pick-meta', `${formatCount(round)}회차 · ${formatCount(place)}번째 선정`), el('span', 'pick-order', `#${i + 1}`), el('strong', '', draw.label));
    list.append(card);
  }
  $('result-page').textContent = `${resultPage + 1} / ${pages} 페이지`;
  $('result-prev').disabled = resultPage === 0; $('result-next').disabled = resultPage >= pages - 1;
  document.querySelector('.result-pagination').hidden = pages <= 1;
}

// Canvas drawing uses only geometry. Actual selections come from the sampler above.
function shortLabel(text, length = 10) { const chars = Array.from(String(text)); return chars.length > length ? chars.slice(0, length - 1).join('') + '…' : String(text); }
function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = rect.width, h = rect.height;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function circle(ctx, x, y, r, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function line(ctx, points, color, width = 2) {
  ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function roundBox(ctx, x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
  else{const radius=Math.min(r,w/2,h/2);ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();}
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function canvasText(ctx, text, x, y, size = 16, color = '#202721', weight = 700, align = 'center', maxWidth = null) {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Segoe UI", "Malgun Gothic", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  let label=String(text);
  if(maxWidth){const chars=Array.from(label);while(chars.length>1&&ctx.measureText(chars.join('')+'…').width>maxWidth)chars.pop();if(chars.length<Array.from(label).length)label=chars.join('')+'…';}
  ctx.fillText(label, x, y);
}
function sparkle(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x,y); ctx.beginPath();
  for (let i=0;i<8;i++) { const a=i*Math.PI/4; const r=i%2 ? size*.26 : size; const px=Math.cos(a)*r, py=Math.sin(a)*r; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
  ctx.closePath(); ctx.fillStyle=color; ctx.fill(); ctx.restore();
}
function drawWheel(ctx, w, h, frame, dart = false, mini = false) {
  const size = Math.min(w * (mini ? .39 : .36), h * .405), cx = w / 2, cy = h / 2 + 7;
  const items = frame.items.length ? frame.items : [{ label: '?' }], count = items.length;
  const arc = TAU / count, p = frame.progress;
  const ease = 1 - Math.pow(1 - p, dart ? 3 : 4);
  const aim = dart ? -.68 : -Math.PI / 2;
  const target = aim - (frame.winner + .5) * arc;
  const initial = -.32;
  const cycles = dart ? 4 : 5;
  let final = target + cycles * TAU;
  while(final < initial + cycles * TAU) final += TAU;
  const angle = p > 0 ? initial + (final - initial) * ease : initial;
  circle(ctx, cx, cy + 8, size + 7, '#202721');
  circle(ctx, cx, cy, size + 9, mini ? '#fffaf0' : '#fff', '#202721', 2);
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
  items.forEach((item, i) => {
    const start=i*arc,end=start+arc;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,size,start,end);ctx.closePath();
    ctx.fillStyle=dart ? (i%2 ? '#f7f9e9' : '#dcf36b') : PALETTE[i%PALETTE.length];ctx.fill();ctx.strokeStyle='#202721';ctx.lineWidth=mini?1:1.5;ctx.stroke();
    if(dart){ctx.beginPath();ctx.arc(0,0,size*.72,start,end);ctx.strokeStyle='#293926';ctx.lineWidth=mini?1.2:2;ctx.stroke();}
    ctx.save();ctx.rotate(start+arc/2);ctx.translate(size*.66,0);
    const mid=((start+arc/2+angle)%TAU+TAU)%TAU;
    if(mid>Math.PI/2&&mid<Math.PI*1.5)ctx.rotate(Math.PI);
    if(!mini)canvasText(ctx,shortLabel(item.label,count>8?7:10),0,0,Math.max(12,Math.min(17,size*.10)), '#202721',650,'center',size*.58);
    else if(dart)canvasText(ctx,String(i+1),0,0,12,'#202721',650);
    ctx.restore();
  });
  ctx.restore();
  circle(ctx,cx,cy,size*.18, dart?'#202721':'#fffaf0','#202721',mini?1.3:2);
  canvasText(ctx,dart?'✳':'✦',cx,cy+1,size*.23,dart?'#dcf36b':'#202721',500);
  if(!dart){
    ctx.beginPath();ctx.moveTo(cx-11,cy-size-14);ctx.lineTo(cx+11,cy-size-14);ctx.lineTo(cx,cy-size+10);ctx.closePath();ctx.fillStyle='#202721';ctx.fill();
    sparkle(ctx,cx+size+25,cy-size*.65,mini?11:14,'#e54c87');sparkle(ctx,cx-size-20,cy+size*.48,mini?7:10,'#e54c87');
  } else {
    const hitX=cx+Math.cos(aim)*size*.61,hitY=cy+Math.sin(aim)*size*.61;
    const flight=mini?1:Math.max(0,Math.min(1,(p-.77)/.14));
    if(mini||p>.77){
      const x=hitX+(1-flight)*size*1.5,y=hitY-(1-flight)*size*.8;
      ctx.save();ctx.translate(x,y);ctx.rotate(-.67);line(ctx,[[0,0],[size*.64,-size*.34]],'#202721',mini?4:5);
      ctx.beginPath();ctx.moveTo(size*.43,-size*.25);ctx.lineTo(size*.65,-size*.49);ctx.lineTo(size*.73,-size*.28);ctx.lineTo(size*.66,-size*.1);ctx.closePath();ctx.fillStyle='#ff5494';ctx.fill();ctx.strokeStyle='#202721';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      if(flight===1){circle(ctx,hitX,hitY,5,'#202721');if(!mini&&p<.97)circle(ctx,hitX,hitY,(p-.9)*500+12,null,'#ff5494',2);}
    }
    sparkle(ctx,cx-size-20,cy-size*.6,mini?9:14,'#7eaa2c');
  }
}
function drawScene(canvas,game,frame,mini=false){
  const setup=setupCanvas(canvas);if(!setup)return;
  const {ctx,w,h}=setup;
  if(game==='roulette')drawWheel(ctx,w,h,frame,false,mini);
  else if(game==='dart')drawDart(ctx,w,h,frame,mini);
  else if(game==='munch')drawMunch(ctx,w,h,frame,mini);
  else drawTail(ctx,w,h,frame,mini);
}
function renderStage(){drawScene($('game-canvas'),state.game,stageFrame);}
function renderPreviews(){
  for(const canvas of document.querySelectorAll('[data-preview]'))drawScene(canvas,canvas.dataset.preview,{progress:0,winner:5,items:Array.from({length:8},(_,i)=>({label:String(i+1)}))},true);
}
function burst(){
  $('stage-burst').replaceChildren();
  for(let i=0;i<25;i++){
    const piece=el('span','confetti-piece');piece.style.left=`${12+(i*37)%78}%`;piece.style.background=PALETTE[i%PALETTE.length];piece.style.setProperty('--drift',`${(i%2?1:-1)*(15+i*3)}px`);piece.style.setProperty('--spin',`${i*73}deg`);piece.style.animationDelay=`${i%5*.025}s`;$('stage-burst').append(piece);
  }
  setTimeout(()=>$('stage-burst').replaceChildren(),1300);
}
function initSound(){
  try{if(!audioContext){const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)throw new Error('unavailable');audioContext=new Constructor();}if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}
  catch{soundEnabled=false;updateSound();toast('이 브라우저에서는 효과음을 재생할 수 없어요.');}
}
function tone(frequency,duration,volume){
  if(!soundEnabled||!audioContext||audioContext.state!=='running')return;
  try{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}catch{/* Sound must never interrupt a draw. */}
}
function updateSound(){const label=soundEnabled?'효과음 끄기':'효과음 켜기';$('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));$('sound-toggle').setAttribute('aria-label',label);$('sound-toggle').title=label;}
function updateMotion(){
  const reduced=reducedMotion();
  document.body.dataset.reduced=String(reduced);$('motion-mode').value=state.motionMode;
  $('motion-status').textContent=state.motionMode==='system'
    ?(reduced?'기기의 움직임 줄이기 설정을 따라 결과를 빠르게 보여줘요.':'기기 설정에 따라 전체 애니메이션을 보여줘요.')
    :(reduced?'큰 움직임 없이 결과를 빠르게 보여줘요.':'선택한 시간 동안 게임 연출을 보여줘요.');
}
function saveMotionPreference(){
  state.reduced=state.motionMode==='reduced';
  if(webEnvironment)try{localStorage.setItem(MOTION_STORAGE_KEY,state.motionMode);}catch{/* The choice remains in this page and exported HTML. */}
}
function changeMotionMode(){
  if(running)return;
  state.motionMode=motionModeFromConfig({motionMode:$('motion-mode').value});
  saveMotionPreference();updateMotion();
}
async function nativeSave(blob,name){
  if(!window.LuckyFiles?.postMessage){toast('Android System WebView를 업데이트한 뒤 다시 저장해주세요.');return;}
  try{window.LuckyFiles.postMessage(JSON.stringify({name,type:name.endsWith('.html')?'text/html':'text/csv',text:name.endsWith('.csv')?'\uFEFF'+(await blob.text()).replace(/^\uFEFF/,''):await blob.text()}));}
  catch{toast('파일을 만들지 못했어요. 저장 공간을 확인해주세요.');}
}
function download(blob,name){if(nativeApp){void nativeSave(blob,name);return;}const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function getPortableSnapshot(){configFromInputs();return {version:1,config:{...state},lastResult,resultFresh,view:$('play-view').hidden?'home':'play'};}
async function exportCsv(){
  if(!lastResult)return;
  const snapshot=lastResult, parts=['\uFEFF'+['회차','회차 내 순서','이름 또는 번호','후보 ID','게임','추첨 시각'].map(csvCell).join(',')+'\r\n'];
  const perRound=BigInt(snapshot.perRound);
  for(let offset=0;offset<snapshot.draws.length;offset+=2000){let block='';for(let i=offset;i<Math.min(offset+2000,snapshot.draws.length);i++){const row=snapshot.draws[i];block+=[BigInt(i)/perRound+1n,BigInt(i)%perRound+1n,row.label,row.id,GAMES[snapshot.game].title,snapshot.at].map(csvCell).join(',')+'\r\n';}parts.push(block);await nextPaint();}
  download(new Blob(parts,{type:'text/csv;charset=utf-8'}),'lucky-draw-results.csv');toast('CSV 다운로드를 요청했어요. 내려받은 파일을 확인해주세요.');
}
async function copyResults(){
  if(!lastResult)return;
  const snapshot=lastResult,perRound=BigInt(snapshot.perRound);
  const text=snapshot.draws.map((draw,i)=>`${BigInt(i)/perRound+1n}회차 · ${BigInt(i)%perRound+1n}번째: ${draw.label}`).join('\n');
  try{await navigator.clipboard.writeText(text);toast('결과를 복사했어요.');}
  catch{const textarea=el('textarea');textarea.value=text;textarea.style.position='fixed';textarea.style.left='-9999px';document.body.append(textarea);textarea.select();let copied=false;try{copied=document.execCommand('copy');}catch{}textarea.remove();toast(copied?'결과를 복사했어요.':'복사가 지원되지 않아요. CSV 저장을 이용해주세요.');}
}
function exportHtml(){
  if(running)return;
  try{
    const snapshot=getPortableSnapshot();
    const clone=document.documentElement.cloneNode(true);
    clone.querySelector('#portable-state').textContent=safeJSON(snapshot);
    clone.querySelectorAll('dialog').forEach(dialog=>dialog.removeAttribute('open'));
    clone.querySelector('#toast').hidden=true;clone.querySelector('#stage-burst').replaceChildren();
    clone.querySelector('body').setAttribute('data-app-ready','false');clone.querySelector('#launch-help').hidden=false;
    clone.querySelector('#download-html-link').removeAttribute('href');
    clone.querySelectorAll('[data-hosted-asset]').forEach(asset=>asset.remove());
    const html='<!doctype html>\n'+clone.outerHTML;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    if(htmlDownloadUrl){const old=htmlDownloadUrl;setTimeout(()=>URL.revokeObjectURL(old),30000);}
    htmlDownloadUrl=URL.createObjectURL(blob);$('download-html-link').href=htmlDownloadUrl;
    htmlShareFile=typeof File==='function'?new File([blob],'lucky_draw.html',{type:'text/html'}):null;
    let shareable=false;try{shareable=!!(htmlShareFile&&navigator.canShare&&navigator.canShare({files:[htmlShareFile]}));}catch{}
    $('share-html').hidden=!shareable;$('download-status').textContent='후보·설정·마지막 결과를 담았습니다. 내려받은 파일을 확인해주세요.';
    $('download-dialog').showModal();$('download-html-link').click();
  }catch{toast('파일을 담을 메모리가 부족해요. 후보나 결과 수를 줄여주세요.');}
}

function writeStateInputs(){
  $('owner').value=state.owner;$('number-start').value=state.start;$('number-count').value=state.count;
  $('people').value=state.people;$('rounds').value=state.rounds;$('repeat').checked=state.repeat;$('duration').value=state.duration;
}
function applyPortableSnapshot(snapshot){
  if(running)throw new Error('추첨이 끝난 뒤 파일을 불러와주세요.');
  const checked=normalizePortable(snapshot);
  Object.assign(state,{...defaults,manual:['1','2','3','4','5','6'],csvEntries:[]},checked.config);
  state.motionMode=motionModeFromConfig(checked.config);saveMotionPreference();
  lastResult=null;entryPage=0;resultPage=0;csvRows=[];csvFile=null;csvLoadId++;
  $('results').hidden=true;$('csv-options').hidden=true;$('csv-filename').textContent='여기에 파일을 끌어놓아도 돼요';
  writeStateInputs();
  if(state.csvEntries.length){csvRows=state.csvEntries.map(label=>[label]);$('csv-header').checked=false;$('csv-filename').textContent='HTML에서 불러온 후보';refreshCsvColumns();}
  setMode(state.mode);selectGame(state.game,checked.view==='play');if(checked.view!=='play')goHome();
  lastResult=checked.lastResult;resultFresh=checked.resultFresh;updateOwner();updateMotion();
  if(lastResult)renderResults();
}
async function restoreSavedFile(file){
  if(!file||running)return;
  try{const text=typeof file.text==='function'?await file.text():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('파일을 읽지 못했어요.'));reader.readAsText(file,'utf-8');});
    const snapshot=readPortableHTML(text);applyPortableSnapshot(snapshot);$('usage-dialog').close();toast('저장된 후보·설정·결과를 불러왔어요.');
  }catch(error){$('device-status').textContent=error.message;}
  $('restore-file').value='';
}
function showUsage(){
  $('runtime-status').textContent='실행 확인: JavaScript · 게임 화면 · 무작위 추첨 · 파일 읽기';
  $('save-device').disabled=running||!webEnvironment;
  $('prepare-offline').disabled=nativeApp||!installableLocation||!window.isSecureContext||!('serviceWorker' in navigator);
  if(!webEnvironment)$('offline-status').textContent='현재 HTML은 파일 안의 코드로 작동합니다. 모바일 오프라인 준비는 웹 버전에서 이용하세요.';
  else if($('prepare-offline').disabled)$('offline-status').textContent='이 주소에서는 오프라인 준비가 지원되지 않아요. HTTPS 웹 버전을 사용해주세요.';
  if(nativeApp){$('offline-status').textContent='오프라인 APK: 게임이 앱 안에 들어 있어요. 인터넷과 로그인 없이 바로 실행됩니다.';$('prepare-offline').hidden=true;$('web-version').hidden=true;$('mobile-offline-intro').textContent='이 앱은 게임을 포함한 Android 오프라인 버전입니다. 별도 준비 없이 사용하세요.';}
  $('usage-dialog').showModal();
}
async function prepareOffline(){
  if(!installableLocation||!window.isSecureContext||!('serviceWorker' in navigator))return;
  $('prepare-offline').disabled=true;$('offline-status').textContent='이 기기에 게임을 준비하고 있어요…';
  try{
    if(!document.querySelector('link[data-hosted-asset]')){const manifest=el('link');manifest.rel='manifest';manifest.href='./app.webmanifest';manifest.dataset.hostedAsset='manifest';document.head.append(manifest);}
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    const worker=registration.installing||registration.waiting||registration.active;
    if(!worker)throw new Error('준비를 시작하지 못했어요.');
    if(worker.state!=='activated')await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(new Error('준비 시간이 초과됐어요.'));},20000);
      function changed(){if(worker.state==='activated'||worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',changed);worker.state==='activated'?resolve():reject(new Error('앱 파일을 저장하지 못했어요.'));}}
      worker.addEventListener('statechange',changed);changed();
    });
    $('offline-status').textContent='오프라인 준비 완료. 브라우저 메뉴에서 홈 화면에 추가하세요. 후보·설정은 아래 버튼으로 별도 저장할 수 있어요.';
    $('prepare-offline').textContent='오프라인 파일 다시 준비';
  }catch{$('offline-status').textContent='이 브라우저나 웹 주소에서 오프라인 준비를 완료하지 못했어요. Safari 또는 Chrome에서 인터넷 연결과 웹 버전 로그인을 확인해주세요. 준비 완료 전에는 온라인으로 이용해주세요.';}
  $('prepare-offline').disabled=false;
}
function saveOnDevice(){
  if(!webEnvironment||running)return;
  try{localStorage.setItem(DEVICE_STORAGE_KEY,safeJSON(getPortableSnapshot()));$('device-status').textContent='현재 후보·설정·마지막 결과를 이 기기에 저장했어요. 설정을 바꾸면 다시 저장해주세요.';}
  catch{$('device-status').textContent='이 브라우저에서 저장 공간을 사용할 수 없어요. HTML 저장을 이용해주세요.';}
}

// Bind controls after restoring the portable document's data.
writeStateInputs();
$('settings').disabled=false;$('home-button').disabled=false;$('back-button').disabled=false;$('save-html').disabled=false;$('edit-owner').disabled=false;$('start-button').disabled=false;
$('run-actions').hidden=true;$('form-error').hidden=true;$('results').hidden=true;
$('owner').addEventListener('input',()=>{updateOwner();markChanged();});
for(const id of ['number-start','number-count','people','rounds','repeat','duration'])$(id).addEventListener(id==='repeat'||id==='duration'?'change':'input',()=>{updateStats();showError('');markChanged();});
$('add-number').addEventListener('click',()=>{try{$('number-count').value=(positiveInteger($('number-count').value)+1n).toString();updateStats();markChanged();}catch(error){showError(error.message);}});
$('add-entry').addEventListener('click',()=>{state.manual.push(String(state.manual.length+1));entryPage=Math.floor((state.manual.length-1)/ENTRY_PAGE_SIZE);renderEntries(state.manual.length-1);updateStats();markChanged();});
$('entry-prev').addEventListener('click',()=>{entryPage--;renderEntries();});$('entry-next').addEventListener('click',()=>{entryPage++;renderEntries();});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>setMode(button.dataset.mode));
document.querySelector('[role=tablist]').addEventListener('keydown',event=>{const modes=['numbers','manual','csv'];const direction=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(direction){event.preventDefault();setMode(modes[(modes.indexOf(state.mode)+direction+3)%3],true);}});
$('bulk-open').addEventListener('click',()=>{$('bulk-text').value=state.manual.join('\n');$('bulk-append').checked=false;$('bulk-dialog').showModal();});
$('bulk-apply').addEventListener('click',()=>{const names=$('bulk-text').value.split(/\r\n|\n|\r/).map(x=>x.trim()).filter(Boolean);if(!names.length){toast('한 명 이상 입력해주세요.');return;}state.manual=$('bulk-append').checked?state.manual.concat(names):names;entryPage=0;renderEntries();updateStats();markChanged();$('bulk-dialog').close();toast(`${names.length.toLocaleString('ko-KR')}명을 ${$('bulk-append').checked?'추가':'적용'}했어요.`);});
$('csv-file').addEventListener('change',event=>loadCsv(event.target.files[0]));
$('csv-encoding').addEventListener('change',()=>{if(csvFile)loadCsv(csvFile);});
$('csv-header').addEventListener('change',refreshCsvColumns);$('csv-column').addEventListener('change',applyCsvColumn);
const drop=document.querySelector('.file-drop');
for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{event.preventDefault();if(!running)drop.classList.add('dragging');});
for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('dragging');if(type==='drop'&&!running)loadCsv(event.dataTransfer.files[0]);});
for(const button of document.querySelectorAll('.game-card[data-game]'))button.addEventListener('click',()=>selectGame(button.dataset.game));
$('home-button').addEventListener('click',goHome);$('back-button').addEventListener('click',goHome);
$('edit-owner').addEventListener('click',()=>{$('owner-edit').value=state.owner;$('owner-dialog').showModal();});
$('owner-apply').addEventListener('click',()=>{$('owner').value=$('owner-edit').value;updateOwner();markChanged();});
$('gesture-assist').addEventListener('click',assistGesture);
$('game-canvas').addEventListener('pointerdown',pointerDown);
$('game-canvas').addEventListener('pointermove',pointerMove);
$('game-canvas').addEventListener('pointerup',event=>pointerEnd(event));
$('game-canvas').addEventListener('pointercancel',event=>pointerEnd(event,true));
$('game-canvas').addEventListener('lostpointercapture',event=>pointerEnd(event,true));
$('game-canvas').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&activeRun?.waiting){event.preventDefault();assistGesture();}});
window.addEventListener('blur',()=>{pointerGesture=null;if(activeRun)activeRun.drag=null;});
$('start-button').addEventListener('click',startDraw);$('cancel-button').addEventListener('click',cancelDraw);
$('skip-button').addEventListener('click',()=>{if(!activeRun)return;activeRun.skip=true;if(activeRun.computed)finishRun(activeRun);else toast('연출은 건너뛰고, 결과 계산을 마치는 대로 보여드릴게요.');});
$('sound-toggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;if(soundEnabled)initSound();updateSound();if(soundEnabled)tone(660,.1,.03);});
$('motion-mode').addEventListener('change',changeMotionMode);
if(motionPreference.addEventListener)motionPreference.addEventListener('change',updateMotion);else if(motionPreference.addListener)motionPreference.addListener(updateMotion);
$('result-prev').addEventListener('click',()=>{resultPage--;renderResults();});$('result-next').addEventListener('click',()=>{resultPage++;renderResults();});
$('copy-results').addEventListener('click',copyResults);$('export-results').addEventListener('click',()=>exportCsv().catch(()=>toast('결과 파일을 만들지 못했어요. 다시 시도해주세요.')));
$('save-html').addEventListener('click',exportHtml);
$('usage-help').addEventListener('click',showUsage);$('usage-close').addEventListener('click',()=>$('usage-dialog').close());
$('restore-file').addEventListener('change',event=>restoreSavedFile(event.target.files[0]));
$('prepare-offline').addEventListener('click',prepareOffline);$('save-device').addEventListener('click',saveOnDevice);
$('download-close').addEventListener('click',()=>$('download-dialog').close());
$('download-html-link').addEventListener('click',event=>{if(nativeApp){event.preventDefault();if(htmlShareFile)void nativeSave(htmlShareFile,'lucky_draw.html');}});
if(nativeApp&&window.LuckyFiles)window.LuckyFiles.onmessage=event=>{$('download-status').textContent=String(event.data);toast(String(event.data));};
$('share-html').addEventListener('click',async()=>{try{await navigator.share({files:[htmlShareFile]});$('download-status').textContent='파일 공유 창에서 저장 위치를 확인해주세요.';}catch(error){if(error.name!=='AbortError')$('download-status').textContent='파일 공유를 지원하지 않아요. HTML 내려받기를 이용해주세요.';}});
let resizeFrame;function scheduleResize(){pointerGesture=null;if(activeRun)activeRun.drag=null;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{renderStage();renderPreviews();});}
if(typeof ResizeObserver==='function'){const resizeObserver=new ResizeObserver(scheduleResize);resizeObserver.observe($('game-canvas'));document.querySelectorAll('[data-preview]').forEach(canvas=>resizeObserver.observe(canvas));}else window.addEventListener('resize',scheduleResize);
if(state.csvEntries.length){csvRows=state.csvEntries.map(label=>[label]);$('csv-header').checked=false;$('csv-filename').textContent='HTML에 저장된 후보';refreshCsvColumns();}
setMode(state.mode);selectGame(state.game,portable.view==='play');updateOwner();updateSound();updateMotion();
if(portable.view!=='play')goHome();
try{
  const result=portable.lastResult;
  if(result&&Array.isArray(result.draws)&&result.draws.length&&Object.hasOwn(GAMES,result.game)){
    positiveInteger(result.perRound);positiveInteger(result.rounds);
    lastResult={...result,owner:String(result.owner),draws:result.draws.map(draw=>({label:String(draw.label),id:String(draw.id)}))};resultFresh=portable.resultFresh!==false;renderResults();
  }
}catch{lastResult=null;}
requestAnimationFrame(()=>{renderStage();renderPreviews();});
if(window.LuckyBoot)window.LuckyBoot.ready();
