# Cookbook AI server

Runs headless Claude Code with the owner's subscription token, for the cookbook's AI jobs (see `tasks.mjs`): structuring pasted or fetched recipe text, and recipe videos, which `video.py` turns into a transcript (faster-whisper, on the CPU) and contact sheets of frames that Claude reads. Only the Supabase `ai` Edge Function calls it, with a shared secret, after checking the user's session, membership, that the book is turned on and the daily limits. See CLAUDE.md "AI".

## Install on the server (`gilsa`)

```sh
mkdir -p ~/apps/cookbook-ai && chmod 700 ~/apps/cookbook-ai
cp server.mjs tasks.mjs video.py set-claude-token.sh ~/apps/cookbook-ai/
# Video recipes (TikTok, YouTube, Instagram): download, speech-to-text, frames.
# No ffmpeg needed: yt-dlp picks a single-file format and PyAV decodes it.
python3 -m venv ~/apps/cookbook-ai/.venv
~/apps/cookbook-ai/.venv/bin/pip install yt-dlp faster-whisper "av<16" pillow
# ~/apps/cookbook-ai/.env (chmod 600):
#   AI_SERVER_SECRET=<64 random hex characters, same as the Supabase secret>
#   CLAUDE_CODE_OAUTH_TOKEN=<from `claude setup-token`>
#   AI_MODEL_EXTRACT=sonnet
#   PORT=8810
cp cookbook-ai.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now cookbook-ai
tailscale funnel --bg --https=10000 http://127.0.0.1:8810
```

Then set the Edge Function's secrets: `AI_SERVER_URL=https://<machine>.<tailnet>.ts.net:10000` and `AI_SERVER_SECRET`.

## Operate

- Logs (task, outcome and duration only): `journalctl --user -u cookbook-ai -f`
- New token: `claude setup-token`, then `~/apps/cookbook-ai/set-claude-token.sh`
- Update: copy `server.mjs`, `tasks.mjs` and `video.py` again, then `systemctl --user restart cookbook-ai`
- Video sites change often: `~/apps/cookbook-ai/.venv/bin/pip install -U yt-dlp` when downloads start failing
- Turn a book on: `insert into public.ai_access (book_id) values ('<book id>');` (SQL editor)
