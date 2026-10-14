"""DeepSeek client (OpenAI-compatible API) with JSON validation and retry."""
from __future__ import annotations

import json
import os
import re
from typing import TypeVar

from openai import BadRequestError, OpenAI
from pydantic import BaseModel, ValidationError

from db import secret

MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro")
_client = None  # created on first use so the key can come from the dashboard settings
_json_mode = True  # switched off for the rest of the run if the API rejects it

T = TypeVar("T", bound=BaseModel)


def _extract_json(text: str) -> str:
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fence:
        return fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start != -1 and end > start else text


def chat_json(system: str, user: str, schema: type[T], retries: int = 2) -> T:
    """Ask for a JSON object, validate it against `schema`, retry with the error on failure."""
    global _json_mode, _client
    if _client is None:
        _client = OpenAI(
            api_key=secret("deepseek_key", "DEEPSEEK_API_KEY"),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout=120,
        )
    schema_hint = json.dumps(schema.model_json_schema()["properties"], indent=2)
    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": f"{user}\n\nReturn ONLY a JSON object with these fields:\n{schema_hint}",
        },
    ]
    last_err = ""
    for attempt in range(retries + 1):
        kwargs = {"model": MODEL, "messages": messages}
        if _json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = _client.chat.completions.create(**kwargs)
        except BadRequestError:
            if not _json_mode:
                raise
            _json_mode = False
            continue
        text = resp.choices[0].message.content or ""
        try:
            return schema.model_validate_json(_extract_json(text))
        except (ValidationError, ValueError) as e:
            last_err = str(e)[:400]
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"That was not valid. Problem: {last_err}\nReturn the corrected JSON object only."},
            ]
    raise RuntimeError(f"LLM returned invalid JSON after {retries + 1} attempts: {last_err}")
