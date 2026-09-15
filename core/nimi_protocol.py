"""UTF-8 NDJSON on the Host's binary pipes, independent of Windows locale."""
import json
import sys


def read_request():
    return json.loads(sys.stdin.buffer.readline().decode('utf-8'))


def write_frame(value):
    data = (json.dumps(value, ensure_ascii=False) + '\n').encode('utf-8')
    sys.__stdout__.buffer.write(data)
    sys.__stdout__.buffer.flush()
