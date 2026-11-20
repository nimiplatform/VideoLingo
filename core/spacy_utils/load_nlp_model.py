from core.nimi_annotation import NimiLanguageAnalysis
from core.utils import get_source_language
from core.utils.config_utils import load_key_or

DEFAULT_SPACY_MODELS = {
    "ko": "ko_core_news_md", "pt": "pt_core_news_md", "nl": "nl_core_news_md",
    "sv": "sv_core_news_md", "da": "da_core_news_md", "fi": "fi_core_news_md",
    "pl": "pl_core_news_md", "el": "el_core_news_md", "ro": "ro_core_news_md",
    "mk": "mk_core_news_md", "yue": "zh_core_web_md",
}


def get_spacy_model(language: str):
    """Configured or default spaCy model name for `language`, or None when unsupported."""
    configured = load_key_or("spacy_model_map", None)
    mapping = {**DEFAULT_SPACY_MODELS, **(configured if isinstance(configured, dict) else {})}
    return mapping.get(language.lower())


def init_nlp():
    return NimiLanguageAnalysis(get_source_language())


# --------------------
# define the intermediate files
# --------------------
SPLIT_BY_COMMA_FILE = "output/log/split_by_comma.txt"
SPLIT_BY_CONNECTOR_FILE = "output/log/split_by_connector.txt"
SPLIT_BY_MARK_FILE = "output/log/split_by_mark.txt"
