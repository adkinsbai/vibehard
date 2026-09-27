import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
const release='/opt/vibehard/releases/20260927-controlled-ingestion-v1'; const prior='/opt/vibehard/releases/20260927-unified-retrieval-v1';
const node='/opt/vibehard/runtime/node-v22.23.1'; const control='/opt/vibehard/knowledge/control'; const index='/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite';
const unit='vibehard-knowledge-retrieval.service'; const candidate='vibehard-ingestion-preflight.service'; const backup=`${release}/backup`;
const mode=process.argv[2]; assert.equal(process.getuid(),0); assert.ok(['preflight','backup','activate','rollback','cleanup'].includes(mode));
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{encoding:'utf8',timeout:180000,...options});assert.equal(r.status,0,`${cmd} failed`);return r.stdout.trim();};
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const prop=(u,p)=>run('systemctl',['show',u,'-p',p,'--value']);
const manifest=JSON.parse(readFileSync(`${release}/RELEASE.json`)); for(const [f,h]of Object.entries(manifest.artifacts)) assert.equal(hash(`${release}/services/${f}`),h);
const db=new URL(process.env.DATABASE_URL); assert.equal(db.pathname,'/vibehard'); const pgEnv={...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:'vibehard'};
const query=sql=>run('psql',['-X','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env:pgEnv});
const queryIndex=socket=>new Promise((resolve,reject)=>{const req=request({socketPath:socket,path:'/query',method:'POST',headers:{'content-type':'application/json'}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{assert.equal(res.statusCode,200);const result=JSON.parse(body);assert.ok(result.sources.length);assert.ok(result.sources.every(s=>s.reviewStatus==='auto-indexed'));resolve(result);}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('timeout')));req.end(JSON.stringify({query:'ESP32-S3-Touch-LCD-2.8C 原理图'}));});
async function ready(socket){for(let n=0;n<30;n++){try{return await queryIndex(socket);}catch{await new Promise(r=>setTimeout(r,500));}}throw Error('INDEX_NOT_READY');}
const cleanup=()=>spawnSync('systemctl',['stop',candidate]);
async function load(socket){await ready(socket);const times=[];for(let n=0;n<60;n+=2)await Promise.all([0,1].map(async()=>{const start=performance.now();await queryIndex(socket);times.push(performance.now()-start);}));times.sort((a,b)=>a-b);assert.ok(times[56]<500);return {requests:60,p95Ms:times[56]};}
if(mode==='cleanup')cleanup();
if(mode==='preflight'){
  assert.ok(prop(unit,'ExecStart').includes(prior));
  let text=readFileSync(`/etc/systemd/system/${unit}`,'utf8').replaceAll(prior,release).replaceAll('vibehard-knowledge\n','vibehard-ingestion-preflight\n').replaceAll('/run/vibehard-knowledge/','/run/vibehard-ingestion-preflight/');
  // Preserve the read-only index group; only change RuntimeDirectory and socket.
  text=text.replace('SupplementaryGroups=vibehard-ingestion-preflight','SupplementaryGroups=vibehard-knowledge');
  writeFileSync(`/run/systemd/system/${candidate}`,text);run('systemctl',['daemon-reload']);run('systemctl',['start',candidate]);
  const measured=await load('/run/vibehard-ingestion-preflight/search.sock');const peak=Number(prop(candidate,'MemoryPeak'));assert.ok(peak<384*1024**2);
  mkdirSync(`${release}/evidence`,{mode:0o700});writeFileSync(`${release}/evidence/preflight.json`,JSON.stringify({passed:true,...measured,peak}));console.log(JSON.stringify({candidate:true,...measured,peak}));
}
if(mode==='backup'){
  assert.ok(JSON.parse(readFileSync(`${release}/evidence/preflight.json`)).passed);assert.ok(!existsSync(backup));mkdirSync(backup,{mode:0o700});copyFileSync(`/etc/systemd/system/${unit}`,`${backup}/${unit}`);
  run('pg_dump',['-Fc','-f',`${backup}/platform.dump`,'vibehard'],{env:pgEnv});assert.ok(run('pg_restore',['--list',`${backup}/platform.dump`]).includes('TABLE DATA public users'));
  writeFileSync(`${backup}/BACKUP.json`,JSON.stringify({sha256:hash(`${backup}/platform.dump`),at:new Date().toISOString()}));console.log('Batch-control backup verified');
}
async function restore(){copyFileSync(`${backup}/${unit}`,`/etc/systemd/system/${unit}`);run('systemctl',['daemon-reload']);run('systemctl',['restart',unit]);await ready('/run/vibehard-knowledge/search.sock');}
if(mode==='activate'){
  assert.ok(prop(unit,'ExecStart').includes(prior));assert.equal(hash(`${backup}/platform.dump`),JSON.parse(readFileSync(`${backup}/BACKUP.json`)).sha256);
  assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"),'0');assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"),'0');
  const protectedUnits=['vibehard.service','vibehard-design-worker.service','vibehard-runner.service','vibehard-gateway.service','vibeboard.service','vibehard-eda-manager.service'];const pids=protectedUnits.map(u=>[u,prop(u,'MainPID')]);const nginx=run('docker',['inspect','nginx','--format','{{.State.Pid}}']);
  assert.ok(!existsSync(control));mkdirSync(control,{mode:0o750});run('chgrp',['vibehard-knowledge',control]);chmodSync(control,0o2750);
  writeFileSync(`${control}/current.json`,JSON.stringify({id:'legacy-20260926',path:index}),{mode:0o640});writeFileSync(`${control}/disabled.json`,'[]',{mode:0o640});
  let text=readFileSync(`${backup}/${unit}`,'utf8').replaceAll(prior,release).replace('[Service]',`[Service]\nEnvironment=VIBEHARD_INDEX_CONTROL=${control}/current.json\nEnvironment=VIBEHARD_DISABLED_SOURCES_FILE=${control}/disabled.json`);
  writeFileSync(`/etc/systemd/system/${unit}`,text);
  try{run('systemctl',['daemon-reload']);run('systemctl',['restart',unit]);const measured=await load('/run/vibehard-knowledge/search.sock');
    for(const [u,p]of pids)assert.equal(prop(u,'MainPID'),p);assert.equal(run('docker',['inspect','nginx','--format','{{.State.Pid}}']),nginx);
    assert.equal(hash(index),'cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9');
    assert.equal(query("select count(*) from runner_nodes where runner_key='cloud-runner' and last_heartbeat_at>now()-interval '45 seconds'"),'1');assert.ok(run('ss',['-Htn','state','established','( sport = :8787 )']).length);
    console.log(run(node,[`${prior}/source/scripts/verify-frontend-release.mjs`,'https://ldcx.tech',`${prior}/standalone`]));
    const admin=query("select id from users where role='admin' order by created_at limit 1");assert.ok(admin);console.log(run(node,[`${release}/services/knowledge-batch-control.cjs`,'status',admin]));
    const member=query("select id from users where role='member' order by created_at limit 1");const denied=spawnSync(node,[`${release}/services/knowledge-batch-control.cjs`,'status',member],{env:process.env,encoding:'utf8'});assert.equal(denied.status,1);assert.ok(denied.stderr.includes('ADMIN_REQUIRED'));
    assert.notEqual(spawnSync('runuser',['-u','nobody','--','curl','--unix-socket','/run/vibehard-knowledge/search.sock','http://localhost/query']).status,0);
    const peak=Number(prop(unit,'MemoryPeak'));assert.ok(peak<384*1024**2);writeFileSync(`${release}/evidence/activated.json`,JSON.stringify({passed:true,...measured,peak,adminOnly:true,at:new Date().toISOString()}));console.log(JSON.stringify({activated:manifest.release,...measured,peak,corpusUnchanged:true,adminOnly:true}));
  }catch(e){await restore();throw e;}finally{cleanup();}
}
if(mode==='rollback'){await restore();cleanup();console.log('Retrieval code reverted; controlled registry retained and inactive');}
