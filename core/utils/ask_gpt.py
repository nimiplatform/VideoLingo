import ipaddress
import json
import os
import re
from threading import Lock
from urllib.parse import urlparse

import json_repair
from rich import print as rprint

from core.nimi_bridge import NimiRequestError, request_model
from core.utils.config_utils import load_key
from core.utils.decorator import except_handler

# ------------
# cache gpt response
# ------------

LOCK = Lock()
GPT_LOG_FOLDER = 'output/gpt_log'


def _save_cache(model, prompt, resp_content, resp_type, resp, message=None, log_title="default", failure=None, request_context=None):
    with LOCK:
        logs = []
        file = os.path.join(GPT_LOG_FOLDER, f"{log_title}.json")
        os.makedirs(os.path.dirname(file), exist_ok=True)
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        logs.append({"model": model, "prompt": prompt, "resp_content": resp_content, "resp_type": resp_type, "resp": resp, "message": message,
                     **({'failure': failure} if failure is not None else {})})
        if request_context is not None:
            logs[-1]['request_context'] = request_context
        temporary = file + '.tmp'
        with open(temporary, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=4)
        os.replace(temporary, file)


def _checkpoint_cache(step):
    try:
        enabled = load_key('nimi_persist_text_cache')
    except KeyError:
        enabled = False
    if enabled:
        request_model('checkpoint', {'stage': 'model-cache', 'step': step})


def _load_cache(model, prompt, resp_type, log_title):
    with LOCK:
        file = os.path.join(GPT_LOG_FOLDER, f"{log_title}.json")
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                for item in json.load(f):
                    if item.get("model") == model and item["prompt"] == prompt and item["resp_type"] == resp_type:
                        return item["resp"]
        return False


# ------------
# standalone upstream URL/JSON helpers (preserved for upstream unit tests;
# Nimi runtime execution routes through request_model below)
# ------------

LOCAL_API_KEY = "not-needed"


def is_local_endpoint(base_url):
    """Ollama, LM Studio, vLLM... on this machine or the private network need no API key."""
    host = (urlparse(base_url if "//" in str(base_url) else f"//{base_url}").hostname or "").lower()
    if host in ("localhost", "host.docker.internal") or host.endswith((".local", ".localhost")):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_unspecified


def get_api_key():
    key = load_key("api.key")
    if key:
        return key
    if is_local_endpoint(load_key("api.base_url")):
        return LOCAL_API_KEY
    raise ValueError("API key is not set")


def normalize_base_url(base_url):
    """Accept the forms people paste: with or without /v1, or the full chat completions URL."""
    base_url = str(base_url or "").strip()
    if 'ark' in base_url:
        return "https://ark.cn-beijing.volces.com/api/v3"
    base_url = re.sub(r'/chat/completions/?$', '', base_url.rstrip('/'))
    if 'v1' not in base_url and not re.search(r'/v\d+$', base_url):
        base_url = base_url.strip('/') + '/v1'
    return base_url


def parse_json_response(resp_content):
    """Read the JSON object of a reply that may carry reasoning or prose around it."""
    text = re.sub(r'<think>.*?</think>', '', resp_content or '', flags=re.DOTALL | re.IGNORECASE)
    text = re.split(r'</think>', text, flags=re.IGNORECASE)[-1]
    text = re.sub(r'<think>.*', '', text, flags=re.DOTALL | re.IGNORECASE)
    blocks = re.findall(r'```(?:json)?[ \t]*\n(.*?)```', text, flags=re.DOTALL | re.IGNORECASE)
    candidates = [block for block in reversed(blocks) if '{' in block] + [text]
    for candidate in candidates:
        resp = json_repair.loads(candidate)
        if isinstance(resp, list):
            resp = next((item for item in reversed(resp) if isinstance(item, dict)), resp)
        if isinstance(resp, dict) and resp:
            return resp
    raise ValueError(f"❎ API response is not a JSON object: {str(resp_content)[:200]!r}")


# ------------
# ask gpt once (Nimi-backed)
# ------------

@except_handler("GPT request failed", retry=5)
def ask_gpt(prompt, resp_type=None, valid_def=None, log_title="default", request_context=None):
    model = load_key("nimi_text_cache_key")
    cached = _load_cache(model, prompt, resp_type, log_title)
    if cached:
        rprint("use cache response")
        return cached

    try:
        result = request_model("text", {"prompt": prompt, "responseType": "json" if resp_type == "json" else "text", "step": log_title, "context": request_context})
    except NimiRequestError as error:
        message = f'{log_title}: {error}'
        try:
            enabled = load_key('nimi_persist_text_cache')
        except KeyError:
            enabled = False
        if enabled:
            try:
                _save_cache(model, prompt, None, resp_type, None, message=message, log_title='error', failure=error.fields, request_context=request_context)
                _checkpoint_cache('error')
            except Exception as retention_error:
                message += f' (Could not retain request diagnostics: {retention_error})'
        raise NimiRequestError({**error.fields, 'message': message}) from error
    resp_content = result["text"]
    if result.get("finishReason") != "stop" or not isinstance(resp_content, str) or not resp_content.strip():
        raise ValueError("Nimi did not return a complete text result")
    if resp_type == "json":
        try:
            resp = json.loads(resp_content)
        except json.JSONDecodeError as error:
            raise NimiRequestError({"message": "Nimi returned invalid JSON for a JSON-object request", "reasonCode": "AI_OUTPUT_INVALID", "retryable": False}) from error
        if not isinstance(resp, dict):
            raise NimiRequestError({"message": "Nimi JSON-object output must be an object", "reasonCode": "AI_OUTPUT_INVALID", "retryable": False})
    else:
        resp = resp_content

    if valid_def:
        valid_resp = valid_def(resp)
        if valid_resp['status'] != 'success':
            _save_cache(model, prompt, resp_content, resp_type, resp, log_title="error", message=valid_resp['message'])
            _checkpoint_cache('error')
            raise ValueError(f"❎ API response error: {valid_resp['message']}")

    _save_cache(model, prompt, resp_content, resp_type, resp, log_title=log_title, request_context=request_context)
    _checkpoint_cache(log_title)
    return resp
