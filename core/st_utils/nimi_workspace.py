"""Mount the SDK/Kit workspace inside the real Streamlit renderer."""
from pathlib import Path
import streamlit as st


ROOT = Path(__file__).resolve().parents[2]


def render_nimi_workspace(locale):
    javascript = ROOT / "dist-component/component.js"
    stylesheet = ROOT / "dist-component/component.css"
    if not javascript.is_file() or not stylesheet.is_file():
        st.error("The VideoLingo interface build is missing. Run pnpm run build:component before starting the App.")
        return
    component = st.components.v2.component(
        "videolingo_nimi_workspace",
        js=javascript.read_text(encoding="utf-8"),
        css=stylesheet.read_text(encoding="utf-8"),
        isolate_styles=False,
    )
    component(data={"locale": locale}, key="videolingo_workspace")
