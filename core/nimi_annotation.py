"""Read-only projections of real Nimi annotations for the original split rules."""
from core.nimi_bridge import request_model


class Token:
    def __init__(self, document, index, value):
        self.document, self.i = document, index
        self.text = value["text"]
        self.idx, self.end = value["start"], value["end"]
        self.pos_, self.dep_ = value["partOfSpeech"], value["dependency"]
        self.is_punct = value["isPunctuation"]
        self.head_index = value["headIndex"]

    @property
    def head(self):
        return self.document.tokens[self.head_index]

    @property
    def is_sent_end(self):
        return self.i in self.document.sentence_ends

    def __str__(self):
        return self.text


class Span:
    def __init__(self, document, start, end):
        self.document, self.start, self.end = document, start, end

    @property
    def text(self):
        if self.start == self.end:
            return ""
        return self.document.text[self.document.tokens[self.start].idx:self.document.tokens[self.end - 1].end]

    def __len__(self):
        return self.end - self.start

    def __iter__(self):
        return iter(self.document.tokens[self.start:self.end])

    def __getitem__(self, key):
        if isinstance(key, slice):
            start, end, step = key.indices(len(self))
            if step != 1:
                raise ValueError("Annotation spans require a contiguous slice")
            return Span(self.document, self.start + start, self.start + max(start, end))
        return self.document.tokens[self.start:self.end][key]

    def __str__(self):
        return self.text


class Document(Span):
    def __init__(self, value, expected_text, language):
        if value["text"] != expected_text or value["language"] != language:
            raise ValueError("Language analysis changed its source text or language")
        self._text, self.lang_ = expected_text, language
        self.tokens = [Token(self, i, token) for i, token in enumerate(value["tokens"])]
        last = 0
        for token in self.tokens:
            if not (last <= token.idx < token.end <= len(expected_text)) or expected_text[token.idx:token.end] != token.text:
                raise ValueError("Language analysis has invalid Unicode offsets")
            if expected_text[last:token.idx].strip():
                raise ValueError("Language analysis omitted source characters")
            if not (0 <= token.head_index < len(self.tokens)) or not token.pos_ or not token.dep_ or not isinstance(token.is_punct, bool):
                raise ValueError("Language analysis has invalid token annotations")
            last = token.end
        if expected_text[last:].strip():
            raise ValueError("Language analysis omitted the end of its source")
        self.sents = []
        self.sentence_ends = set()
        start = 0
        for sentence in value["sentences"]:
            end = sentence["endToken"]
            if sentence["startToken"] != start or not (start < end <= len(self.tokens)):
                raise ValueError("Language analysis sentence boundaries are incomplete")
            self.sents.append(Span(self, start, end))
            self.sentence_ends.add(end - 1)
            start = end
        if start != len(self.tokens):
            raise ValueError("Language analysis omitted sentence boundaries")
        super().__init__(self, 0, len(self.tokens))

    @property
    def text(self):
        return self._text

    def has_annotation(self, name):
        return name == "SENT_START"


class NimiLanguageAnalysis:
    def __init__(self, language):
        if language not in {"en", "de", "es", "fr", "it", "ru", "zh", "ja"}:
            raise ValueError(f"Configure a supported source language: {language}")
        self.language, self.cache = language, {}

    def prefetch(self, texts):
        pending = list(dict.fromkeys(text for text in texts if text not in self.cache))
        while pending:
            batch, size = [], 0
            while pending and len(batch) < 64:
                encoded_size = len(pending[0].encode("utf-8"))
                if encoded_size > 512 * 1024:
                    raise ValueError("This analysis document exceeds Nimi's 512 KiB input limit")
                if size + encoded_size > 512 * 1024:
                    break
                batch.append(pending.pop(0))
                size += encoded_size
            result = request_model("annotate", {"language": self.language, "texts": batch})
            if len(result["documents"]) != len(batch):
                raise ValueError("Language analysis returned a partial batch")
            for source, value in zip(batch, result["documents"]):
                self.cache[source] = Document(value, source, self.language)

    def __call__(self, text):
        self.prefetch([text])
        return self.cache[text]
