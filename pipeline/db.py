"""Cloudflare D1 access and secret lookup shared by the pipeline scripts."""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

CF_ACCOUNT_ID = os.environ["CF_ACCOUNT_ID"]
CF_D1_DATABASE_ID = os.environ["CF_D1_DATABASE_ID"]
CF_API_TOKEN = os.environ["CF_API_TOKEN"]  # needs D1 Edit permission only

D1_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
    f"/d1/database/{CF_D1_DATABASE_ID}/query"
)


def d1(sql: str, params: list | None = None) -> list[dict]:
    """Run one SQL statement against D1 and return the result rows."""
    resp = requests.post(
        D1_URL,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
        json={"sql": sql, "params": params or []},
        timeout=30,
    )
    body = resp.json()
    if not resp.ok or not body.get("success"):
        raise RuntimeError(f"D1 error {resp.status_code}: {body.get('errors')}")
    return body["result"][0].get("results", [])


def decrypt(blob: str, master: str) -> str:
    """Decrypt a value written by the dashboard: 'v1.<b64 iv>.<b64 ciphertext+tag>' (AES-256-GCM)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    version, iv, ct = blob.split(".")
    if version != "v1":
        raise ValueError("Unknown secret format")
    key = hashlib.sha256(master.encode()).digest()
    return AESGCM(key).decrypt(base64.b64decode(iv), base64.b64decode(ct), None).decode()


def secret(name: str, env_name: str) -> str:
    """An API key from the environment, else from the dashboard's encrypted settings table."""
    value = os.getenv(env_name)
    if value:
        return value
    master = os.getenv("SETTINGS_KEY")
    if not master:
        raise SystemExit(f"Missing {env_name}. Put it in .env, or set SETTINGS_KEY here and enter the key in the dashboard Settings.")
    rows = d1("SELECT value FROM settings WHERE name = ?", [name])
    if not rows:
        raise SystemExit(f"{env_name} is not set. Add it in the dashboard under Settings, or put it in .env.")
    return decrypt(rows[0]["value"], master)
