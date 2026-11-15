#!/usr/bin/env python3
"""Pick a running Pi and submit a native follow-up without changing app focus."""
import curses
import json
import os
from pathlib import Path
import socket
import stat
import sys
import unicodedata
import tomllib

from picker import ROOT, close_picker_popup


def agents():
    root = Path(os.environ.get("REX_AGENT_INPUT_DIR", str(
        Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "rex/agent-input")))
    favorites = tomllib.loads((ROOT / "agent-message.toml").read_text())["favorites"]
    found = []
    for file in root.glob("*.json"):
        try:
            agent = json.loads(file.read_text())
            if agent["server"] != os.environ.get("REX_SERVER"):
                continue
            info = Path(agent["socket"]).stat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                continue
            os.kill(agent["pid"], 0)
            match = next(((i, item) for i, item in enumerate(favorites)
                          if Path(item["cwd"]).expanduser() == Path(agent["cwd"])), None)
            agent["rank"] = match[0] if match else len(favorites)
            agent["name"] = match[1]["name"] if match else Path(agent["cwd"]).name
            found.append(agent)
        except (OSError, ValueError, KeyError, TypeError):
            continue  # A crashed or shutting-down process can leave stale metadata.
    return sorted(found, key=lambda a: (a["rank"], a["name"], a["session_id"]))


def deliver(agent, text):
    """One request only. A lost acknowledgement must never cause an automatic retry."""
    if not text.strip() or len(text.encode()) > 64 * 1024:
        raise ValueError("Message must contain text and be at most 64 KiB")
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(5)
        connection.connect(agent["socket"])
        connection.sendall((json.dumps({"session_id": agent["session_id"], "text": text}) + "\n").encode())
        response = b""
        while b"\n" not in response:
            chunk = connection.recv(4096)
            if not chunk or len(response) > 8192:
                raise RuntimeError("No acknowledgement. Delivery may have succeeded; check the target before retrying.")
            response += chunk
        result = json.loads(response.split(b"\n", 1)[0])
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "Agent rejected the message"))


def line(screen, y, text, style=0):
    height, width = screen.getmaxyx()
    if 0 <= y < height - 1:
        screen.addnstr(y, 2, text.replace("\n", " "), max(0, width - 4), style)


def edit_message(screen):
    """Unicode editor. Enter submits, Ctrl+J inserts a newline, Escape cancels."""
    height, width = screen.getmaxyx()
    editor = curses.newwin(height - 5, width - 4, 4, 2)
    editor.keypad(True)
    chars, cursor = [], 0
    curses.curs_set(1)
    try:
        while True:
            editor.erase()
            positions = [(0, 0)]
            y, x = 0, 0
            for char in chars:
                if char == "\n":
                    y, x = y + 1, 0
                else:
                    size = 0 if unicodedata.combining(char) else (2 if unicodedata.east_asian_width(char) in ("W", "F") else 1)
                    x += size
                    if x >= width - 6:
                        y, x = y + 1, 0
                positions.append((y, x))
            cy, cx = positions[cursor]
            offset = max(0, cy - (height - 7))
            for index, char in enumerate(chars):
                y, x = positions[index]
                if char != "\n" and offset <= y < offset + height - 5:
                    try:
                        editor.addstr(y - offset, x, char)
                    except curses.error:
                        pass
            editor.move(cy - offset, cx)
            editor.refresh()
            key = editor.get_wch()
            if key == "\x1b":
                # Bracketed paste must not interpret embedded newlines as submit.
                editor.timeout(50)
                try:
                    prefix = "".join(str(editor.get_wch()) for _ in range(5))
                except curses.error:
                    return None
                finally:
                    editor.timeout(-1)
                if prefix != "[200~":
                    return None
                pasted = ""
                while not pasted.endswith("\x1b[201~"):
                    value = editor.get_wch()
                    if isinstance(value, str):
                        pasted += value
                    if len(pasted) > 64 * 1024:
                        return None
                value = pasted[:-6].replace("\r\n", "\n").replace("\r", "\n")
                chars[cursor:cursor] = list(value)
                cursor += len(value)
                continue
            if key == curses.KEY_RESIZE:
                return None
            if key in ("\r", curses.KEY_ENTER):
                return "".join(chars)
            if key == curses.KEY_LEFT:
                cursor = max(0, cursor - 1)
            elif key == curses.KEY_RIGHT:
                cursor = min(len(chars), cursor + 1)
            elif key == curses.KEY_HOME:
                cursor = "".join(chars).rfind("\n", 0, cursor) + 1
            elif key == curses.KEY_END:
                end = "".join(chars).find("\n", cursor)
                cursor = len(chars) if end < 0 else end
            elif key in (curses.KEY_BACKSPACE, "\x7f", "\b"):
                if cursor:
                    cursor -= 1
                    chars.pop(cursor)
            elif key == curses.KEY_DC:
                if cursor < len(chars):
                    chars.pop(cursor)
            elif isinstance(key, str) and (key.isprintable() or key == "\n"):
                chars.insert(cursor, key)
                cursor += 1
    finally:
        curses.curs_set(0)


