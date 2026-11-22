# Idea: user-interview agent

Locked 2026-11-22 11:25. Working name: Fieldwork (from the skeleton, not confirmed).

**One line**: Give it your product's URL and it interviews real people out loud, then hands you the research report.

**Theme fit** ("an agent that does a real job from start to finish"): the job is a user researcher's. The agent writes the questions, runs the interviews, and writes the report, with no human step in between.

## Two sides

### Founder side (the platform)

- **Create a study**: add product context (website URL, description, PDF, or MCP connection) and what you want to learn. No sign-up for the demo.
- **Questions page**: the agent suggests 3 to 5 questions based on the product. The founder edits, adds, or removes them.
- **Share**: one link and one QR code per study.
- **Report**: interviews completed, themes with counts, and verbatim quotes that each play as an audio clip. It updates as interviews finish.
- **Design**: minimal. Only numbers that come from real interviews, no filler stats.

### Participant side

- Opens the link or scans the QR code on a phone. No sign-up.
- A voice interviewer asks the study's questions and follows up like a person would. One interview is 60 to 90 seconds.
- **On-screen character**: look and style are open and owned separately. It is a visual layer on top of the voice. The interview must work with the character missing.

## The agent loop

1. Product URL + goal → interview questions.
2. Link opened → voice interview with follow-ups.
3. Interview ends → transcript → themes and quotes with timestamps → report.

## Demo (3 minutes)

1. A judge types their own startup's URL and a goal. Questions appear.
2. The judge scans the QR code and is interviewed for about a minute on their phone.
3. The report updates on the laptop: a new theme, and the judge's own quote, which we play back.
4. We show the report from real strangers interviewed in the hall today.

## Scope

| Must work | Nice to have | Cut |
| --- | --- | --- |
| Create study from URL | Edit questions by hand | Payments |
| Voice interview on a phone | On-screen character | Recruiting participants |
| Report with themes and counts | Sign-up and accounts | Multiple languages |
| Runs on a judge's own input | | Exports and integrations |
| Quote audio clips, cheapest form | | |

If time runs short, things leave from the right.

**Quote audio clips** are must-work because the demo ends on the judge hearing their own voice. The cheapest form only: the full interview recording played from the quote's start, one play button, no audio cutting.

**Build order**: voice interview, text report, public URL, hall-strangers study, then clips. If time forces a choice, the strangers study comes first and the report shows quote text only.

## Stack

- **ElevenLabs**: the hosted voice agent runs the whole interview; its transcript and audio feed the report.
- **Wasp**: the study, interview, and quote records, and the background job that turns a finished interview into report entries.
- **Wasp check**: the skeleton compiles and typechecks (passed 11:58). Still owed: a phone loads the interview page over HTTPS with the mic working. If that fails, we move to a stack we know. Question generation and report synthesis are written as plain TypeScript modules so they move over unchanged.

## First risk to retire

A stranger finishes a 60 to 90 second interview on a phone in the hall's noise, with one sensible follow-up, and we can pull the transcript and audio back out to cut one quote clip. This comes before any dashboard work.

## Strangers (the bonus)

- Interview people in the hall about something they all did today, for example what broke while building on ElevenLabs. The report is then real research.
- Offer other teams: "get five user interviews on your hackathon project before judging".

## Prizes we are aiming at

Grand Prize or Best Use of ElevenLabs (they can't be combined), plus Best project built with Wasp.

## Open decisions

- The on-screen character: what it looks like (owned by track 4).
- The product name: confirm Fieldwork.
- Which question we ask the hall.
