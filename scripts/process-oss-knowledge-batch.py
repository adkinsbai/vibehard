#!/usr/bin/env python3
"""Resumable, local-only document extraction/OCR for a private OSS raw batch.

This reads the verified upload-state manifest and original files. It never
publishes a knowledge document or changes production PostgreSQL. It writes
index-ready, automatically reviewed JSONL to a private local work directory.
Only ZIP-contained PDFs are expanded, in memory, with strict size/path caps.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import fcntl
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath



RAW_STATE = Path('/private/tmp/vibehard-esp32-oss-Ox80pR/batch-state.json')
SOURCE_ROOT = Path('/Users/hushaohong/Desktop/ESP32-S3资料包')
OUTPUT_ROOT = Path('/private/tmp/vibehard-esp32-processed')
OCR_BINARY = Path('/private/tmp/vibehard-ocr-pdf-page')
VERIFIED_PARENTS = set()
MAX_NESTED_PDF_BYTES = 80 * 1024 * 1024
MAX_ARCHIVE_EXPANSION = 100
MAX_TEXT_CHARS = 20_000_000
SECRET_PATTERNS = [
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', re.I),
    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    re.compile(r'\bLTAI[0-9A-Za-z]{16,}\b'),
    re.compile(r'\bsk-[a-z0-9_-]{20,}\b', re.I),
    re.compile(r'(?:api[_-]?key|access[_-]?token|password|passwd|secret)\s*[:=]\s*["\']?[^\s"\'<>]{12,}', re.I),
]
INJECTION_PATTERN = re.compile(r'ignore (?:all |any |the )?(?:previous|system) instructions|忽略.{0,8}(?:系统|之前).{0,4}指令|<\|(?:system|im_start)\|>', re.I)


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def atomic_json(path, payload):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def meaningful_chars(text):
    return sum(char.isalnum() for char in text)


def normalized(text):
    text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\x00', '')
    return re.sub(r'\n{4,}', '\n\n\n', text).strip()


def chunk_text(text, limit=1600, overlap=160):
    """Page-local, bounded chunks; offsets refer to the normalized page text."""
    start = 0
    while start < len(text):
        stop = min(len(text), start + limit)
        if stop < len(text):
            candidates = [text.rfind('\n\n', start + limit // 2, stop),
                          text.rfind('\n', start + limit // 2, stop),
                          text.rfind('。', start + limit // 2, stop)]
            boundary = max(candidates)
            if boundary > start:
                stop = boundary + 1
        part = text[start:stop].strip()
        if part:
            yield start, stop, part
        if stop >= len(text):
            break
        start = max(start + 1, stop - overlap)


def safe_zip_name(name):
    path = PurePosixPath(name.replace('\\', '/'))
    return (not path.is_absolute() and '..' not in path.parts and not name.startswith('/')
            and not re.match(r'^[A-Za-z]:', name))


def eligible_text_name(name, size):
    lower = name.lower().replace('\\', '/')
    basename = PurePosixPath(lower).name
    if (not safe_zip_name(name) or lower.count('/') > 4 or
            not lower.endswith(('.md', '.rst', '.txt')) or not 300 <= size <= 250_000):
        return False
    if any(part in lower for part in ('/libraries/', '/managed_components/', '/third_party/',
                                      '/vendor/', '/build/', '/node_modules/', '/esp-idf/')):
        return False
    if basename in ('cmakelists.txt', 'license.txt', 'changelog.txt', 'requirements.txt') or 'license' in basename:
        return False
    return basename.startswith('readme') or any(part in lower for part in
            ('/docs/', '/doc/', '/guide/', 'tutorial', '手册', '说明', 'pinout', 'hardware'))


def source_records(state, include_text):
    for parent in state['objects']:
        if parent['validation'].startswith('quarantine'):
            continue
        relative = parent['paths'][0]
        if not safe_zip_name(relative):
            raise RuntimeError('Unsafe source path')
        local = SOURCE_ROOT / relative
        if not local.resolve().is_relative_to(SOURCE_ROOT.resolve()) or local.is_symlink() or not local.is_file():
            raise RuntimeError('Source escaped approved root or is not a regular file')
        if local.stat().st_size != parent['bytes'] or digest_file(local) != parent['sha256']:
            raise RuntimeError('Raw source hash mismatch')
        if parent['mode'] == 'pdf':
            yield {'parent': parent, 'relative': relative, 'local': local, 'kind': 'direct'}
        elif parent['mode'] == 'text' and include_text and 0 < parent['bytes'] <= 250_000:
            yield {'parent': parent, 'relative': relative, 'local': local, 'kind': 'direct_text', 'bytes': parent['bytes']}
        elif parent['mode'] == 'archive' and relative.lower().endswith('.zip'):
            try:
                with zipfile.ZipFile(local) as archive:
                    if len(archive.infolist()) > 10000:
                        raise RuntimeError('Archive entry budget exceeded')
                    expanded = 0
                    for entry in archive.infolist():
                        if entry.is_dir():
                            continue
                        is_pdf = entry.filename.lower().endswith('.pdf')
                        is_text = include_text and eligible_text_name(entry.filename, entry.file_size)
                        if not is_pdf and not is_text:
                            continue
                        if (not safe_zip_name(entry.filename) or entry.flag_bits & 1 or
                                (entry.external_attr >> 16) & 0o170000 == 0o120000 or
                                entry.file_size > (MAX_NESTED_PDF_BYTES if is_pdf else 250_000) or
                                (entry.compress_size and entry.file_size / entry.compress_size > MAX_ARCHIVE_EXPANSION)):
                            continue
                        expanded += entry.file_size
                        if expanded > 512 * 1024 * 1024:
                            raise RuntimeError('Archive expansion budget exceeded')
                        yield {'parent': parent, 'relative': relative + '!' + entry.filename,
                               'local': local, 'kind': 'zip_pdf' if is_pdf else 'zip_text', 'entry': entry.filename,
                               'bytes': entry.file_size}
            except (OSError, zipfile.BadZipFile):
                continue
        elif parent['mode'] == 'archive' and relative.lower().endswith(('.rar', '.7z')):
            listing = subprocess.run(['bsdtar', '-tf', str(local)], capture_output=True,
                                     text=True, timeout=90, check=False)
            if listing.returncode:
                continue
            for entry_name in listing.stdout.splitlines():
                if entry_name.lower().endswith('.pdf') and safe_zip_name(entry_name):
                    yield {'parent': parent, 'relative': relative + '!' + entry_name,
                           'local': local, 'kind': 'other_pdf', 'entry': entry_name}


def ocr_pages(pdf_path, page_numbers):
    if not page_numbers:
        return {}
    if not OCR_BINARY.is_file():
        raise RuntimeError('OCR helper is missing; compile scripts/ocr-pdf-page.swift first')
    # One process per document avoids repeatedly loading a PDF. A bounded batch
    # keeps the command line short even for long manuals.
    results = {}
    for offset in range(0, len(page_numbers), 150):
        batch = page_numbers[offset:offset + 150]
        result = subprocess.run([str(OCR_BINARY), str(pdf_path), *map(str, batch)],
                                capture_output=True, text=True, check=False, timeout=max(120, 15 * len(batch)))
        if result.returncode:
            raise RuntimeError('OCR helper failed')
        for line in result.stdout.splitlines():
            item = json.loads(line)
            results[item['page']] = item
    return results


def read_pdf(source, perform_ocr):
    import pypdfium2 as pdfium
    local = source['local']
    parent = source['parent']
    if parent['sha256'] not in VERIFIED_PARENTS:
        if local.stat().st_size != parent['bytes'] or digest_file(local) != parent['sha256']:
            raise RuntimeError('Raw source changed since OSS upload')
        VERIFIED_PARENTS.add(parent['sha256'])
    if source['kind'] == 'direct':
        pdf_input = str(local)
        pdf_bytes = None
    elif source['kind'] == 'zip_pdf':
        with zipfile.ZipFile(local) as archive:
            with archive.open(source['entry']) as stream:
                pdf_bytes = stream.read(MAX_NESTED_PDF_BYTES + 1)
        if len(pdf_bytes) > MAX_NESTED_PDF_BYTES or len(pdf_bytes) != source['bytes']:
            raise RuntimeError('Nested PDF exceeded declared size')
        pdf_input = pdf_bytes
    else:
        command = subprocess.Popen(['bsdtar', '-xOf', str(local), source['entry']],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            pdf_bytes = command.stdout.read(MAX_NESTED_PDF_BYTES + 1)
            if len(pdf_bytes) > MAX_NESTED_PDF_BYTES:
                command.kill()
                raise RuntimeError('Nested PDF exceeded size limit')
            _, stderr = command.communicate(timeout=90)
            if command.returncode:
                raise RuntimeError('Archive PDF extraction failed: ' + stderr.decode(errors='replace')[:80])
        finally:
            if command.poll() is None:
                command.kill()
        pdf_input = pdf_bytes

    source_sha = digest_bytes(pdf_bytes) if pdf_bytes is not None else parent['sha256']
    with pdfium.PdfDocument(pdf_input) as document:
        if len(document) > 3000:
            raise RuntimeError('PDF page budget exceeded')
        pages = []
        total_chars = 0
        for number in range(1, len(document) + 1):
            page = document[number - 1]
            try:
                text_page = page.get_textpage()
                try:
                    text = normalized(text_page.get_text_range())
                finally:
                    text_page.close()
            finally:
                page.close()
            total_chars += len(text)
            if total_chars > MAX_TEXT_CHARS:
                raise RuntimeError('PDF text exceeds per-document limit')
            pages.append({'page': number, 'text': text, 'method': 'embedded_text',
                          'ocr_error': None})

    ocr_needed = [page['page'] for page in pages if meaningful_chars(page['text']) < 100]
    if perform_ocr and ocr_needed:
        temporary = None
        try:
            if pdf_bytes is not None:
                descriptor, temporary = tempfile.mkstemp(suffix='.pdf', dir=OUTPUT_ROOT)
                with os.fdopen(descriptor, 'wb') as stream:
                    stream.write(pdf_bytes)
                os.chmod(temporary, 0o600)
                ocr_path = temporary
            else:
                ocr_path = str(local)
            ocr_results = ocr_pages(ocr_path, ocr_needed)
            for page in pages:
                if page['page'] not in ocr_needed:
                    continue
                result = ocr_results.get(page['page'], {'error': 'no_result', 'text': ''})
                ocr_text = normalized(result.get('text', ''))
                page['ocr_error'] = result.get('error')
                if meaningful_chars(ocr_text) > meaningful_chars(page['text']):
                    page['text'] = ocr_text
                    page['method'] = 'local_vision_ocr'
        finally:
            if temporary is not None:
                os.unlink(temporary)
    return source_sha, pages, len(ocr_needed), len(ocr_needed) if perform_ocr else 0


def read_text(source):
    parent = source['parent']
    local = source['local']
    if parent['sha256'] not in VERIFIED_PARENTS:
        if local.stat().st_size != parent['bytes'] or digest_file(local) != parent['sha256']:
            raise RuntimeError('Raw archive changed since OSS upload')
        VERIFIED_PARENTS.add(parent['sha256'])
    if source['kind'] == 'direct_text':
        payload = local.read_bytes()
    else:
        with zipfile.ZipFile(local) as archive:
            with archive.open(source['entry']) as stream:
                payload = stream.read(250_001)
    if len(payload) != source['bytes'] or len(payload) > 250_000:
        raise RuntimeError('Nested text exceeded declared size')
    try:
        text = payload.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = payload.decode('gb18030')
    if '\ufffd' in text or '\x00' in text:
        raise RuntimeError('Text encoding is invalid')
    return digest_bytes(payload), [{'page': 1, 'text': normalized(text),
                                    'method': 'embedded_text', 'ocr_error': None}], 0, 0


def review_document(source, sha256, pages, ocr_needed, ocr_attempted):
    text = '\n'.join(page['text'] for page in pages)
    flags = []
    if any(pattern.search(text) for pattern in SECRET_PATTERNS):
        flags.append('possible_secret')
    if INJECTION_PATTERN.search(text):
        flags.append('possible_prompt_injection')
    if ocr_attempted < ocr_needed:
        flags.append('ocr_incomplete')
    if meaningful_chars(text) < 120:
        flags.append('insufficient_text')
    if sum(1 for page in pages if meaningful_chars(page['text']) >= 30) == 0:
        flags.append('no_substantive_page')
    if any(page['ocr_error'] for page in pages):
        flags.append('ocr_error')
    # Auto-approved means allowed in an index candidate, not electrical/design
    # accuracy certified. Production visibility remains a separate operation.
    status = 'auto_approved_for_index' if not flags else 'quarantine'
    chunks = []
    if status == 'auto_approved_for_index':
        for page in pages:
            for ordinal, (start, stop, content) in enumerate(chunk_text(page['text']), 1):
                if meaningful_chars(content) < 25:
                    continue
                identifier = digest_bytes(f'{sha256}:{page["page"]}:{start}:{stop}:{content}'.encode())
                chunks.append({'id': identifier, 'page': page['page'], 'part': ordinal,
                               'start': start, 'end': stop, 'text': content,
                               'method': page['method']})
    return {'schema': 'vibehard-processed-document/v1', 'rawBatchId': source['parent']['key'].split('/')[3],
            'sourcePath': source['relative'], 'rawObjectKey': source['parent']['key'],
            'sourceSha256': sha256, 'parentSha256': source['parent']['sha256'],
            'sourceKind': source['kind'], 'review': {'status': status, 'flags': flags,
            'method': 'automatic_rules_v1', 'manualReview': False},
            'pages': pages, 'ocrNeededPages': ocr_needed,
            'ocrAttemptedPages': ocr_attempted,
            'ocrCompletedPages': sum(page['method'] == 'local_vision_ocr' for page in pages),
            'chunks': chunks}


def process(limit, perform_ocr, include_text):
    state = json.loads(RAW_STATE.read_text())
    if state.get('schema') != 'vibehard-oss-raw-batch/v1' or not state.get('manifestUploaded'):
        raise RuntimeError('Verified raw OSS batch is required')
    OUTPUT_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    snapshot = OUTPUT_ROOT / 'input-manifest.json'
    if snapshot.exists() and json.loads(snapshot.read_text()) != state:
        raise RuntimeError('Batch input is immutable; use a new output directory')
    if not snapshot.exists():
        atomic_json(snapshot, state)
    count = 0
    summary = Counter()
    seen_sources = set()
    for source in source_records(state, include_text):
        stable_key = digest_bytes(source['relative'].encode())
        if stable_key in seen_sources:
            continue
        seen_sources.add(stable_key)
        target = OUTPUT_ROOT / 'documents' / f'{stable_key}.json'
        if target.exists():
            document = json.loads(target.read_text())
            if document['parentSha256'] != source['parent']['sha256'] or document['rawBatchId'] != state['batchId']:
                raise RuntimeError('Resume provenance mismatch')
            if perform_ocr and document.get('ocrAttemptedPages', 0) < document['ocrNeededPages']:
                pass
            else:
                summary[document['review']['status']] += 1
                summary['pages'] += len(document['pages'])
                summary['chunks'] += len(document['chunks'])
                continue
        if limit and count >= limit:
            break
        try:
            sha256, pages, ocr_needed, ocr_attempted = (
                read_text(source) if source['kind'] in ('zip_text', 'direct_text') else read_pdf(source, perform_ocr))
            document = review_document(source, sha256, pages, ocr_needed, ocr_attempted)
            atomic_json(target, document)
            summary[document['review']['status']] += 1
            summary['pages'] += len(pages)
            summary['chunks'] += len(document['chunks'])
            summary['ocr_needed'] += ocr_needed
            summary['ocr_completed'] += document['ocrCompletedPages']
            count += 1
            if count % 25 == 0 or limit:
                print(json.dumps({'processed': count, 'pagesTotal': summary['pages'],
                                  'ocrNeededTotal': summary['ocr_needed'],
                                  'approved': summary['auto_approved_for_index'],
                                  'quarantined': summary['quarantine']}), flush=True)
        except Exception as error:
            summary['failed'] += 1
            atomic_json(OUTPUT_ROOT / 'failures' / f'{stable_key}.json', {'sourcePath': source['relative'], 'parentSha256': source['parent']['sha256'], 'errorCode': type(error).__name__, 'status': 'failed'})
            print(json.dumps({'failed': source['relative'], 'errorType': type(error).__name__}, ensure_ascii=False), file=sys.stderr, flush=True)
    atomic_json(OUTPUT_ROOT / 'processing-status.json', {'batchId': state['batchId'], 'summary': dict(summary), 'sourceCandidates': len(seen_sources), 'complete': not limit and not summary['failed']})
    print(json.dumps({'summary': dict(summary), 'newlyProcessed': count,
                      'sourceCandidates': len(seen_sources)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--ocr', action='store_true')
    parser.add_argument('--include-text', action='store_true')
    parser.add_argument('--raw-state', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--ocr-binary', type=Path, default=OCR_BINARY)
    options = parser.parse_args()
    RAW_STATE, SOURCE_ROOT, OUTPUT_ROOT, OCR_BINARY = options.raw_state, options.source_root, options.output_root, options.ocr_binary
    OUTPUT_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (OUTPUT_ROOT / '.process.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        process(options.limit, options.ocr, options.include_text)
