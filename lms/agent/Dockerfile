# syntax=docker/dockerfile:1
# Interview agent service (Python LiveKit worker).
# Build context: lms/agent/ (Railway service root directory = lms/agent).
#   docker build -t praxel-agent lms/agent
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY main.py ./
RUN pip install --no-cache-dir .
# `start` is the livekit-agents production CLI subcommand
CMD ["python", "main.py", "start"]
