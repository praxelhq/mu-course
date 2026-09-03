"""Replay an interview against the REAL dialog model and the REAL end guard.

The point is to test the thing that actually broke — whether the interviewer
reaches the student's own workflow and sector map before it tries to end —
without making a student sit through another fifteen minutes.

Faithful where it matters: the interviewer is the production model
(DIALOG_MODEL) reached through LiveKit Inference exactly as the agent reaches
it, the system prompt is the one production built for this student (artifacts
and all), and end_interview is guarded by main.own_work_covered rather than a
copy of it. The student is simulated from their own recorded answers.

    uv run python simulate_interview.py <prompt-file> <prior-turns-file>

Needs LIVEKIT_URL/API_KEY/API_SECRET for the interviewer and ANTHROPIC_API_KEY
for the simulated student (offline harness only — never the production dialog).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.request

from livekit.agents import llm
from livekit.agents import inference
from livekit.agents.llm import function_tool

import main

QUESTION_BUDGET = 20


def load_student_corpus(path: str) -> str:
    lines = []
    for raw in open(path, encoding="utf-8"):
        if "|" not in raw:
            continue
        speaker, text = raw.split("|", 1)
        if speaker.strip() == "student" and text.strip() not in {".", ""}:
            lines.append(text.strip())
    return "\n".join(f"- {line}" for line in lines)


def student_reply(question: str, corpus: str, history: list[tuple[str, str]]) -> str:
    """The student, played from their own recorded answers."""
    system = (
        "You are role-playing a specific MBA student in an oral assessment. Answer "
        "in the first person, conversationally, 2-4 sentences, as speech not prose. "
        "Their real recorded answers are below — match that voice, level of detail "
        "and opinions, and reuse the same facts about their background (Senior "
        "Product Manager at MoEngage, now at Masters Union).\n\n"
        "They built a Make.com scenario that reads article URLs from a Google "
        "Sheet, fetches each page, strips the HTML, summarises it with AI Tools and "
        "writes the summary back. It has no error handler on the HTTP module, no "
        "filter to skip already-summarised rows, and hardcoded sheet IDs. If asked "
        "about their workflow or sector map, answer from that, honestly, including "
        "the gaps. Never break character and never mention being an AI.\n\n"
        f"THEIR RECORDED ANSWERS:\n{corpus}"
    )
    messages = []
    for role, text in history[-8:]:
        messages.append({"role": "assistant" if role == "student" else "user", "content": text})
    messages.append({"role": "user", "content": question})
    body = json.dumps(
        {"model": "claude-sonnet-5", "max_tokens": 400, "system": system, "messages": messages}
    ).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    data = json.load(urllib.request.urlopen(req))
    return "".join(b.get("text", "") for b in data["content"] if b["type"] == "text").strip()


async def run(prompt_path: str, turns_path: str) -> int:
    system_prompt = open(prompt_path, encoding="utf-8").read().strip()
    corpus = load_student_corpus(turns_path)
    print(f"  system prompt: {len(system_prompt)} chars")
    print(f"  student corpus: {corpus.count(chr(10)) + 1} recorded answers")
    print(f"  interviewer: {main.DIALOG_MODEL} via LiveKit Inference\n")

    question_count = 0
    agent_utterances: list[str] = []
    refusals = 0
    ended = False

    @function_tool
    async def end_interview() -> str:
        """Call this when the interview should end."""
        nonlocal ended, refusals
        covered = main.own_work_covered(agent_utterances)
        if question_count < main.MIN_TURNS_BEFORE_END or not covered:
            refusals += 1
            print(
                f"  ** end_interview REFUSED (questions={question_count}, "
                f"own-work covered={covered})\n"
            )
            return (
                "Not yet — you have not covered the final segment. Do NOT end the "
                "interview. Ask the student about the workflow and sector map they "
                "built and uploaded: how it handles errors and timeouts, what "
                "trigger criteria they chose and why, what they decided not to "
                'implement, and how they kept credit use down. Say "sector map" or '
                '"blueprint" in the question.'
            )
        ended = True
        return "The interview is over. Say a short, warm goodbye."

    interviewer = inference.LLM(model=main.DIALOG_MODEL)
    ctx = llm.ChatContext.empty()
    # Same wrapping production applies: the stored prompt targets the
    # turn-based JSON contract, and the voice override is what turns it into
    # speech. Skipping it made the first run emit JSON envelopes.
    ctx.add_message(role="system", content=main.realtime_instructions(system_prompt))
    ctx.add_message(role="user", content="[The student has joined the room.]")

    history: list[tuple[str, str]] = []

    while not ended and question_count < QUESTION_BUDGET:
        text = ""
        tool_called = False
        stream = interviewer.chat(chat_ctx=ctx, tools=[end_interview])
        async for chunk in stream:
            delta = getattr(chunk, "delta", None)
            if delta is None:
                continue
            if getattr(delta, "content", None):
                text += delta.content
            for call in getattr(delta, "tool_calls", None) or []:
                if getattr(call, "name", "") == "end_interview":
                    tool_called = True
        await stream.aclose()

        if tool_called:
            result = await end_interview()
            ctx.add_message(role="assistant", content=text or "[end_interview]")
            ctx.add_message(role="user", content=f"[tool result] {result}")
            if ended:
                print(f"  [{question_count}] INTERVIEWER ends: {text[:120]}")
                break
            continue

        if not text.strip():
            print("  (empty reply — stopping)")
            break

        question_count += 1
        agent_utterances.append(text)
        history.append(("agent", text))
        print(f"  [{question_count}] INTERVIEWER: {text.strip()[:220]}")

        answer = student_reply(text, corpus, history)
        history.append(("student", answer))
        ctx.add_message(role="assistant", content=text)
        ctx.add_message(role="user", content=answer)
        print(f"      STUDENT: {answer[:200]}\n")

    covered = main.own_work_covered(agent_utterances)
    print("\n" + "=" * 62)
    print(f"  questions asked      : {question_count}")
    print(f"  end_interview refused: {refusals}")
    print(f"  own work covered     : {covered}")
    print(f"  ended cleanly        : {ended}")
    print("=" * 62)
    said = " ".join(agent_utterances).lower()
    named = [m for m in main.OWN_WORK_IDENTITY_MARKERS if m in said]
    probed = [m for m in main.OWN_WORK_SUBSTANCE_MARKERS if m in said]
    print(f"  artifact named       : {named or 'NONE'}")
    print(f"  substance probed     : {probed or 'NONE'}")

    # Hand the transcript to the real grader so a simulated run reports a
    # score, not just coverage.
    out = os.environ.get("SIM_TRANSCRIPT_OUT")
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(
                [{"speaker": role, "text": text} for role, text in history],
                fh,
                indent=2,
            )
        print(f"  transcript written   : {out}")
    return 0 if covered else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run(sys.argv[1], sys.argv[2])))
