"""Packaged entry for the Streamlit renderer and bounded media worker."""
import os
from pathlib import Path
import sys

if len(sys.argv) > 1 and sys.argv[1] == "worker":
    from core.nimi_worker import run_main
    run_main()
else:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    os.chdir(root)
    port = sys.argv[1] if len(sys.argv) > 1 else "1467"
    from streamlit.web import cli
    sys.argv = ["streamlit", "run", str(root / "st.py"), "--server.address=127.0.0.1", f"--server.port={port}",
                "--global.developmentMode=false",
                "--client.toolbarMode=viewer",
                "--server.headless=true", "--browser.gatherUsageStats=false"]
    raise SystemExit(cli.main())
