import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the worker message protocol with an in-memory IndexedDB boundary.
function worker() {
  const records=new Map(), responses=[];
  let handler, fail=false;
  const database={transaction(){
    const tx={};
    tx.objectStore=()=>({
      get(key){const request={result:structuredClone(records.get(key))};queueMicrotask(()=>tx.oncomplete());return request;},
      put(row){records.set(row.key,structuredClone(row));queueMicrotask(()=>tx.oncomplete());return {};},
      clear(){records.clear();queueMicrotask(()=>tx.oncomplete());return {};},
    });
    return tx;
  }};
  const indexedDB={open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}};
  const code=fs.readFileSync(new URL('../dist/archive-worker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInNewContext(code,{
    indexedDB, URL, AbortController, setTimeout(){},
    self:{location:{href:'https://example.test/archive-worker.js'},addEventListener(name,fn){handler=fn;},postMessage(data){responses.push(data);}},
    ArcticClient:class {}, subredditName:x=>x,
    loadArchive:async()=>{if(fail)throw Error('Source failed');return {subreddit:'Example',acquisitionRequests:1};},
    analyze:(dataset,options)=>({...options}),
  });
  return {records,responses,setFail:()=>{fail=true;},async send(action,fields={}){
    const id=responses.length+1;
    await handler({data:{id,action,...fields}});
    return responses.findLast(r=>r.id===id&&!r.progress);
  }};
}
const options={subreddit:'Example',zone:'UTC',start:'2026-08-01',end:'2026-08-01'};
const snapshot={dataset:{subreddit:'Example'},analysis:{...options}};
test('a successful refresh invalidates derived selections but keeps the last saved analysis available',async()=>{
  const w=worker();
  await w.send('remember',{snapshot});
  assert.ok((await w.send('restore',{options})).result);
  await w.send('load',{options});
  assert.equal((await w.send('restore',{options})).result,null);
  assert.ok((await w.send('restore')).result,'startup can still show the saved analysis');
  await w.send('remember',{snapshot});
  assert.ok((await w.send('restore',{options})).result,'new results carry the current revision');
  await w.send('clear'); assert.equal(w.records.size,0);
});
test('failed refresh keeps saved results usable',async()=>{
  const w=worker();
  await w.send('remember',{snapshot});
  w.setFail();
  assert.equal((await w.send('load',{options})).error,'Source failed');
  assert.ok((await w.send('restore',{options})).result);
});
