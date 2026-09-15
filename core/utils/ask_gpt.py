import os
import json
from threading import Lock
from core.nimi_bridge import NimiRequestError, request_model
from core.utils.config_utils import load_key
from rich import print as rprint
from core.utils.decorator import except_handler

# ------------
# cache gpt response
# ------------

LOCK = Lock()
GPT_LOG_FOLDER = 'output/gpt_log'

def _save_cache(model, prompt, resp_content, resp_type, resp, message=None, log_title="default"):
    with LOCK:
        logs = []
        file = os.path.join(GPT_LOG_FOLDER, f"{log_title}.json")
        os.makedirs(os.path.dirname(file), exist_ok=True)
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        logs.append({"model": model, "prompt": prompt, "resp_content": resp_content, "resp_type": resp_type, "resp": resp, "message": message})
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=4)

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
# ask gpt once
# ------------

@except_handler("GPT request failed", retry=5)
def ask_gpt(prompt, resp_type=None, valid_def=None, log_title="default"):
    # check cache
    model = load_key("nimi_text_cache_key")
    cached = _load_cache(model, prompt, resp_type, log_title)
    if cached:
        rprint("use cache response")
        return cached

    result = request_model("text", {"prompt": prompt, "responseType": "json" if resp_type == "json" else "text", "step": log_title})
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
    
    # check if the response format is valid
    if valid_def:
        valid_resp = valid_def(resp)
        if valid_resp['status'] != 'success':
            _save_cache(model, prompt, resp_content, resp_type, resp, log_title="error", message=valid_resp['message'])
            raise ValueError(f"❎ API response error: {valid_resp['message']}")

    _save_cache(model, prompt, resp_content, resp_type, resp, log_title=log_title)
    return resp


if __name__ == '__main__':
    from rich import print as rprint
    
    result = ask_gpt("""test respond ```json\n{\"code\": 200, \"message\": \"success\"}\n```""", resp_type="json")
    rprint(f"Test json output result: {result}")
