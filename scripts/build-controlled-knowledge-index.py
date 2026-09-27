#!/usr/bin/env python3
"""Offline immutable package builder. No production/OSS mutation or model calls.

Input: completed processed documents + explicit source policy (boards/families
and retrieval probes). Output: bounded SQLite, verified source manifest, metadata.
Activation is a separate admin-only knowledge-batch-control command.
"""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def build(processed, policy_path, output):
    policy = json.loads(policy_path.read_text())
    batch_id = str(UUID(policy['batchId']))
    if output.exists():
        raise ValueError('Output is immutable; choose a new directory')
    status = json.loads((processed / 'processing-status.json').read_text())
    if status['batchId'] != batch_id or not status['complete']:
        raise ValueError('Processing must complete before indexing')
    raw = json.loads((processed / 'input-manifest.json').read_text())
    parents = {x['sha256']: x for x in raw['objects']}
    policies = {x['sha256']: x for x in policy['sources']}
    documents = [json.loads(p.read_text()) for p in sorted((processed / 'documents').glob('*.json'))]
    if not documents or len(documents) > 10000:
        raise ValueError('Document budget invalid')
    output.mkdir(mode=0o700, parents=True)
    path = output / 'knowledge-fts.sqlite'
    db = sqlite3.connect(path)
    db.execute('CREATE TABLE chunks(id TEXT PRIMARY KEY,source_sha TEXT,source_path TEXT,category TEXT,page INTEGER,part INTEGER,method TEXT,text TEXT)')
    db.execute('CREATE VIRTUAL TABLE chunks_fts USING fts5(text,source_path,content="chunks",content_rowid="rowid",tokenize="trigram")')
    db.execute('CREATE INDEX chunks_source ON chunks(source_sha,page)')
    records = {}; count = 0
    try:
        for doc in documents:
            if doc['rawBatchId'] != batch_id or doc['review']['method'] != 'automatic_rules_v1' or doc['review']['manualReview']:
                raise ValueError('Provenance/review mismatch')
            parent = parents.get(doc['parentSha256'])
            if not parent or parent['key'] != doc['rawObjectKey']:
                raise ValueError('Unknown raw source')
            identity = doc['sourceSha256']; rule = policies.get(identity)
            if not rule:
                raise ValueError('Every source needs an explicit board/family policy')
            review = doc['review']
            if review['status'] not in ('auto_approved_for_index','quarantine') or (review['status'] == 'auto_approved_for_index' and (review['flags'] or doc['ocrAttemptedPages'] < doc['ocrNeededPages'])):
                raise ValueError('Source review is incomplete')
            if identity in records:
                if records[identity]['status'] != review['status']:
                    raise ValueError('Duplicate source decisions differ')
                records[identity]['aliases'] = sorted(set(records[identity]['aliases'] + [doc['sourcePath']]))
                raw_object = {'key': doc['rawObjectKey'], 'sha256': doc['parentSha256']}
                if raw_object not in records[identity]['rawObjects']:
                    records[identity]['rawObjects'].append(raw_object)
                continue
            records[identity] = {'sha256': identity, 'path': doc['sourcePath'], 'aliases': [doc['sourcePath']],
                'rawObjects': [{'key': doc['rawObjectKey'], 'sha256': doc['parentSha256']}], 'status': review['status'], 'flags': review['flags'],
                'boards': rule['boards'], 'families': rule['families'], 'category': rule['category']}
            if review['status'] == 'quarantine':
                if doc['chunks']:
                    raise ValueError('Quarantine must not have chunks')
                continue
            pages = {p['page']: p for p in doc['pages']}
            for chunk in doc['chunks']:
                text = chunk['text']; page = pages[chunk['page']]
                expected = hashlib.sha256(f'{identity}:{chunk["page"]}:{chunk["start"]}:{chunk["end"]}:{text}'.encode()).hexdigest()
                if chunk['id'] != expected or text != page['text'][chunk['start']:chunk['end']].strip() or not 0 < len(text) <= 1800:
                    raise ValueError('Chunk citation mismatch')
                cur = db.execute('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?)', (chunk['id'],identity,doc['sourcePath'],rule['category'],chunk['page'],chunk['part'],chunk['method'],text))
                db.execute('INSERT INTO chunks_fts(rowid,text,source_path) VALUES(?,?,?)', (cur.lastrowid,text,doc['sourcePath']))
                count += 1
                if count > 100000:
                    raise ValueError('Chunk budget exceeded')
        db.commit()
        if not count or db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or path.stat().st_size > 256*1024*1024:
            raise ValueError('Index integrity/capacity gate failed')
    finally:
        db.close()
    manifest = {'schema': 'vibehard-controlled-index/v2', 'batchId': batch_id, 'version': policy['version'],
        'sqliteSha256': sha(path), 'indexedChunks': count, 'createdAt': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'reviewMethod': 'automatic_rules_v1', 'manualReview': False, 'sources': list(records.values()), 'probes': policy['probes']}
    manifest_path = output / 'knowledge-fts.sqlite.manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',',':')))
    (output / 'knowledge-fts.sqlite.meta.json').write_text(json.dumps({'schema':manifest['schema'],'batchId':batch_id,'manifestSha256':sha(manifest_path),'sqliteSha256':manifest['sqliteSha256'],'indexedChunks':count}))
    for artifact in output.iterdir():
        artifact.chmod(0o600)
    print(json.dumps({'batchId':batch_id,'sources':len(records),'chunks':count,'bytes':path.stat().st_size,'manifestSha256':sha(manifest_path)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--processed', type=Path, required=True)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    build(args.processed, args.policy, args.output)
