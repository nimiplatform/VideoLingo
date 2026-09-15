"""App-owned model messages over the worker's Host-controlled stdio channel."""
import json
import os
from queue import Queue
import sys
import threading
import uuid


class NimiRequestError(RuntimeError):
    def __init__(self, details):
        super().__init__(details.get("message", "Nimi request failed"))
        self.reason_code = details.get("reasonCode", "")
        self.retryable = details.get("retryable") is True
        self.action_hint = details.get("actionHint", "")
        self.fields = {key: details[key] for key in ("reasonCode", "actionHint", "traceId", "retryable", "interruption") if key in details}


_pending = {}
_lock = threading.Lock()
_write_lock = threading.Lock()
_enabled = False
_reader_started = False


def bind_host_channel():
    global _enabled
    _enabled = True


def _start_receiver():
    global _reader_started
    with _lock:
        if _reader_started:
            return
        _reader_started = True

    def receive():
        buffer = b""
        try:
            while True:
                chunk = os.read(sys.stdin.fileno(), 65536)
                if not chunk:
                    break
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    response = json.loads(line)
                    with _lock:
                        queue = _pending.get(response.get("id"))
                    if queue is not None:
                        queue.put(response)
        finally:
            with _lock:
                for queue in _pending.values():
                    queue.put({"error": {"message": "VideoLingo Host disconnected", "reasonCode": "HOST_DISCONNECTED"}})

    threading.Thread(target=receive, daemon=True).start()


def request_model(kind, payload):
    if not _enabled:
        raise NimiRequestError({"message": "Start this business task from the Nimi-hosted VideoLingo App", "reasonCode": "NIMI_HOST_REQUIRED"})
    if kind not in {"text", "speech", "annotate", "checkpoint"}:
        raise ValueError("Unsupported VideoLingo model message")
    request_id = str(uuid.uuid4())
    queue = Queue()
    with _lock:
        _pending[request_id] = queue
    try:
        # Load the business modules before starting a blocking Windows pipe reader.
        # Starting it earlier can deadlock NumPy's native module initialization.
        _start_receiver()
        with _write_lock:
            sys.__stdout__.write(json.dumps({"type": "model-request", "id": request_id, "kind": kind, "input": payload}, ensure_ascii=False) + "\n")
            sys.__stdout__.flush()
        response = queue.get()
        if "error" in response:
            raise NimiRequestError(response["error"])
        return response["value"]
    finally:
        with _lock:
            _pending.pop(request_id, None)
