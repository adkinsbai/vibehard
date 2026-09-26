#!/usr/bin/env python3
"""Build immutable, deduplicated private-OSS artifacts from reviewed documents.

The SQLite FTS5 index is a transport artifact for a future bounded retrieval
service. Running this script does not change a live worker or database.
"""

import gzip
import hashlib
import json
import os
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path('/private/tmp/vibehard-esp32-processed')
DOCUMENTS = ROOT / 'documents'
EXPORT = ROOT / 'export'
RAW_STATE = Path('/private/tmp/vibehard-esp32-oss-Ox80pR/batch-state.json')


def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def category_for(path):
    lower = path.lower()
    if '原理图' in path or 'schematic' in lower:
        return 'schematics'
    if 'pcb' in lower or 'gerber' in lower or '布局布线' in path:
        return 'pcb'
    if any(word in lower for word in ('datasheet', 'reference_manual', 'technical_reference')) or '技术手册' in path or '数据手册' in path:
        return 'manuals'
    if any(word in lower for word in ('demo', 'sdk', 'firmware', 'example')) or '示例程序' in path or '软件' in path:
        return 'firmware'
    return 'boards'


def write_line(stream, value):
    stream.write((json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))


def build():
    raw = json.loads(RAW_STATE.read_text())
    if raw['schema'] != 'vibehard-oss-raw-batch/v1' or not raw['manifestUploaded']:
        raise RuntimeError('Verified OSS raw manifest is required')
    if not DOCUMENTS.is_dir():
        raise RuntimeError('Processed documents are missing')
    documents = [json.loads(path.read_text()) for path in sorted(DOCUMENTS.glob('*.json'))]
    if len(documents) < 500:
        raise RuntimeError('Unexpectedly incomplete batch')
    for doc in documents:
        if doc['rawBatchId'] != raw['batchId'] or doc['review']['method'] != 'automatic_rules_v1':
            raise RuntimeError('Batch or review rule mismatch')
        if doc['review']['status'] not in ('auto_approved_for_index', 'quarantine'):
            raise RuntimeError('Unknown review status')
        if doc.get('ocrAttemptedPages', 0) < doc['ocrNeededPages'] and doc['sourceKind'] != 'zip_text':
            raise RuntimeError('OCR is incomplete')
    groups = defaultdict(list)
    for doc in documents:
        groups[doc['sourceSha256']].append(doc)
    for copies in groups.values():
        if len({copy['review']['status'] for copy in copies}) != 1:
            raise RuntimeError('Identical source bytes received inconsistent review decisions')

    EXPORT.mkdir(mode=0o700, parents=True, exist_ok=True)
    sqlite_path = EXPORT / 'knowledge-fts.sqlite'
    if sqlite_path.exists():
        sqlite_path.unlink()
    database = sqlite3.connect(sqlite_path)
    database.execute('PRAGMA journal_mode=DELETE')
    database.execute('PRAGMA synchronous=FULL')
    database.execute('CREATE TABLE chunks (id TEXT PRIMARY KEY, source_sha TEXT NOT NULL, source_path TEXT NOT NULL, '
                     'category TEXT NOT NULL, page INTEGER NOT NULL, part INTEGER NOT NULL, method TEXT NOT NULL, text TEXT NOT NULL)')
    database.execute('CREATE VIRTUAL TABLE chunks_fts USING fts5(text, source_path, content="chunks", '
                     'content_rowid="rowid", tokenize="trigram")')
    database.execute('CREATE INDEX chunks_source ON chunks(source_sha, page)')
    statistics = Counter()
    catalogue = []
    with (EXPORT / 'pages.jsonl.gz').open('wb') as page_file, \
         (EXPORT / 'chunks.jsonl.gz').open('wb') as chunk_file, \
         gzip.GzipFile(filename='', mode='wb', fileobj=page_file, mtime=0) as page_stream, \
         gzip.GzipFile(filename='', mode='wb', fileobj=chunk_file, mtime=0) as chunk_stream:
        for sha, copies in sorted(groups.items()):
            canonical = min(copies, key=lambda doc: (doc['sourceKind'] != 'direct',
                                                      len(doc['sourcePath']), doc['sourcePath']))
            status = canonical['review']['status']
            aliases = sorted({copy['sourcePath'] for copy in copies})
            raw_keys = sorted({copy['rawObjectKey'] for copy in copies})
            category = category_for(canonical['sourcePath'])
            catalogue.append({'sourceSha256': sha, 'sourcePath': canonical['sourcePath'],
                              'aliases': aliases, 'rawObjectKeys': raw_keys,
                              'category': category, 'review': canonical['review'],
                              'pages': len(canonical['pages']), 'chunks': len(canonical['chunks']),
                              'ocrNeededPages': canonical['ocrNeededPages'],
                              'ocrAttemptedPages': canonical.get('ocrAttemptedPages', 0),
                              'ocrSelectedPages': canonical['ocrCompletedPages']})
            statistics['uniqueSources'] += 1
            statistics['sourceAliases'] += len(aliases)
            statistics[status] += 1
            if status != 'auto_approved_for_index':
                if canonical['chunks']:
                    raise RuntimeError('Quarantined document contains index chunks')
                continue
            for page in canonical['pages']:
                write_line(page_stream, {'sourceSha256': sha, 'page': page['page'],
                                         'method': page['method'], 'text': page['text']})
                statistics['indexedPages'] += 1
            for chunk in canonical['chunks']:
                record = {'id': chunk['id'], 'sourceSha256': sha,
                          'sourcePath': canonical['sourcePath'], 'category': category,
                          'page': chunk['page'], 'part': chunk['part'],
                          'start': chunk['start'], 'end': chunk['end'],
                          'method': chunk['method'], 'text': chunk['text']}
                write_line(chunk_stream, record)
                cursor = database.execute('INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (record['id'], sha, record['sourcePath'], category, record['page'],
                     record['part'], record['method'], record['text']))
                database.execute('INSERT INTO chunks_fts(rowid, text, source_path) VALUES (?, ?, ?)',
                                 (cursor.lastrowid, record['text'], record['sourcePath']))
                statistics['indexedChunks'] += 1
    database.commit()
    integrity = database.execute('PRAGMA integrity_check').fetchone()[0]
    if integrity != 'ok' or database.execute('SELECT COUNT(*) FROM chunks').fetchone()[0] != statistics['indexedChunks']:
        raise RuntimeError('Index integrity check failed')
    samples = []
    for term in ('ESP32-S3', 'SIM7670', '触摸屏'):
        result = database.execute('SELECT chunks.source_path, chunks.page FROM chunks_fts '
                                  'JOIN chunks ON chunks_fts.rowid=chunks.rowid WHERE chunks_fts MATCH ? LIMIT 3',
                                  ('"' + term + '"',)).fetchall()
        samples.append({'query': term, 'hits': len(result),
                        'sources': [{'path': path, 'page': page} for path, page in result]})
    if not all(item['hits'] for item in samples):
        raise RuntimeError('Retrieval smoke query failed')
    database.close()
    os.chmod(sqlite_path, 0o600)
    with sqlite_path.open('rb') as source, (EXPORT / 'knowledge-fts.sqlite.gz').open('wb') as destination, \
         gzip.GzipFile(filename='', mode='wb', fileobj=destination, mtime=0) as compressed:
        while block := source.read(4 * 1024 * 1024):
            compressed.write(block)
    artifacts = {}
    for name in ('pages.jsonl.gz', 'chunks.jsonl.gz', 'knowledge-fts.sqlite.gz'):
        path = EXPORT / name
        os.chmod(path, 0o600)
        digest = sha_file(path)
        artifacts[name] = {'sha256': digest, 'bytes': path.stat().st_size,
                           'key': f'knowledge/processed/v1/{raw["batchId"]}/{digest}/{name}'}
    manifest = {'schema': 'vibehard-oss-processed-batch/v1', 'rawBatchId': raw['batchId'],
                'rawManifestKey': raw['manifestKey'], 'rawManifestSha256': raw['manifestSha256'],
                'review': {'method': 'automatic_rules_v1', 'manualReview': False,
                           'meaning': 'index candidate only; not published to production Agent'},
                'statistics': dict(statistics), 'artifacts': artifacts,
                'retrievalSmoke': samples, 'documents': catalogue}
    manifest_path = EXPORT / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
    os.chmod(manifest_path, 0o600)
    print(json.dumps({'statistics': dict(statistics), 'artifactBytes': {k: v['bytes'] for k, v in artifacts.items()},
                      'manifestSha256': sha_file(manifest_path),
                      'retrievalSmoke': [{'query': x['query'], 'hits': x['hits']} for x in samples]},
                     ensure_ascii=False))


if __name__ == '__main__':
    build()
