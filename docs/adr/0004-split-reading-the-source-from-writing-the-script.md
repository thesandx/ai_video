# ADR-0004: Split reading the source from writing the script

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Application engineering

## Context

The product watches a reel and produces a script the reader can shoot. Those are two different jobs,
and they have different standards of correctness.

Reading the source is descriptive. It must be accurate: real timecodes, real shot sizes, real camera
moves. A wrong reading is a bug.

Writing the script is creative. It must be original. A script that retells the source, or reuses its
voiceover, its captions or its music, is not useful to the reader and is not ours to hand over. What
transfers between the two videos is craft: shot grammar, cutting rhythm, how the hook is set, the
shape of the structure.

Collapsing both into one instruction produces the failure we wanted to avoid. Asked simply to "make a
similar video", a model paraphrases the source. The output looks like a script and is really a copy.

## Decision

The two jobs are **named and separated at three levels**.

- In the prompt. `services/reel-director.ts` states both jobs, and states plainly what the second one
  must not reuse: the source's dialogue, captions, on-screen words, and any song lyrics.
- In the reply schema. `reading` is one object, `brief` and `script` are others.
- In the type system. `types/reel.ts` splits `ReelReading` from `CreativeBrief` and `ReelScript`, and
  the comment on that file records which half is descriptive and which is original work.

The brief also carries a `pointOfDifference` field. The model has to say, in writing, how the new
video departs from the source.

## Consequences

The boundary is visible to the next person who edits the prompt. A prompt string is easy to weaken by
accident; a type split is not.

Both jobs stay in one request. The writer needs the reading in working memory, and a second call would
pay to encode the video twice. The cost of one run on a short reel is a fraction of a cent, and most
of that is the video.

The user interface reflects the split. The reading is presented as analysis of the source. The script
is presented as the reader's own new work, and the footer says so.

We accept that this does not make the output novel by construction. It makes the instruction explicit,
the structure enforceable, and the difference reviewable. A reader who wants a copy can still ask a
model for one. This product does not offer that.
