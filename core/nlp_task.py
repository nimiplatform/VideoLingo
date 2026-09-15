"""Original subtitle splitting from Nimi annotations and the real ASR word table."""
import pandas as pd
from core.preview_tasks import configuration
from core.utils.models import _3_1_SPLIT_BY_NLP


def split_nlp(request, workspace):
    from core._3_1_split_nlp import split_by_spacy
    from core._6_gen_sub import get_sentence_timestamps, remove_punctuation

    configuration(request)
    split_by_spacy()
    output = workspace / _3_1_SPLIT_BY_NLP
    text = output.read_text(encoding="utf-8")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("The original NLP rules produced no subtitle sentences")
    words = pd.read_excel(workspace / "output/log/cleaned_chunks.xlsx")
    canonical = lambda values: "".join(remove_punctuation(value.lower()).replace(" ", "") for value in values)
    if canonical(words["text"]) != canonical(lines):
        raise ValueError("The subtitle splitting rules lost or changed source words")
    # Matching validates continuity against existing times; analysis supplies no times.
    get_sentence_timestamps(words, pd.DataFrame({"Source": lines}))
    return {"file": str(output), "text": text}
