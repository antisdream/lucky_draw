import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { makePool, makeSampler, randomBelow, validateDraw, positiveInteger, integer, parseCSV, columnEntries, csvCell, safeJSON, formatCount, detectDelimiter } from '../src/core.js';

test('한 명 추첨은 안전한 난수 API가 없어도 유일 후보를 반환한다', () => {
  assert.equal(randomBelow(1n, null), 0n);
  const pool = makePool({ mode: 'numbers', start: '100', count: '1' });
  const sampler = makeSampler(pool.size);
  assert.equal(pool.labelAt(sampler.next()), '100');
  assert.throws(() => sampler.next(), /모두/);
});
test('잘못된 인원과 소수는 명확하게 거부한다', () => {
  for (const value of ['0','-1','1.5','1e4','Infinity','무한','', '1,000']) assert.throws(() => positiveInteger(value));
  assert.equal(positiveInteger(' 00012 '), 12n);
  assert.equal(integer('-0012'), -12n);
});
test('큰 숫자 범위는 배열 없이 정확한 번호를 유지한다', () => {
  const count = '1' + '0'.repeat(100);
  const first = '90071992547409930000000000000001';
  const pool = makePool({ mode: 'numbers', start: first, count });
  assert.equal(pool.size, 10n ** 100n);
  assert.equal(pool.labelAt(2n), (BigInt(first) + 2n).toString());
  assert.equal(pool.labelAt(pool.size - 1n), (BigInt(first) + pool.size - 1n).toString());
  assert.equal(pool.entries, undefined);
});
test('지연 섞기는 전 후보를 중복 및 누락 없이 선택한다', () => {
  for (const choose of [() => 0n, n => n - 1n, n => n / 2n]) {
    const sample = makeSampler(1000n, false, choose), values = [];
    while (sample.remaining) values.push(sample.next());
    assert.equal(new Set(values).size, 1000);
    assert.deepEqual(values.sort((a,b)=>a<b?-1:a>b?1:0), Array.from({length:1000}, (_,i)=>BigInt(i)));
  }
});
test('크기 3의 모든 순열이 정확히 같은 수의 선택 경로를 가진다', () => {
  const outcomes = new Map();
  for (let first=0n;first<3n;first++) for (let second=0n;second<2n;second++) {
    const sequence=[first,second,0n], sampler=makeSampler(3n,false,()=>sequence.shift());
    const key=[sampler.next(),sampler.next(),sampler.next()].join(',');
    outcomes.set(key,(outcomes.get(key)||0)+1);
  }
  assert.equal(outcomes.size,6);assert.ok([...outcomes.values()].every(n=>n===1));
});
test('큰 범위의 소수 결과는 범위 크기와 무관하게 생성한다', () => {
  const size=10n**100n,sample=makeSampler(size,false,n=>n-1n);
  assert.equal(sample.next(),size-1n);assert.equal(sample.next(),size-2n);assert.equal(sample.remaining,size-2n);
});
test('중복 허용은 같은 후보를 여러 회차에 다시 선정한다', () => {
  const sample = makeSampler(1n,true);
  for(let i=0;i<100;i++)assert.equal(sample.next(),0n);
  assert.equal(sample.remaining,1n);
});
test('중복 금지는 한 회차가 아니라 전체 회차에 적용한다', () => {
  const pool=makePool({mode:'numbers',start:'1',count:'10'});
  assert.deepEqual(validateDraw(pool,'2','5',false),{perRound:2n,roundCount:5n,total:10n});
  assert.throws(()=>validateDraw(pool,'2','6',false),/총 12명/);
  assert.equal(validateDraw(pool,'200','600',true).total,120000n);
});
test('난수 범위 변환은 나머지 연산 편향 없이 범위 밖 값을 재추첨한다', () => {
  const draws=[7,6,4];let calls=0;
  const rng={getRandomValues(bytes){bytes[0]=draws[calls++];return bytes;}};
  assert.equal(randomBelow(5n,rng),4n);assert.equal(calls,3);
});
test('큰 정수용 난수는 53비트 정밀도를 잃지 않는다', () => {
  const size=10n**80n;
  for(let i=0;i<20;i++){const value=randomBelow(size,webcrypto);assert.ok(value>=0n&&value<size);}
  assert.throws(()=>randomBelow(3n,null),/안전한 난수/);
});
test('빈 입력은 제외하고 같은 이름의 서로 다른 후보 ID는 보존한다', () => {
  const pool=makePool({mode:'manual',entries:[' 김하늘 ','','김하늘',' ','01']});
  assert.equal(pool.size,3n);assert.equal(pool.labelAt(0n),'김하늘');assert.equal(pool.labelAt(1n),'김하늘');
  assert.notEqual(pool.idAt(0n),pool.idAt(1n));assert.equal(pool.labelAt(2n),'01');
  assert.throws(()=>makePool({mode:'manual',entries:['',' ']}));
});
test('CSV BOM과 CRLF, 쉼표, 이중 따옴표, 여러 줄 이름을 읽는다', () => {
  const csv='\uFEFF번호,이름\r\n001,"김,하늘"\r\n002,"별 ""하나"""\r\n003,"두\n줄"\r\n';
  const rows=parseCSV(csv);
  assert.deepEqual(columnEntries(rows,1,true),['김,하늘','별 "하나"','두\n줄']);
  assert.deepEqual(columnEntries(rows,0,true),['001','002','003']);
});
test('탭 및 세미콜론 구분 표를 자동 인식한다', () => {
  assert.equal(detectDelimiter('번호\t이름\n1\t김하늘'),'\t');
  assert.deepEqual(columnEntries(parseCSV('번호\t이름\n1\t김하늘'),1,true),['김하늘']);
  assert.deepEqual(parseCSV('번호;이름\n1;별'),[['번호','이름'],['1','별']]);
});
test('열 누락과 빈 줄은 건너뛰고 제목 없는 파일도 가져온다', () => {
  const rows=parseCSV('가,1\n나\n,\n다,3\n');
  assert.deepEqual(columnEntries(rows,1,false),['1','3']);
  assert.deepEqual(columnEntries(rows,0,false),['가','나','다']);
  assert.deepEqual(parseCSV('한 명'),[['한 명']]);
});
test('깨진 따옴표 파일은 조용히 오해석하지 않는다', () => {
  assert.throws(()=>parseCSV('이름\n"미완성'),/따옴표/);
  assert.throws(()=>parseCSV('"이름"문자'),/따옴표/);
});
test('CSV 내려받기는 수식 실행 문자를 보호하고 따옴표를 이스케이프한다', () => {
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell(' \t@SUM(A1)'),'"\' \t@SUM(A1)"');
  assert.equal(csvCell('김 "하늘"'),'"김 ""하늘"""');
});
test('HTML에 넣은 데이터는 종료 태그 및 유니코드 구분자에 안전하다', () => {
  const source={owner:'우리</script><script>alert(1)</script>',names:['<img src=x onerror=alert(1)>','한글 😀','\u2028\u2029']};
  const serialized=safeJSON(source);
  assert.equal(serialized.includes('<'),false);assert.deepEqual(JSON.parse(serialized),source);
});
test('큰 인원 표시만 축약하고 원래 숫자는 그대로 유지한다', () => {
  assert.equal(formatCount(1000n),'1,000');assert.match(formatCount(10n**100n),/101자리/);
});
