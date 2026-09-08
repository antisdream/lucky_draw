export function readPortableHTML(html) {
  // Extract only the known JSON data block. Never parse or execute imported HTML.
  const match = String(html).match(/<script\b(?=[^>]*\bid\s*=\s*["']portable-state["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if (!match) throw new Error('럭키드로우의 HTML 저장으로 만든 파일을 선택해주세요.');
  let data;
  try { data = JSON.parse(match[1]); } catch { throw new Error('저장된 후보 정보를 읽을 수 없습니다. 파일을 다시 저장해주세요.'); }
  return normalizePortable(data);
}

export function normalizePortable(input) {
  if (!input || input.version !== 1 || !input.config || typeof input.config !== 'object') throw new Error('후보와 설정이 저장된 럭키드로우 HTML이 아닙니다.');
  const config = {}, source = input.config;
  for (const key of ['owner','start','count','people','rounds']) if (typeof source[key] === 'string') config[key] = source[key];
  for (const key of ['repeat','reduced']) if (typeof source[key] === 'boolean') config[key] = source[key];
  for (const key of ['manual','csvEntries']) {
    if (source[key] !== undefined && (!Array.isArray(source[key]) || !source[key].every(value=>typeof value==='string'))) throw new Error('저장된 후보 목록 형식이 올바르지 않습니다.');
    if (source[key]) config[key] = source[key].slice();
  }
  if (['numbers','manual','csv'].includes(source.mode)) config.mode = source.mode;
  if (['roulette','dart','munch','tail'].includes(source.game)) config.game = source.game;
  if (['1800','3400','5000'].includes(source.duration)) config.duration = source.duration;
  let lastResult = null;
  if (input.lastResult !== null && input.lastResult !== undefined) {
    const result=input.lastResult;
    if (!Array.isArray(result.draws) || !result.draws.length || !result.draws.every(draw=>draw&&typeof draw.label==='string'&&typeof draw.id==='string')) throw new Error('저장된 추첨 결과 형식이 올바르지 않습니다.');
    for (const key of ['perRound','rounds','candidateCount']) if (typeof result[key]!=='string'||!/^\d+$/.test(result[key])||BigInt(result[key])<1n) throw new Error('저장된 결과의 인원 정보를 확인해주세요.');
    if (BigInt(result.perRound)*BigInt(result.rounds)!==BigInt(result.draws.length)) throw new Error('저장된 결과의 회차와 인원이 일치하지 않습니다.');
    if (!['roulette','dart','munch','tail'].includes(result.game)||!Number.isFinite(Date.parse(result.at))) throw new Error('저장된 결과 정보를 확인해주세요.');
    lastResult={draws:result.draws.map(draw=>({label:draw.label,id:draw.id})),perRound:result.perRound,rounds:result.rounds,candidateCount:result.candidateCount,game:result.game,owner:String(result.owner||'우리'),repeat:!!result.repeat,at:result.at};
  }
  return {version:1,config,lastResult,resultFresh:input.resultFresh!==false,view:input.view==='play'?'play':'home'};
}
