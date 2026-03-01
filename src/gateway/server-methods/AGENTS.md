# Gateway Server Methods Notes

- Session transcripts are JSONL files. Each line is a JSON object. The first line is a session header (`type: "session"`), subsequent lines are message entries (`type: "message"`). Append new entries as `JSON.stringify(entry) + "\n"`.
