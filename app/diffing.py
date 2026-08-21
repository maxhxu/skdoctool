"""
Produces a structured, line-based diff the frontend can render directly
(no diff-parsing logic needed client-side) — a list of rows, each tagged
context/add/remove, carrying old/new line numbers for a classic gutter.
"""

import difflib
from typing import TypedDict


class DiffLine(TypedDict):
    type: str  # "context" | "add" | "remove"
    text: str
    old_line: int | None
    new_line: int | None


def diff_lines(old_text: str, new_text: str) -> list[DiffLine]:
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    matcher = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)

    rows: list[DiffLine] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                rows.append(
                    {
                        "type": "context",
                        "text": old_lines[i1 + offset],
                        "old_line": i1 + offset + 1,
                        "new_line": j1 + offset + 1,
                    }
                )
        else:
            if tag in ("delete", "replace"):
                for offset in range(i1, i2):
                    rows.append(
                        {
                            "type": "remove",
                            "text": old_lines[offset],
                            "old_line": offset + 1,
                            "new_line": None,
                        }
                    )
            if tag in ("insert", "replace"):
                for offset in range(j1, j2):
                    rows.append(
                        {
                            "type": "add",
                            "text": new_lines[offset],
                            "old_line": None,
                            "new_line": offset + 1,
                        }
                    )
    return rows