def compose(screen):
    curses.curs_set(0)
    curses.nonl()  # Enter is CR. Ctrl+J stays LF for multiline messages.
    choices = agents()
    selected, query = 0, ""
    while True:
        screen.erase()
        line(screen, 1, "Queue a message to Pi", curses.A_BOLD)
        line(screen, 2, "Choose an agent. Type to filter, Enter to compose, Esc to cancel.")
        line(screen, 3, "> " + query)
        visible = [a for a in choices if query.lower() in (a["name"] + " " + a["cwd"]).lower()]
        selected = min(selected, max(0, len(visible) - 1))
        height, width = screen.getmaxyx()
        if height < 9 or width < 35:
            line(screen, 4, "Popup too small. Resize it, or Esc to close.")
        elif not visible:
            line(screen, 5, "No agents found. Run /reload in the target Pi session first.")
        else:
            start = max(0, selected - (height - 8))
            for index in range(start, min(len(visible), start + height - 6)):
                agent = visible[index]
                label = f"{agent['name']}  {agent['cwd']}  [{agent['session_id'][-8:]}]"
                line(screen, 5 + index - start, label,
                     curses.A_REVERSE if index == selected else 0)
        screen.refresh()
        key = screen.get_wch()
        if key == "\x1b":
            return
        if key == curses.KEY_UP:
            selected = max(0, selected - 1)
        elif key == curses.KEY_DOWN:
            selected = min(max(0, len(visible) - 1), selected + 1)
        elif key in ("\r", curses.KEY_ENTER) and visible and height >= 9 and width >= 35:
            agent = visible[selected]
            screen.erase()
            line(screen, 1, "To: " + agent["name"] + "  " + agent["cwd"], curses.A_BOLD)
            line(screen, 2, "Enter queues. Ctrl+J adds a line. Esc cancels. Existing drafts stay untouched.")
            screen.refresh()
            message = edit_message(screen)
            if message is None:
                return
            if not message.strip():
                continue
            try:
                deliver(agent, message)
                return
            except (OSError, ValueError, RuntimeError) as error:
                screen.erase()
                line(screen, 1, "Message not confirmed", curses.A_BOLD)
                line(screen, 3, str(error))
                line(screen, 5, "Check the target before retrying. Press any key to close.")
                screen.refresh()
                screen.get_wch()
                return
        elif key in (curses.KEY_BACKSPACE, "\x7f", "\b"):
            query = query[:-1]
            selected = 0
        elif isinstance(key, str) and key.isprintable():
            query += key
            selected = 0


if __name__ == "__main__":
    try:
        sys.stdout.write("\x1b[?2004h")
        sys.stdout.flush()
        curses.wrapper(compose)
    finally:
        sys.stdout.write("\x1b[?2004l")
        sys.stdout.flush()
        close_picker_popup()
