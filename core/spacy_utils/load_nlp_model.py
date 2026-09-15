from core.nimi_annotation import NimiLanguageAnalysis
from core.utils import get_source_language

def init_nlp():
    return NimiLanguageAnalysis(get_source_language())

# --------------------
# define the intermediate files
# --------------------
SPLIT_BY_COMMA_FILE = "output/log/split_by_comma.txt"
SPLIT_BY_CONNECTOR_FILE = "output/log/split_by_connector.txt"
SPLIT_BY_MARK_FILE = "output/log/split_by_mark.txt"
