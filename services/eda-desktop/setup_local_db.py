"""One-time optional WSL PostgreSQL setup for persistent local platform projects.

Run as root with the checkout's ignored .env.local as the only argument.
Never modifies an existing DATABASE_URL, role, database, or production schema.
"""
import os
import secrets
import subprocess
import sys
from pathlib import Path

target = Path(sys.argv[1])
contents = target.read_text() if target.exists() else ''
if any(line.startswith('DATABASE_URL=') for line in contents.splitlines()):
    raise SystemExit('DATABASE_URL already configured; no changes made')
if os.geteuid() != 0:
    raise SystemExit('Run this one-time PostgreSQL setup as root in WSL')


port = os.environ.get('EDA_POSTGRES_PORT', '5438')
if not port.isdigit():
    raise SystemExit('Invalid local PostgreSQL port')


def sql(statement):
    result = subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-p', port, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('Local PostgreSQL setup failed; no credentials printed')
    return result.stdout.strip()


if sql("SELECT 1 FROM pg_roles WHERE rolname='vibehard_eda'") or sql("SELECT 1 FROM pg_database WHERE datname='vibehard_eda'"):
    raise SystemExit('Local role/database name already exists; refusing to replace it')
password = secrets.token_hex(32)
sql(f"CREATE ROLE vibehard_eda LOGIN PASSWORD '{password}'")
sql('CREATE DATABASE vibehard_eda OWNER vibehard_eda')
target.write_text(contents.rstrip() + f'\nDATABASE_URL=postgres://vibehard_eda:{password}@127.0.0.1:{port}/vibehard_eda\n')
print('Created dedicated local database; connection is stored only in ignored .env.local')
