// 雑学クイズのロジックのスモークテスト（実行: node test.js）
// ブラウザを使わず、DOMのふりをする軽いスタブで index.html 内のJSを動かして検証する
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.split('<script>')[1].split('</script>')[0];

process.on('unhandledRejection', (e) => { console.error('UNHANDLED REJECTION:', e); process.exitCode = 1; });

function makeEl() {
  const classes = new Set();
  return {
    style: {},
    textContent: '',
    disabled: false,
    get offsetWidth() { return 0; },
    addEventListener() {},
    classList: {
      add: (...cs) => cs.forEach(c => classes.add(c)),
      remove: (...cs) => cs.forEach(c => classes.delete(c)),
      contains: c => classes.has(c),
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); v.split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
  };
}

function makeSandbox(fetchImpl) {
  const els = {};
  const store = new Map();
  const documentStub = { getElementById: id => els[id] || (els[id] = makeEl()) };
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const raf = fn => setTimeout(fn, 0);
  const body = src + '\nreturn { selectAnswer, nextQuestion, calcPcts, ' +
    'state: () => ({ firebaseUrl, remoteVotes, score, totalNum, shuffled, currentIdx, crowdToken }) };';
  const factory = new Function('document', 'localStorage', 'requestAnimationFrame', 'fetch', 'AbortController', body);
  const api = factory(documentStub, localStorageStub, raf, fetchImpl, AbortController);
  return { api, els, store };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (cond, label) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + label);
  if (!cond) process.exitCode = 1;
};

const US = 'https://trivia-quiz-otani-default-rtdb.firebaseio.com';
const ASIA = 'https://trivia-quiz-otani-default-rtdb.asia-southeast1.firebasedatabase.app';

(async () => {
  // ── シナリオA：DBが第1候補(米国)にある。既存票 t:10, f:5 ──
  const puts = [];
  const fetchA = (url, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT') {
      puts.push({ url, body: opts.body });
      return Promise.resolve({ ok: true, json: async () => null });
    }
    if (url === `${US}/votes.json`)
      return Promise.resolve({ ok: true, json: async () => ({ 3: { t: 10, f: 5 } }) });
    const m = url.match(new RegExp(`^${US}/votes/(\\d+)\\.json$`));
    if (m) return Promise.resolve({ ok: true, json: async () => (m[1] === '3' ? { t: 10, f: 5 } : null) });
    return Promise.reject(new Error('404 host: ' + url));
  };

  const A = makeSandbox(fetchA);
  await sleep(50);
  ok(A.api.state().firebaseUrl === US, 'A: 第1候補URLに接続');

  // 出題中の問題に〇で回答
  const q = A.api.state().shuffled[0];
  A.api.selectAnswer(true);
  await sleep(600);

  ok(puts.length === 1, 'A: PUTが1回だけ送信された');
  ok(puts[0].url === `${US}/votes/${q.id}/t.json`, 'A: PUT先が votes/' + q.id + '/t.json');
  ok(puts[0].body === JSON.stringify({ '.sv': { increment: 1 } }), 'A: 中身がincrement(サーバー側+1)');

  const expected = q.id === 3 ? { t: 11, f: 5 } : { t: 1, f: 0 };
  const total = expected.t + expected.f;
  const tp = Math.round(expected.t / total * 100);
  ok(A.els['crowdTruePct'].textContent === tp + '%', `A: 〇の%表示 = ${tp}%`);
  ok(A.els['crowdFalsePct'].textContent === (100 - tp) + '%', `A: ×の%表示 = ${100 - tp}%`);
  ok(A.els['crowdTotal'].textContent.includes(String(total)), `A: 「${total} 人 が 回 答」表示`);
  ok(A.els['crowdTruePct'].classList.contains('show'), 'A: %が表示状態(show)');
  ok(A.els['btnNext'].classList.contains('show'), 'A: 次へボタン表示');
  ok(A.store.get('trivia-quiz-stats') != null, 'A: 通算成績がlocalStorageに保存');

  // 次の問題に進むと%がリセットされる
  A.api.nextQuestion();
  ok(!A.els['crowdTruePct'].classList.contains('show'), 'A: 次の問題で%が非表示に戻る');

  // 素早く回答→即・次へ（320ms以内）→ 古い%が新しい問題に漏れない
  A.api.selectAnswer(false);
  A.api.nextQuestion();   // すぐ進む
  await sleep(600);
  ok(!A.els['crowdTruePct'].classList.contains('show'), 'A: 素早く進んでも古い%が漏れない(トークンガード)');

  // ── シナリオB：第1候補が404で、第2候補(アジア)にDBがある ──
  const fetchB = (url, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT') return Promise.resolve({ ok: true, json: async () => null });
    if (url.startsWith(US)) return Promise.resolve({ ok: false, json: async () => ({ error: '404' }) });
    if (url === `${ASIA}/votes.json`) return Promise.resolve({ ok: true, json: async () => null });
    if (url.startsWith(ASIA)) return Promise.resolve({ ok: true, json: async () => null });
    return Promise.reject(new Error('no host'));
  };
  const B = makeSandbox(fetchB);
  await sleep(50);
  ok(B.api.state().firebaseUrl === ASIA, 'B: リージョン自動検出で第2候補に接続');
  ok(B.store.get('trivia-quiz-fb-url') === ASIA, 'B: 接続先URLをキャッシュ');

  B.api.selectAnswer(true);
  await sleep(600);
  ok(B.els['crowdTruePct'].textContent === '100%', 'B: 初票なら自分の1票で100%表示');
  ok(B.els['crowdTotal'].textContent.includes('1'), 'B: 「1 人 が 回 答」');

  // ── シナリオC：全滅（オフライン）でも壊れない ──
  const fetchC = () => Promise.reject(new TypeError('network down'));
  const C = makeSandbox(fetchC);
  await sleep(50);
  ok(C.api.state().firebaseUrl === null, 'C: オフラインなら firebaseUrl は null');
  C.api.selectAnswer(true);
  await sleep(600);
  ok(!C.els['crowdTruePct'].classList.contains('show'), 'C: %は表示されない（静かに省略）');
  ok(C.els['btnNext'].classList.contains('show'), 'C: それでもクイズは進行できる');
  ok(C.api.state().score === (C.api.state().shuffled[0].isTrue ? 1 : 0), 'C: 採点も正常');

  // ── 問題データの整合性 ──
  const D = makeSandbox(fetchC);
  const data = D.api.state().shuffled;
  const ids = data.map(x => x.id).sort((a, b) => a - b);
  ok(new Set(ids).size === ids.length, 'D: idに重複なし');
  ok(ids.every((v, i) => v === i), 'D: idが0からの連番');
  const trues = data.filter(x => x.isTrue).length;
  ok(Math.abs(trues - (data.length - trues)) <= 3, `D: 本当${trues}/嘘${data.length - trues} でほぼ半々`);
  ok(data.every(x => x.q.endsWith('。')), 'D: 問題文が「。」で終わる');
  ok(data.every(x => x.ex && x.ex.length >= 10), 'D: 全問に解説がある');

  console.log('\n--- テスト完了 ---');
})();
