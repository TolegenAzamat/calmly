# Calmly: an AI speaking partner that makes practice feel safe

*Leveraging AI Tools to Reduce Speaking Anxiety and Strengthen Communication Skills in Foreign Language Classrooms*

## The problem

Many language learners understand more English than they dare to say. In classrooms, the moments that matter most (an interview, a defence, a question from the audience) are also the ones with the highest social risk. Fear of making mistakes in front of others leads to silence, short answers and avoidance, which means the very practice that would help is skipped. A teacher cannot give every student private, judgement-free speaking time.

## The idea

Calmly is a web application where a student practises a real speaking situation by voice with an AI partner that is patient, always available and never embarrassed by a mistake. The partner stays in role and does not interrupt to correct. When the student chooses to finish, they receive a structured review that turns the conversation into concrete next steps.

The aim is not to replace the teacher or the classroom. It is to give students a low-stakes rehearsal space so that they arrive in the classroom, the interview room or the lecture hall having already said the words aloud at least once.

## What the student does

1. Chooses a situation: job interview, master's admission interview, presentation or project defence, small talk, or audience questions after a talk. Optionally adds their own topic or presentation text so the questions are specific.
2. Takes an optional 30-second guided breathing exercise.
3. Talks with the coach by voice (or types if the microphone is unavailable). Help is always one tap away: *I am stuck* offers ideas and phrases without writing the answer, and *Answer again* lets the student redo a reply without penalty.
4. Receives a review: a confidence index, an estimated CEFR level, corrections with short explanations, more natural phrases, a stronger version of one of their own answers, tips on delivery and structure, and topics to practise next. Explanations can be in English or Russian.

## Why it should help (pedagogical rationale)

- **Lowering the affective filter.** Anxiety, low motivation and low self-confidence can block language acquisition. Private practice without an audience removes the main source of social threat.
- **Delayed, structured feedback.** Correcting every error mid-sentence raises anxiety and breaks fluency. Calmly keeps the conversation flowing and gives feedback afterwards, when the student can read it calmly.
- **Gradual exposure.** Students can repeat a scenario as often as they like, move from small talk to higher-stakes situations, and see progress in their own delivery.
- **Self-efficacy through evidence.** Measured delivery signals (pace, filler phrases, pauses, time before answering) show students concrete change over time rather than a vague feeling.
- **Scaffolding.** Hints, sentence starters and calm-start breathing give support exactly when it is needed and can be dropped as confidence grows.

## How it works technically

- A static web front end (Vue 3) runs in the browser. Speech recognition and speech synthesis use the browser's built-in Web Speech API, so no audio is stored or handled by Calmly's own server.
- A single serverless function (Netlify) holds the AI provider key and builds all prompts on the server. The AI is a free-tier large language model hosted by Groq (Llama family); a fast model drives the conversation and a stronger model writes the review.
- Delivery metrics (speaking pace, filler phrases, long pauses, time before speaking) are measured in the browser and passed to the model as facts, so the written feedback is grounded in what actually happened.
- Version 1 has no accounts: only the student's first name is kept on their device, and conversations are not saved.

## Ethics, privacy and limits

- **Transparency.** The interface states that the confidence index and level are estimates from one conversation, not exam results, and that speech recognition may drop filler sounds.
- **Privacy.** No audio is stored by Calmly. Text is sent to an AI service to produce replies and the review, and students are told not to share sensitive personal details. Planned history features would store text and scores only, protected per user.
- **Fairness.** Speech recognition and language models can be less accurate for some accents. Feedback is worded as suggestions, recognition artefacts are excluded from corrections, and students can edit what was heard before relying on it.
- **Role of the teacher.** The tool supports practice and self-reflection. It is not a grading instrument.

## Relevance to educational leadership

Calmly is a small case study in introducing technology into learning environments responsibly: a clear pedagogical purpose, attention to student wellbeing, low cost and low barriers to access (free tools, no installation, no registration), transparency about limits, and a design that keeps teachers and classroom interaction at the centre.

## Possible evaluation

A small pilot with a class could compare students before and after a few weeks of use, for example with:

- the Foreign Language Classroom Anxiety Scale (a short validated questionnaire),
- a brief self-efficacy questionnaire about speaking,
- the session metrics Calmly already records (answer length, pace, fillers, hints used),
- short interviews about how safe the practice felt.

Results from a small pilot would be indicative, not conclusive, and should be reported with that caution.

## Next steps

Accounts and session history with a progress chart (text and scores only), a teacher view showing group trends without exposing individual conversations, more precise speech analysis, and further scenarios for the student's own course context.

## Background reading to verify before citing

- Horwitz, E. K., Horwitz, M. B., & Cope, J. (1986). Foreign language classroom anxiety. *The Modern Language Journal*.
- Krashen, S. D. (1982). *Principles and Practice in Second Language Acquisition* (the affective filter hypothesis).
- MacIntyre, P. D., & Gardner, R. C. (1994). The subtle effects of language anxiety on cognitive processing in the second language. *Language Learning*.

These are listed from memory as starting points. Check the exact details and find current research before using them in a formal application.
