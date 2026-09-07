# syntax=docker/dockerfile:1
# Interview agent service (Python LiveKit worker).
# Build context: lms/agent/ (Railway service root directory = lms/agent).
#   docker build -t praxel-agent lms/agent
FROM python:3.12-slim
ARG RAILWAY_GIT_COMMIT_SHA=unknown
WORKDIR /app
COPY pyproject.toml ./
COPY main.py ./
RUN printf '%s\n' "$RAILWAY_GIT_COMMIT_SHA" > /app/BUILD_SOURCE_SHA
RUN pip install --no-cache-dir .
# `start` is the livekit-agents production CLI subcommand
CMD ["python", "main.py", "start"]
