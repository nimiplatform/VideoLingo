"""VideoLingo's Streamlit product renderer, hosted through Nimi Electron."""
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

import streamlit as st
from translations.translations import DISPLAY_LANGUAGES, init_display_language
from core.st_utils.nimi_workspace import render_nimi_workspace

ROOT = Path(__file__).resolve().parent
st.set_page_config(page_title="VideoLingo", page_icon=str(ROOT / "docs/logo.svg"))


def main():
    logo, language = st.columns([3, 1])
    with logo:
        st.image(str(ROOT / "docs/logo.png"), width="stretch")
    with language:
        current = init_display_language()
        values = list(DISPLAY_LANGUAGES.values())
        selected = st.selectbox("Display Language 🌐", list(DISPLAY_LANGUAGES),
                                index=values.index(current) if current in values else 0)
        locale = DISPLAY_LANGUAGES[selected]
        st.session_state["_display_language"] = locale
        st.query_params["lang"] = locale
    render_nimi_workspace(locale)
    st.caption("VideoLingo · Connect the World, Frame by Frame")


if __name__ == "__main__":
    main()
