"""One-time local setup, runnable from PyCharm or a terminal with Python 3.12+."""

import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(command, cwd=ROOT):
    print("\n> " + " ".join(str(c) for c in command), flush=True)
    subprocess.run([str(c) for c in command], cwd=cwd, check=True)


def main():
    if sys.version_info < (3, 12):
        raise SystemExit(
            "Please install Python 3.12 or 3.13 first. This project was tested with 3.13."
        )
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit(
            "Node.js 22 LTS and npm are required. Install Node.js, restart PyCharm, and retry."
        )
    environment = ROOT / ".venv"
    interpreter = environment / (
        "Scripts/python.exe" if os.name == "nt" else "bin/python"
    )
    if not interpreter.exists():
        print("Creating the project virtual environment…", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    if subprocess.run(
        [str(interpreter), "-m", "pip", "--version"], capture_output=True, check=False
    ).returncode:
        run([interpreter, "-m", "ensurepip", "--upgrade"])
    run(
        [
            interpreter,
            "-m",
            "pip",
            "install",
            "-r",
            ROOT / "backend/requirements.lock.txt",
        ]
    )
    run([npm, "ci"], ROOT / "frontend")
    run([npm, "run", "build"], ROOT / "frontend")
    print("\nOceanTwin is ready. Select .venv in PyCharm and run run.py.")
    print("Open http://127.0.0.1:8000 in your browser.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        raise SystemExit(
            f"Setup stopped because a command failed (exit {exc.returncode}). Fix the error above and rerun setup_project.py."
        ) from exc
