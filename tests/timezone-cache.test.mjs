import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArchive, aggregateDay, combineDays, dayStart, addDays, normalize } from '../dist/archive.js';

function fixture(start, end) {
  const rows = [];
  for (let t = Date.parse(start)/1000; t < Date.parse(end)/1000; t += 1800) {
    for (const kind of ['posts', 'comments']) rows.push(normalize({
      id: `${kind}${t}`, subreddit:'Example', author: t % 3600 ? 'repeat_reader' : 'another_reader',
      created_utc:t, title:'Synthetic post', score:3, num_comments:2,
      _meta:{retrieved_2nd_on:t+36*3600},
    }, kind, 'Example'));
  }
  const map = new Map(), calls = [];
  const client = {
    now:()=>Date.parse(end)+10*86400000,
    records:async(kind, subreddit, a, b, options)=>{
      calls.push({kind,a,b}); options.budget.requests++;
      const matches = rows.filter(r=>r.kind===kind && r.t>=a && r.t<b);
      options.budget.records += matches.length;
      options.ledger.push({kind,after:a,before:b, count:matches.length});
      return matches;
    },
  };
  return {rows, map, calls, client, cache:{get:async k=>map.get(k), set:async(k,v)=>map.set(k, structuredClone(v))}};
}
function direct(rows, start, end, zone) {
  const chunks=[];
  for(let date=start;date<=end;date=addDays(date,1)) {
    const a=dayStart(date,zone), b=dayStart(addDays(date,1),zone);
    chunks.push(aggregateDay(rows.filter(r=>r.t>=a&&r.t<b),{start:a,end:b,zone,fetchedAt:'2026-09-14',ledger:[]}));
  }
  return combineDays(chunks,'Example',zone);
}

test('timezone changes reuse anonymous cached summaries with exact distinct counts and no requests', async()=>{
  const f=fixture('2026-07-30','2026-08-06');
  const options={...f,subreddit:'Example',start:'2026-08-01',end:'2026-08-03',zone:'Asia/Kolkata'};
  await loadArchive(options);
  const initial=f.calls.length;
  for(const zone of ['UTC','America/New_York','Asia/Kathmandu','Europe/Berlin','Australia/Lord_Howe','Pacific/Kiritimati','Pacific/Honolulu']) {
    const d=await loadArchive({...options,end:'2026-08-02',zone});
    const expected=direct(f.rows,options.start,'2026-08-02',zone);
    assert.deepEqual(d.zones[zone],expected.zones[zone],zone);
    assert.deepEqual(d.posts,expected.posts,zone);
    assert.deepEqual(d.audit,expected.audit,zone);
    assert.equal(d.acquisitionRequests,0);
  }
  assert.equal(f.calls.length,initial);
  const serialized=JSON.stringify([...f.map.values()]);
  assert.doesNotMatch(serialized,/repeat_reader|another_reader|"author"|"authorHash"/);
  assert.ok([...f.map.values()].every(tile=>tile.schema===2));
});

test('only a missing boundary tile is acquired; middle dates stay cached', async()=>{
  const f=fixture('2026-07-30','2026-08-08');
  const options={...f,subreddit:'Example',start:'2026-08-01',end:'2026-08-03',zone:'Asia/Kolkata'};
  await loadArchive(options); const initial=f.calls.length;
  await loadArchive({...options,zone:'America/New_York'});
  const added=f.calls.slice(initial);
  assert.equal(added.length,4);
  assert.ok(added.every(call=>call.a>=Date.parse('2026-08-03')/1000));
  const count=f.calls.length;
  await loadArchive({...options,zone:'America/New_York'});
  assert.equal(f.calls.length,count);
});

for(const [date,zone] of [['2026-11-01','America/New_York'],['2026-03-08','America/New_York'],['2026-04-05','Australia/Lord_Howe']]) {
  test(`cached timezone summaries preserve daylight-saving exposure on ${date} in ${zone}`,async()=>{
    const f=fixture(addDays(date,-2),addDays(date,4));
    await loadArchive({...f,subreddit:'Example',start:addDays(date,-1),end:addDays(date,1),zone:'UTC'});
    const count=f.calls.length;
    const d=await loadArchive({...f,subreddit:'Example',start:date,end:date,zone});
    assert.deepEqual(d.zones[zone],direct(f.rows,date,date,zone).zones[zone]);
    assert.equal(f.calls.length,count);
  });
}

test('legacy summaries survive without refresh and upgrade only when requested', async()=>{
  const f=fixture('2026-07-30','2026-08-06');
  const date='2026-08-01', start=dayStart(date,'UTC');
  f.map.set(`1|example|UTC|${date}`,aggregateDay(f.rows.filter(r=>r.t>=start&&r.t<start+86400),{start,end:start+86400,zone:'UTC',fetchedAt:'2026-08-05',ledger:[]}));
  const opts={...f,subreddit:'Example',start:date,end:date,zone:'UTC'};
  await loadArchive(opts); assert.equal(f.calls.length,0);
  await loadArchive({...opts,force:true}); assert.ok(f.calls.length>0);
  assert.ok([...f.map.keys()].some(k=>k.startsWith('2|example|')));
});
